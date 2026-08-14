/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyBattleResult, applyHeroUpgrade, applyRealmUpgrade, canFreeSummon,
  claimDailyLogin, claimIdleReward, claimQuest, companionPower,
  createDefaultGameState, enemyForStage, enemyPowerForStage, equipBest,
  equipItem, forgeEquipment, heroUpgradeCost, idleReward, migrateGameState,
  moveSkillFirst, realmUpgradeCost, setActiveCompanion, simulateBattle, summonCompanions,
  upgradeCompanionStar, upgradeSkill, xpNeeded,
} from "@/lib/game-state";
import { formatDuration, formatNumber, RARITY_META, ROLE_META, SLOT_META, ZONES } from "@/lib/game-data";
import type { BattleResult, CloudSaveEnvelope, CompanionState, GameState, GameTab, SaveSnapshot, SummonResult } from "@/lib/game-types";

const STORAGE_KEY = "wildsquad-save-v5";
const LEGACY_STORAGE_KEYS = ["cloudrealm-save-v4", "cloudrealm-save-v3", "cloudrealm-save-v2", "cloudrealm-save-v1"];
const TAB_META: { id: GameTab; icon: string; label: string }[] = [
  { id: "home", icon: "⌂", label: "营地" },
  { id: "adventure", icon: "⚔", label: "战斗" },
  { id: "team", icon: "♟", label: "小队" },
  { id: "summon", icon: "✦", label: "召唤" },
  { id: "bag", icon: "▣", label: "背包" },
];

type Props = { player: { displayName: string } | null };
type CloudStatus = "guest" | "loading" | "synced" | "saving" | "offline" | "conflict";
type SheetType = "cloud" | "settings" | "leaderboard";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function GameClient({ player }: Props) {
  const initial = useMemo(() => createDefaultGameState(0, player?.displayName ?? "荒野队长"), [player?.displayName]);
  const [state, setState] = useState<GameState>(initial);
  const [clock, setClock] = useState(0);
  const [tab, setTab] = useState<GameTab>("home");
  const [ready, setReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(player ? "loading" : "guest");
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [battleRound, setBattleRound] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetType | null>(null);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([]);
  const [leaders, setLeaders] = useState<{ rank: number; name: string; power: number; stage: number; level: number }[]>([]);
  const [summonReveal, setSummonReveal] = useState<SummonResult[]>([]);
  const [bagType, setBagType] = useState<"gear" | "materials" | "shards">("gear");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const revisionRef = useRef(0);
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const vibrate = useCallback(() => {
    if (stateRef.current.settings.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }, []);

  const mutate = useCallback((recipe: (current: GameState) => GameState, message?: string) => {
    setState((current) => {
      const next = recipe(current);
      if (next !== current) { dirtyRef.current = true; stateRef.current = next; }
      return next;
    });
    if (message) notify(message);
    vibrate();
  }, [notify, vibrate]);

  const loadCloud = useCallback(async () => {
    if (!player) return false;
    try {
      setCloudStatus("loading");
      const response = await fetch("/api/game", { cache: "no-store" });
      if (!response.ok) throw new Error("cloud unavailable");
      const payload = await response.json() as CloudSaveEnvelope;
      const loaded = migrateGameState(payload.state, payload.serverTime, payload.player.displayName);
      setClock(payload.serverTime);
      revisionRef.current = payload.revision;
      setState(loaded); stateRef.current = loaded; dirtyRef.current = false;
      setCloudStatus("synced");
      if (idleReward(loaded, payload.serverTime).seconds >= 60) setOfflineOpen(true);
      return true;
    } catch { setCloudStatus("offline"); return false; }
  }, [player]);

  const saveCloud = useCallback(async (reason = "autosave") => {
    if (!player || savingRef.current || !dirtyRef.current) return;
    savingRef.current = true;
    setCloudStatus("saving");
    const candidate = { ...stateRef.current, lastSavedAt: Date.now() };
    try {
      const response = await fetch("/api/game", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: candidate, expectedRevision: revisionRef.current, reason }) });
      if (response.status === 409) { setCloudStatus("conflict"); notify("检测到另一设备的新进度，正在安全合并"); await loadCloud(); return; }
      if (!response.ok) throw new Error("save failed");
      const payload = await response.json() as { revision: number };
      revisionRef.current = payload.revision; dirtyRef.current = false; setCloudStatus("synced");
    } catch { setCloudStatus("offline"); } finally { savingRef.current = false; }
  }, [loadCloud, notify, player]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      let loadedFromCloud = false;
      if (player) loadedFromCloud = await loadCloud();
      if (!loadedFromCloud && !cancelled) {
        let loadedLocal = false;
        try {
          const key = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].find((candidate) => localStorage.getItem(candidate));
          const cached = key ? localStorage.getItem(key) : null;
          if (cached) {
            const local = migrateGameState(JSON.parse(cached), Date.now(), player?.displayName ?? "荒野队长");
            setState(local); stateRef.current = local; loadedLocal = true;
            if (idleReward(local, Date.now()).seconds >= 60) setOfflineOpen(true);
          }
        } catch { /* Corrupt local data falls back to a fresh save. */ }
        if (!loadedLocal) { const fresh = createDefaultGameState(Date.now(), player?.displayName ?? "荒野队长"); setState(fresh); stateRef.current = fresh; }
      }
      if (!cancelled) { setClock(Date.now()); setReady(true); }
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    boot();
    return () => { cancelled = true; };
  }, [loadCloud, player]);

  useEffect(() => {
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => { if (!ready) return; const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, [ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [ready, state]);
  useEffect(() => {
    if (!ready || !player) return;
    const interval = setInterval(() => void saveCloud("autosave"), 8000);
    const onVisibility = () => { if (document.visibilityState === "hidden") void saveCloud("background"); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [player, ready, saveCloud]);

  useEffect(() => {
    if (!ready || !state.progress.autoChallenge) return;
    const duration = state.progress.battleSpeed === 2 ? 1750 : 3200;
    const timer = setTimeout(() => {
      const result = simulateBattle(stateRef.current);
      setBattle(result); setBattleRound((round) => round + 1);
      mutate((current) => applyBattleResult(current, result, Date.now()));
      if (result.loot) notify(`小队发现：${result.loot.name}`);
    }, duration);
    return () => clearTimeout(timer);
  }, [battleRound, mutate, notify, ready, state.progress.autoChallenge, state.progress.battleSpeed]);

  const currentZone = ZONES[Math.min(ZONES.length - 1, Math.floor((state.progress.stage - 1) / 20))];
  const reward = idleReward(state, clock);
  const nextEnemyPower = enemyPowerForStage(state.progress.stage);
  const activeTeam = state.team.activeIds.map((id) => state.team.roster.find((member) => member.id === id)).filter((member): member is CompanionState => Boolean(member));
  const syncLabel = cloudStatus === "synced" ? "云端已同步" : cloudStatus === "saving" ? "正在保存" : cloudStatus === "loading" ? "加载云存档" : cloudStatus === "guest" ? "游客存档" : cloudStatus === "conflict" ? "正在合并" : "离线保护中";

  function claimIdle() {
    const before = idleReward(stateRef.current, Date.now());
    mutate((current) => claimIdleReward(current, Date.now()), `领取 ${formatNumber(before.gold)} 贝币 · ${before.essence} 兽骨`);
    setOfflineOpen(false); void saveCloud("idle-claim");
  }

  function doSummon(count: 1 | 10) {
    const outcome = summonCompanions(stateRef.current, count, Date.now());
    if (outcome.error) { notify("召唤资源不足：可使用号角或琥珀"); return; }
    stateRef.current = outcome.state; dirtyRef.current = true; setState(outcome.state); setSummonReveal(outcome.results);
    notify(outcome.results.some((result) => result.rarity === "legendary") ? "远古金光！传说灵宠加入营地" : `完成 ${count} 次灵宠召唤`);
    vibrate(); void saveCloud("summon");
  }

  async function openCloud() {
    setSheet("cloud");
    if (!player) return;
    try { const response = await fetch("/api/game/snapshots", { cache: "no-store" }); const payload = await response.json() as { snapshots?: SaveSnapshot[] }; setSnapshots(payload.snapshots ?? []); }
    catch { notify("暂时无法读取存档历史"); }
  }

  async function openLeaderboard() {
    setSheet("leaderboard");
    try { const response = await fetch("/api/leaderboard", { cache: "no-store" }); const payload = await response.json() as { leaders?: typeof leaders }; setLeaders(payload.leaders ?? []); }
    catch { notify("排行榜暂未连接"); }
  }

  async function restoreSnapshot(id: string) {
    if (!player || !confirm("恢复后，当前进度也会先自动备份。确定继续吗？")) return;
    try {
      const response = await fetch("/api/game/snapshots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId: id, expectedRevision: revisionRef.current }) });
      if (!response.ok) throw new Error("restore failed");
      await loadCloud(); notify("存档已安全恢复"); setSheet(null);
    } catch { notify("恢复失败，请稍后重试"); }
  }

  async function installGame() {
    if (!installPrompt) { notify("可在浏览器菜单中选择“添加到主屏幕”"); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") { notify("已添加到主屏幕"); setInstallPrompt(null); }
  }

  return <div className={`game-shell ${state.settings.lowMotion ? "low-motion" : ""}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar"><button className="player-pill" onClick={() => setSheet("settings")} aria-label="打开玩家设置"><span className="avatar">原</span><span><b>{state.profile.name}</b><small>{state.profile.realmName} · Lv.{state.profile.level} · 四人小队</small></span></button><div className="game-title"><b>原野小队</b><small>巨兽远征</small></div><button className={`sync-pill ${cloudStatus}`} onClick={openCloud} aria-label="打开云存档"><span className="sync-dot" /> {syncLabel}</button></header>
    <div className="resource-bar" aria-label="玩家资源"><Resource icon="◉" label="贝币" value={state.currencies.gold} /><Resource icon="◆" label="琥珀" value={state.currencies.jade} /><Resource icon="◇" label="兽骨" value={state.currencies.essence} /><Resource icon="⌁" label="号角" value={state.currencies.keys} /></div>
    <section className="screen" key={tab}>
      {tab === "home" && <HomeView state={state} reward={reward} currentZone={currentZone} activeTeam={activeTeam} freeSummon={canFreeSummon(state, clock)} onClaimIdle={claimIdle} onDaily={() => mutate(claimDailyLogin, "签到奖励已领取")} onCloud={openCloud} onLeaderboard={openLeaderboard} onAdventure={() => setTab("adventure")} onTeam={() => setTab("team")} onSummon={() => setTab("summon")} onBag={() => setTab("bag")} onClaimQuest={(id) => mutate((current) => claimQuest(current, id), "任务奖励已收入背包")} />}
      {tab === "adventure" && <AdventureView state={state} battle={battle} activeTeam={activeTeam} nextEnemyPower={nextEnemyPower} currentZone={currentZone} onToggleAuto={() => mutate((current) => ({ ...current, progress: { ...current.progress, autoChallenge: !current.progress.autoChallenge } }))} onSpeed={() => mutate((current) => ({ ...current, progress: { ...current.progress, battleSpeed: current.progress.battleSpeed === 1 ? 2 : 1 } }))} />}
      {tab === "team" && <TeamView state={state} onUpgrade={() => mutate(applyHeroUpgrade, "全队等级与基础属性提升")} onRealm={() => { mutate(applyRealmUpgrade, "部落声望提升，全队属性增长"); void saveCloud("realm-upgrade"); }} onSkill={(id) => mutate((current) => upgradeSkill(current, id), "队长技能已升级")} onPrioritize={(id) => mutate((current) => moveSkillFirst(current, id), "技能已调整为优先释放")} onActivate={(id) => mutate((current) => setActiveCompanion(current, id), "小队阵容已更新")} onStar={(id) => mutate((current) => upgradeCompanionStar(current, id), "灵宠成功升星")} />}
      {tab === "summon" && <SummonView state={state} results={summonReveal} free={canFreeSummon(state, clock)} onSummon={doSummon} />}
      {tab === "bag" && <BagView state={state} type={bagType} onType={setBagType} onEquip={(id) => mutate((current) => equipItem(current, id), "装备已更换")} onBest={() => mutate(equipBest, "已装备当前最高战力组合")} onForge={(id) => mutate((current) => forgeEquipment(current, id), "磨砺成功，装备战力提升")} />}
    </section>
    <nav className="bottom-nav" aria-label="主要导航">{TAB_META.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined}><span>{item.icon}</span><small>{item.label}</small>{item.id === "summon" && canFreeSummon(state, clock) && <i />}</button>)}</nav>
    {!ready && <div className="loading-cover"><span className="loading-seal">原</span><p>正在点燃营火，集结小队</p><div className="loading-line"><i /></div></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
    {offlineOpen && <OfflineModal reward={reward} maxHours={state.idle.maxHours} onClaim={claimIdle} onClose={() => setOfflineOpen(false)} />}
    {sheet && <BottomSheet type={sheet} player={player} state={state} snapshots={snapshots} leaders={leaders} installAvailable={Boolean(installPrompt)} onInstall={installGame} onClose={() => setSheet(null)} onRestore={restoreSnapshot} onSettings={(key) => mutate((current) => ({ ...current, settings: { ...current.settings, [key]: !current.settings[key] } }))} />}
  </div>;
}

function Resource({ icon, label, value }: { icon: string; label: string; value: number }) {
  return <div className="resource"><span>{icon}</span><div><small>{label}</small><b>{formatNumber(value)}</b></div></div>;
}

function MemberAvatar({ member, compact = false }: { member: CompanionState; compact?: boolean }) {
  const role = ROLE_META[member.role];
  return <div className={`member-avatar rarity-${member.rarity} ${compact ? "compact" : ""}`} style={{ "--role-color": role.color } as React.CSSProperties}><span>{member.glyph}</span><i>{role.short}</i><b>{member.name}</b><small>Lv.{member.level}</small></div>;
}

function HomeView({ state, reward, currentZone, activeTeam, freeSummon, onClaimIdle, onDaily, onCloud, onLeaderboard, onAdventure, onTeam, onSummon, onBag, onClaimQuest }: {
  state: GameState; reward: ReturnType<typeof idleReward>; currentZone: (typeof ZONES)[number]; activeTeam: CompanionState[]; freeSummon: boolean;
  onClaimIdle: () => void; onDaily: () => void; onCloud: () => void; onLeaderboard: () => void; onAdventure: () => void; onTeam: () => void; onSummon: () => void; onBag: () => void; onClaimQuest: (id: string) => void;
}) {
  const xpProgress = Math.min(100, state.profile.xp / xpNeeded(state.profile.level) * 100);
  const claimable = state.quests.filter((quest) => !quest.claimed && quest.progress >= quest.target).slice(0, 2);
  return <div className="view home-view">
    <section className="world-card">
      <div className="world-copy"><p className="eyebrow">第 {state.progress.stage} 关 · {currentZone.subtitle}</p><h1>{currentZone.name}</h1><div className="power-line"><span>小队战力</span><b>{formatNumber(state.profile.power)}</b></div><button className="primary-btn" onClick={onAdventure}>继续推图 <span>›</span></button></div>
      <img className="hero-character" src="/assets/hero-character.webp" alt="原野小队队长" /><div className="world-gradient" /><div className="xp-strip"><span style={{ width: `${xpProgress}%` }} /><small>队伍经验 {state.profile.xp}/{xpNeeded(state.profile.level)}</small></div>
    </section>
    <button className="party-strip" onClick={onTeam} aria-label="打开四人小队"><span className="party-label"><b>原野小队</b><small>1战士 · 1萨满 · 2输出</small></span>{activeTeam.map((member) => <MemberAvatar key={member.id} member={member} compact />)}<em>›</em></button>
    <section className="idle-card"><div className="idle-orb"><span>🔥</span><i /></div><div className="idle-copy"><p>营火挂机收益</p><h2>{formatDuration(reward.seconds)}</h2><small>离线 12 小时内持续巡猎</small></div><div className="idle-reward"><span>◉ {formatNumber(reward.gold)}</span><span>◇ {reward.essence}</span></div><button onClick={onClaimIdle} disabled={reward.seconds < 2}>收取</button></section>
    <section className="quick-grid"><button onClick={onDaily} className={state.daily.loginClaimed ? "done" : ""}><span className="quick-icon warm">☀</span><b>部落签到</b><small>{state.daily.loginClaimed ? "今日已领取" : "领取补给"}</small></button><button onClick={onSummon}><span className="quick-icon violet">🐾</span><b>灵宠召唤</b><small>{freeSummon ? "今日免费" : `保底 ${80 - state.summon.pity} 抽`}</small></button><button onClick={onBag}><span className="quick-icon blue">▣</span><b>背包</b><small>{state.equipment.inventory.length} 件装备</small></button><button onClick={onLeaderboard}><span className="quick-icon teal">🏕</span><b>部落榜</b><small>小队排行</small></button></section>
    {claimable.length > 0 && <section className="claim-panel"><div><b>可领取任务</b><small>完成冒险目标即可领取</small></div>{claimable.map((quest) => <button key={quest.id} onClick={() => onClaimQuest(quest.id)}><span>{quest.title}</span><em>领取</em></button>)}</section>}
    <section className="realm-card"><div><p className="eyebrow">部落称号</p><h3>{state.profile.realmName}</h3><small>{state.profile.title} · 四人协作加成已激活</small></div><div className="realm-rings"><i /><i /><i /><span>{state.profile.realm + 1}</span></div><button className="cloud-mini" onClick={onCloud}>☁ 云端保护</button></section>
  </div>;
}

function AdventureView({ state, battle, activeTeam, nextEnemyPower, currentZone, onToggleAuto, onSpeed }: { state: GameState; battle: BattleResult | null; activeTeam: CompanionState[]; nextEnemyPower: number; currentZone: (typeof ZONES)[number]; onToggleAuto: () => void; onSpeed: () => void }) {
  const advantaged = state.profile.power >= nextEnemyPower;
  return <div className="view adventure-view">
    <div className="section-heading"><div><p className="eyebrow">自动推图 · 第 {state.progress.stage} 关</p><h1>{currentZone.name}</h1></div><span className={`threat ${advantaged ? "safe" : "danger"}`}>{advantaged ? "战力优势" : "需要养成"}</span></div>
    <section className="party-battle-card"><div className="battle-bg" /><div className="battle-top"><span>我方 {formatNumber(state.profile.power)}</span><b>{enemyForStage(state.progress.stage)}</b><span>敌方 {formatNumber(nextEnemyPower)}</span></div><div className="party-combatants"><div className="battle-party">{activeTeam.map((member, index) => <div key={member.id} className={`battle-member member-${index}`}><MemberAvatar member={member} /><span className="hp"><i /></span></div>)}</div><div className="versus"><b>VS</b><i className={state.progress.autoChallenge ? "spinning" : ""}>✦</i></div><div className="boss-unit"><div className="enemy-core"><i /><span>{state.progress.stage % 5 === 0 ? "兽" : "野"}</span></div><b>{enemyForStage(state.progress.stage)}</b></div></div><div className="battle-progress"><span key={`${state.progress.stage}-${state.progress.battleSpeed}`} className={state.progress.autoChallenge ? "running" : ""} style={{ animationDuration: state.progress.battleSpeed === 2 ? "1.75s" : "3.2s" }} /></div><div className="battle-log">{battle?.log.slice(-2).map((line, index) => <span key={`${line}-${index}`}>{line}</span>) ?? <span>战士顶住正面，萨满与猎人已经就位…</span>}</div></section>
    <div className="battle-controls"><button className={state.progress.autoChallenge ? "active" : ""} onClick={onToggleAuto}><span>∞</span><b>{state.progress.autoChallenge ? "持续自动挑战" : "开始自动挑战"}</b></button><button onClick={onSpeed}><span>»</span><b>{state.progress.battleSpeed}× 速度</b></button></div>
    {state.progress.stage % 5 === 0 && <section className="mechanic-panel"><div><b>巨兽机制</b><small>按预设技能顺序自动执行</small></div><span className={battle?.mechanics.shieldBroken ? "done" : ""}>破盾</span><span className={battle?.mechanics.interrupted ? "done" : ""}>打断</span><span className={battle?.mechanics.cleansed ? "done" : ""}>净化</span><span className={battle?.mechanics.burst ? "done" : ""}>爆发</span></section>}
    <section className="zone-path"><div className="card-heading"><h2>远征路线</h2><small>每 5 关挑战巨兽</small></div><div className="path-line">{Array.from({ length: 5 }).map((_, index) => { const stage = Math.floor((state.progress.stage - 1) / 5) * 5 + index + 1; return <div key={stage} className={stage < state.progress.stage ? "cleared" : stage === state.progress.stage ? "current" : ""}><span>{index === 4 ? "兽" : stage}</span><small>{index === 4 ? "巨兽" : ""}</small></div>; })}</div></section>
    <section className="reward-preview"><div><span>◉</span><b>自动贝币</b><small>+{formatNumber(48 + state.progress.stage * 14)}</small></div><div><span>◇</span><b>兽骨</b><small>+{Math.floor(3 + state.progress.stage * .8)}</small></div><div><span>▣</span><b>装备掉落</b><small>{state.progress.stage % 5 === 0 ? "巨兽宝箱" : "概率获得"}</small></div></section>
  </div>;
}

function TeamView({ state, onUpgrade, onRealm, onSkill, onPrioritize, onActivate, onStar }: { state: GameState; onUpgrade: () => void; onRealm: () => void; onSkill: (id: string) => void; onPrioritize: (id: string) => void; onActivate: (id: string) => void; onStar: (id: string) => void }) {
  const levelCost = heroUpgradeCost(state.profile.level);
  const realmCost = realmUpgradeCost(state.profile.realm);
  const active = state.team.activeIds.map((id) => state.team.roster.find((member) => member.id === id)).filter((member): member is CompanionState => Boolean(member));
  return <div className="view team-view"><div className="section-heading"><div><p className="eyebrow">四人组队养成</p><h1>原野小队</h1></div><div className="power-badge"><small>总战力</small><b>{formatNumber(state.profile.power)}</b></div></div>
    <section className="formation-card"><div className="formation-title"><b>当前阵容</b><small>战士承伤 · 萨满续航 · 双输出破敌</small></div><div className="formation-grid">{active.map((member) => <article key={member.id} className={`companion-card active rarity-${member.rarity}`}><MemberAvatar member={member} /><div><b>{member.name}</b><small>{ROLE_META[member.role].label} · {member.skillName}</small><em>战力 {formatNumber(companionPower(member))}</em></div><span>{"★".repeat(member.stars)}</span></article>)}</div></section>
    <div className="upgrade-grid"><button onClick={onUpgrade} disabled={state.currencies.gold < levelCost}><span>全队训练</span><b>等级同步提升</b><small>◉ {formatNumber(levelCost)}</small></button><button className="realm-upgrade" onClick={onRealm} disabled={state.currencies.essence < realmCost}><span>小队突破</span><b>{state.profile.realmName} → 下一境</b><small>♢ {formatNumber(realmCost)}</small></button></div>
    <section className="skill-order-card"><div><b>自动出手顺序</b><small>点击技能可放到第一位，克制巨兽机制</small></div><ol>{state.hero.skillOrder.map((id, index) => { const skill = state.hero.skills.find((entry) => entry.id === id)!; return <li key={id}><button onClick={() => onPrioritize(id)}><em>{index + 1}</em><span>{skill.name}</span></button></li>; })}</ol></section>
    <section className="skills-card"><div className="card-heading"><h2>队长技能</h2><span>技能点 {state.hero.skillPoints}</span></div>{state.hero.skills.map((skill, index) => <div className="skill-row" key={skill.id}><div className={`skill-icon skill-${index}`}>{index === 0 ? "破" : index === 1 ? "吼" : "火"}</div><div><b>{skill.name}</b><small>{skill.description}</small><div className="skill-dots">{Array.from({ length: 6 }).map((_, dot) => <i key={dot} className={dot < Math.ceil(skill.level / 2) ? "filled" : ""} />)}</div></div><button onClick={() => onSkill(skill.id)} disabled={state.hero.skillPoints <= 0 || skill.level >= skill.maxLevel}>Lv.{skill.level}<span>+</span></button></div>)}</section>
    <div className="inventory-heading"><h2>灵宠名册</h2><small>{state.team.roster.length} 只</small></div><section className="roster-list">{[...state.team.roster].sort((a, b) => companionPower(b) - companionPower(a)).map((member) => { const isActive = state.team.activeIds.includes(member.id); const starCost = member.stars * 20; return <article key={member.id} className={`roster-item rarity-${member.rarity}`}><MemberAvatar member={member} /><div><p><b>{member.name}</b><span style={{ color: RARITY_META[member.rarity].color }}>{RARITY_META[member.rarity].label}</span></p><small>{ROLE_META[member.role].label} · {member.skillName}</small><em>战力 {formatNumber(companionPower(member))} · 碎片 {member.shards}/{starCost}</em></div><div><button disabled={isActive} onClick={() => onActivate(member.id)}>{isActive ? "已上阵" : "上阵"}</button><button disabled={member.shards < starCost || member.stars >= 6} onClick={() => onStar(member.id)}>{member.stars >= 6 ? "满星" : "升星"}</button></div></article>; })}</section>
  </div>;
}

function SummonView({ state, results, free, onSummon }: { state: GameState; results: SummonResult[]; free: boolean; onSummon: (count: 1 | 10) => void }) {
  const singleCost = free ? "今日免费" : state.currencies.keys >= 1 ? "号角 ×1" : "琥珀 ×120";
  const tenCost = state.currencies.keys >= 10 ? "号角 ×10" : "琥珀 ×1,080";
  return <div className="view summon-view"><div className="section-heading"><div><p className="eyebrow">灵宠与职业搭配</p><h1>祖灵召唤</h1></div><span className="pity-chip">传说保底 {80 - state.summon.pity}</span></div>
    <section className="summon-banner"><div className="summon-sky"><i /><i /><i /><span>🐾</span></div><div className="summon-copy"><p>追随祖灵足迹，结识新的灵宠</p><h2>战士 · 萨满 · 猎人 · 术士</h2><small>十连必得史诗或更高灵宠，80 抽内必得传说灵宠</small></div><div className="pity-line"><span style={{ width: `${state.summon.pity / 80 * 100}%` }} /></div></section>
    <div className="summon-actions"><button onClick={() => onSummon(1)}><b>召唤 1 次</b><small>{singleCost}</small></button><button className="ten-pull" onClick={() => onSummon(10)}><b>召唤 10 次</b><small>{tenCost} · 必得史诗+</small></button></div>
    {results.length > 0 && <section className="summon-results"><div className="card-heading"><h2>本次召唤</h2><small>{results.filter((result) => result.isNew).length} 只新灵宠</small></div><div className="result-grid">{results.map((result, index) => <article key={`${result.id}-${index}`} className={`rarity-${result.rarity}`}><span>{result.glyph}</span><b>{result.name}</b><small style={{ color: RARITY_META[result.rarity].color }}>{RARITY_META[result.rarity].label} · {ROLE_META[result.role].label}</small><em>{result.isNew ? "NEW" : `碎片 +${result.shards}`}</em></article>)}</div></section>}
    <section className="summon-info"><div><b>{state.summon.totalPulls}</b><small>累计召唤</small></div><div><b>{state.team.roster.length}</b><small>灵宠图鉴</small></div><div><b>{state.summon.pity}</b><small>当前保底进度</small></div></section>
  </div>;
}

function BagView({ state, type, onType, onEquip, onBest, onForge }: { state: GameState; type: "gear" | "materials" | "shards"; onType: (value: "gear" | "materials" | "shards") => void; onEquip: (id: string) => void; onBest: () => void; onForge: (id: string) => void }) {
  const items = [...state.equipment.inventory].sort((a, b) => b.power - a.power);
  const shardMembers = state.team.roster.filter((member) => member.shards > 0).sort((a, b) => b.shards - a.shards);
  return <div className="view bag-view"><div className="section-heading"><div><p className="eyebrow">物品分类与养成资源</p><h1>远征背包</h1></div>{type === "gear" && <button className="mini-primary" onClick={onBest}>一键最优</button>}</div><div className="segmented three"><button className={type === "gear" ? "active" : ""} onClick={() => onType("gear")}>装备</button><button className={type === "materials" ? "active" : ""} onClick={() => onType("materials")}>材料</button><button className={type === "shards" ? "active" : ""} onClick={() => onType("shards")}>灵宠碎片</button></div>
    {type === "gear" && <><section className="equipment-slots">{Object.entries(SLOT_META).map(([slot, meta]) => { const equippedId = state.equipment.equipped[slot as keyof typeof state.equipment.equipped]; const item = state.equipment.inventory.find((entry) => entry.id === equippedId); return <div key={slot} className={item ? `rarity-${item.rarity}` : "empty"}><span>{meta.glyph}</span><small>{meta.label}</small><b>{item?.name ?? "未装备"}</b><em>{item ? `+${formatNumber(item.power)}` : "待探索"}</em></div>; })}</section><div className="inventory-heading"><h2>装备仓库</h2><small>{items.length}/250</small></div><section className="inventory-list">{items.map((item) => { const equipped = state.equipment.equipped[item.slot] === item.id; const forgeCost = Math.floor(120 * Math.pow(1.14, item.level - 1)); return <article key={item.id} className={`inventory-item rarity-${item.rarity}`}><div className="item-glyph">{SLOT_META[item.slot].glyph}</div><div className="item-copy"><p><b>{item.name}</b><span style={{ color: RARITY_META[item.rarity].color }}>{RARITY_META[item.rarity].label}</span></p><small>Lv.{item.level} · 战力 +{formatNumber(item.power)}</small></div><div className="item-actions">{!equipped && <button onClick={() => onEquip(item.id)}>装备</button>}<button onClick={() => onForge(item.id)} disabled={state.currencies.gold < forgeCost}>磨砺</button>{equipped && <em>已装备</em>}</div></article>; })}</section></>}
    {type === "materials" && <section className="material-grid"><Material icon="⬡" name="磨砺石" count={state.bag.forgeStones} description="用于高阶装备强化" /><Material icon="◒" name="灵宠口粮" count={state.bag.petFood} description="用于灵宠培养" /><Material icon="卷" name="技能图腾" count={state.bag.skillScrolls} description="用于小队技能研习" /><Material icon="⌁" name="祖灵号角" count={state.currencies.keys} description="灵宠召唤消耗" /></section>}
    {type === "shards" && <section className="shard-list">{shardMembers.length ? shardMembers.map((member) => <article key={member.id} className={`rarity-${member.rarity}`}><MemberAvatar member={member} compact /><div><b>{member.name}碎片</b><small>{ROLE_META[member.role].label} · 用于灵宠升星</small></div><strong>{member.shards}</strong></article>) : <div className="empty-bag">重复召唤灵宠后，会在这里获得升星碎片</div>}</section>}
  </div>;
}

function Material({ icon, name, count, description }: { icon: string; name: string; count: number; description: string }) {
  return <article><span>{icon}</span><div><b>{name}</b><small>{description}</small></div><strong>{formatNumber(count)}</strong></article>;
}

function OfflineModal({ reward, maxHours, onClaim, onClose }: { reward: ReturnType<typeof idleReward>; maxHours: number; onClaim: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="挂机收益"><div className="offline-modal"><button className="modal-close" onClick={onClose}>×</button><div className="offline-glow"><span>🔥</span><i /><i /></div><p className="eyebrow">小队持续巡猎</p><h2>欢迎回到营地</h2><small>离线 {formatDuration(reward.seconds)}，队友已经整理好战利品</small><div className="offline-loot"><div><span>◉</span><b>{formatNumber(reward.gold)}</b><small>贝币</small></div><div><span>◇</span><b>{formatNumber(reward.essence)}</b><small>兽骨</small></div></div><button className="primary-btn full" onClick={onClaim}>收入背包</button><em>挂机收益最多累积 {maxHours} 小时</em></div></div>;
}

function BottomSheet({ type, player, state, snapshots, leaders, installAvailable, onInstall, onClose, onRestore, onSettings }: { type: SheetType; player: Props["player"]; state: GameState; snapshots: SaveSnapshot[]; leaders: { rank: number; name: string; power: number; stage: number; level: number }[]; installAvailable: boolean; onInstall: () => void; onClose: () => void; onRestore: (id: string) => void; onSettings: (key: keyof GameState["settings"]) => void }) {
  return <div className="sheet-backdrop" onClick={onClose}><section className="bottom-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><button className="modal-close" onClick={onClose}>×</button>
    {type === "cloud" && <><p className="eyebrow">数据安全中心</p><h2>云端存档</h2>{player ? <><div className="cloud-summary"><span className="cloud-big">☁</span><div><b>当前小队进度已受保护</b><small>第 {state.progress.bestStage} 关 · 战力 {formatNumber(state.profile.power)}</small></div><i>已连接</i></div><div className="snapshot-title"><b>自动恢复点</b><small>保留最近 12 份</small></div><div className="snapshot-list">{snapshots.length ? snapshots.map((snapshot) => <div key={snapshot.id}><span>↺</span><p><b>第 {snapshot.stage} 关 · Lv.{snapshot.level}</b><small>{new Date(snapshot.createdAt).toLocaleString("zh-CN")} · {snapshot.reason}</small></p><button onClick={() => onRestore(snapshot.id)}>恢复</button></div>) : <div className="empty-state">完成几次冒险后会自动生成可恢复存档</div>}</div></> : <div className="signin-card"><span>☁</span><h3>登录后开启跨设备云存档</h3><p>游客进度保存在当前设备；登录后，换手机也能继续。</p><a href="/signin-with-chatgpt?return_to=%2F">使用 ChatGPT 登录</a></div>}</>}
    {type === "settings" && <><p className="eyebrow">玩家设置</p><h2>远征档案</h2><div className="profile-sheet"><span>原</span><div><b>{state.profile.name}</b><small>{player ? "已绑定云端身份" : "游客模式"}</small></div>{player ? <a href="/signout-with-chatgpt?return_to=%2F">退出</a> : null}</div><button className="install-game-btn" onClick={onInstall}><span>📲</span><div><b>{installAvailable ? "安装《原野小队》" : "添加到手机主屏幕"}</b><small>全屏启动，像手游一样随时继续</small></div><em>›</em></button><div className="settings-list"><Setting label="背景音乐" description="环境音轨开关" checked={state.settings.music} onClick={() => onSettings("music")} /><Setting label="触感反馈" description="关键操作提供轻微震动" checked={state.settings.haptics} onClick={() => onSettings("haptics")} /><Setting label="减少动效" description="适合省电或易晕动用户" checked={state.settings.lowMotion} onClick={() => onSettings("lowMotion")} /></div><div className="version-note"><b>存档结构 v{state.schemaVersion}</b><small>旧存档自动迁移，更新不会覆盖进度</small></div></>}
    {type === "leaderboard" && <><p className="eyebrow">全服小队排行</p><h2>部落榜</h2><div className="leader-list">{leaders.length ? leaders.map((leader) => <div key={`${leader.rank}-${leader.name}`}><span className={`rank rank-${leader.rank}`}>{leader.rank}</span><p><b>{leader.name}</b><small>Lv.{leader.level} · 第 {leader.stage} 关</small></p><strong>{formatNumber(leader.power)}</strong></div>) : <div className="empty-state">各支原野小队正在汇聚</div>}</div></>}
  </section></div>;
}

function Setting({ label, description, checked, onClick }: { label: string; description: string; checked: boolean; onClick: () => void }) {
  return <button className="setting-row" onClick={onClick}><span><b>{label}</b><small>{description}</small></span><i className={checked ? "on" : ""}><em /></i></button>;
}
