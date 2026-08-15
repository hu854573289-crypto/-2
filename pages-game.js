(() => {
  "use strict";
  const KEY = "wildsquad-github-pages-v1";
  const zones = ["风草原", "赤岩谷", "冰牙高地", "雾藤雨林", "星落荒原"];
  const enemies = ["尖牙豚", "刺藤怪", "石壳蜥", "火尾狐", "甲背犀", "裂刃螳螂", "沼泽蟒", "双角龙"];
  const adventureEvents = [
    { icon:"◈", title:"失落图腾", text:"古老图腾被藤蔓缠住，祖灵的低语从石缝中传来。", choices:[
      { id:"cleanse", label:"净化图腾", detail:"消耗兽骨，获得下一战增益", bones:-18, boon:.18, result:"芽芽净化了图腾，祖灵之风将守护下一场战斗。" },
      { id:"search", label:"搜寻石缝", detail:"安全获得贝币与琥珀", coins:260, amber:15, result:"小队在石缝中发现了远征队留下的补给。" }
    ]},
    { icon:"⌁", title:"流浪猎人", text:"一位负伤猎人愿意分享巨兽弱点，但需要药草作为交换。", choices:[
      { id:"trade", label:"交换情报", detail:"消耗贝币，强化下一战", coins:-220, boon:.24, result:"猎人标出了巨兽护甲的裂隙，下一战更容易破盾。" },
      { id:"escort", label:"护送回营", detail:"获得兽骨与队伍经验", bones:28, xp:55, result:"猎人安全抵达营火旁，留下了一袋兽骨作为谢礼。" }
    ]},
    { icon:"♨", title:"温泉兽径", text:"温热泉水能恢复体力，附近却留有新鲜的巨兽足印。", choices:[
      { id:"rest", label:"扎营休整", detail:"提高下一战续航", boon:.16, xp:35, result:"全队完成休整，治疗与护盾在下一战更加稳定。" },
      { id:"track", label:"追踪足印", detail:"冒险获得更多材料", bones:36, coins:150, result:"风团找到了巨兽蜕下的鳞片，换回了大量材料。" }
    ]},
    { icon:"✦", title:"星落裂谷", text:"琥珀碎片在裂谷底部闪光，狂风让每一步都充满风险。", choices:[
      { id:"climb", label:"攀下裂谷", detail:"获得琥珀，下一战压力上升", amber:35, boon:-.08, result:"小队带回琥珀，但攀爬消耗了不少体力。" },
      { id:"mark", label:"标记路线", detail:"稳妥获得战术增益", boon:.2, result:"石墩固定了绳索，队伍从容绕过了危险地形。" }
    ]}
  ];
  const petPool = [
    { id:"stone", name:"石墩", glyph:"犀", role:"战士", rarity:"稀有", color:"#5a9fc6", base:285 },
    { id:"bud", name:"芽芽", glyph:"鹿", role:"萨满", rarity:"稀有", color:"#66b86b", base:270 },
    { id:"wind", name:"风团", glyph:"鹰", role:"猎人", rarity:"稀有", color:"#d89a3e", base:305 },
    { id:"fire", name:"火豆", glyph:"狐", role:"术士", rarity:"稀有", color:"#9a70c4", base:300 },
    { id:"shell", name:"壳壳", glyph:"龟", role:"战士", rarity:"史诗", color:"#5a9fc6", base:430 },
    { id:"dew", name:"露角", glyph:"麋", role:"萨满", rarity:"史诗", color:"#66b86b", base:415 },
    { id:"flash", name:"闪翎", glyph:"隼", role:"猎人", rarity:"史诗", color:"#d89a3e", base:455 },
    { id:"ice", name:"冰尾", glyph:"狼", role:"术士", rarity:"史诗", color:"#9a70c4", base:448 },
    { id:"horn", name:"熔角", glyph:"龙", role:"战士", rarity:"传说", color:"#5a9fc6", base:650 },
    { id:"sun", name:"日歌", glyph:"鸟", role:"萨满", rarity:"传说", color:"#66b86b", base:625 },
    { id:"star", name:"星爪", glyph:"豹", role:"猎人", rarity:"传说", color:"#d89a3e", base:690 },
    { id:"mist", name:"雾团", glyph:"熊", role:"术士", rarity:"传说", color:"#9a70c4", base:680 }
  ];
  const defaultState = () => ({
    version:2, name:"荒野队长", level:1, xp:0, stage:1, coins:1280, amber:120, bones:45, horns:10,
    auto:true, speed:1, pity:0, pulls:0, lastFree:"", lastSeen:Date.now(), lastClaim:Date.now(),
    skills:[{id:"break",name:"破甲骨矛",level:1},{id:"interrupt",name:"战吼打断",level:1},{id:"burst",name:"野火爆发",level:0}],
    order:["break","interrupt","burst"], active:["stone","bud","wind","fire"],
    pets:petPool.slice(0,4).map(p=>({...p,level:1,stars:1,shards:0})),
    gear:[
      {id:"g1",name:"骨刃",slot:"武器",rarity:"稀有",power:68,level:1,equipped:true},
      {id:"g2",name:"兽皮衣",slot:"护甲",rarity:"普通",power:34,level:1,equipped:true}
    ], results:[], lastLog:"营火已点燃，小队准备出发。", wins:0,
    battleReport:null, eventChoices:{}, boonPower:0, boonLabel:""
  });
  function load(){
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw) return defaultState();
      return {...defaultState(),...raw,version:2,skills:raw.skills || defaultState().skills,order:raw.order || defaultState().order,pets:raw.pets || defaultState().pets,gear:raw.gear || defaultState().gear,eventChoices:raw.eventChoices || {}};
    } catch { return defaultState(); }
  }
  let state = load();
  let tab = "home";
  let battleTimer = null;
  const $ = id => document.getElementById(id);
  const fmt = n => Math.floor(Math.max(0,n)).toLocaleString("zh-CN");
  const today = () => new Date().toISOString().slice(0,10);
  const zone = () => zones[Math.min(zones.length-1,Math.floor((state.stage-1)/20))];
  const stageType = (stage=state.stage) => stage%5===0?"boss":stage%5===4?"elite":stage%5===3?"event":"normal";
  const enemy = () => `${enemies[(state.stage-1)%enemies.length]}${stageType()==="boss"?"·巨兽":stageType()==="elite"?"·精英":""}`;
  const encounterName = () => stageType()==="event"?adventureEvents[Math.floor((state.stage-3)/5)%adventureEvents.length].title:enemy();
  const encounterLabel = type => ({normal:"普通战斗",elite:"精英狩猎",boss:"巨兽讨伐",event:"冒险事件"}[type]);
  const title = () => state.level>=30?"巨兽猎人":state.level>=15?"驯兽师":state.level>=6?"寻路者":"拾火者";
  const petPower = pet => Math.floor(pet.base*(1+(pet.level-1)*.075)*(1+(pet.stars-1)*.22)*(pet.rarity==="传说"?2.5:pet.rarity==="史诗"?1.8:1.35));
  const power = () => Math.floor(1220+state.level*140+state.skills.reduce((s,x)=>s+x.level*85,0)+activePets().reduce((s,p)=>s+petPower(p),0)+state.gear.filter(g=>g.equipped).reduce((s,g)=>s+g.power,0));
  const effectivePower = () => Math.floor(power()*(1+state.boonPower));
  const enemyPower = () => Math.floor(760*Math.pow(1.115,state.stage-1)*(stageType()==="boss"?1.28:stageType()==="elite"?1.12:1));
  const activePets = () => state.active.map(id=>state.pets.find(p=>p.id===id)).filter(Boolean);
  const skill = id => state.skills.find(item=>item.id===id);
  function mechanicChecks(){
    const checks=[
      {name:"破盾",active:true,ok:skill("break").level>0&&state.order.indexOf("break")<2,hint:"将破甲骨矛放在前两位"},
      {name:"打断",active:true,ok:skill("interrupt").level>0&&state.order.indexOf("interrupt")<2,hint:"将战吼打断放在前两位"},
      {name:"续航",active:state.stage>=10,ok:activePets().some(p=>p.role==="萨满"),hint:"上阵一名萨满稳定治疗"},
      {name:"爆发",active:state.stage>=15,ok:skill("burst").level>0&&state.order.indexOf("burst")<3,hint:"升级野火爆发并加入序列"}
    ];
    return checks.filter(item=>item.active);
  }
  function routeNodes(){
    const base=Math.floor((state.stage-1)/5)*5;
    return [1,2,3,4,5].map(n=>{const stage=base+n,type=stageType(stage);const label=type==="event"?"?":type==="elite"?"精":type==="boss"?"兽":stage;return `<span class="${stage===state.stage?"current":""} ${type}" title="${encounterLabel(type)}">${label}</span>`}).join("");
  }
  function reportHtml(){
    if(!state.battleReport)return "";
    const r=state.battleReport;
    return `<section class="report card ${r.result==="失败"?"failed":"won"}"><div class="report-title"><span>${r.result==="失败"?"!":"✓"}</span><div><small>第 ${r.stage} 关战报</small><h2>${r.result} · ${r.enemy}</h2></div></div><p>${r.reason}</p><strong>${r.advice}</strong></section>`;
  }
  function save(){ state.lastSeen=Date.now(); localStorage.setItem(KEY,JSON.stringify(state)); updateHeader(); }
  function notify(text){ const el=$("toast"); el.textContent=text; el.classList.add("show"); clearTimeout(notify.timer); notify.timer=setTimeout(()=>el.classList.remove("show"),2100); }
  function updateHeader(){
    $("playerName").textContent=state.name; $("playerLevel").textContent=`${title()} · Lv.${state.level}`;
    $("coins").textContent=fmt(state.coins); $("amber").textContent=fmt(state.amber); $("bones").textContent=fmt(state.bones); $("horns").textContent=fmt(state.horns);
  }
  function petHtml(p,compact=false){ return `<div class="pet" style="--pet:${p.color}"><span>${p.glyph}</span><b>${p.name}</b>${compact?"":`<small>Lv.${p.level}</small>`}</div>`; }
  function heading(kicker,name,right=""){ return `<div class="heading"><div><p>${kicker}</p><h1>${name}</h1></div>${right}</div>`; }
  function home(){
    const seconds=Math.max(0,Math.min(43200,Math.floor((Date.now()-state.lastClaim)/1000)));
    const reward=Math.floor(seconds*(8+state.stage*1.35)/60);
    const regionProgress=Math.min(100,Math.floor(((state.stage-1)%30)/30*100));
    return `${heading(`第 ${state.stage} 关 · ${encounterLabel(stageType())}`,zone(),`<span class="chip">战力 ${fmt(power())}</span>`)}
      <section class="hero card"><div class="hero-copy"><p>原野正在呼唤下一支远征队</p><h1>${zone()}</h1><strong>${fmt(power())}</strong><button data-tab="battle">继续推图 ›</button></div><img src="./public/assets/hero-character.webp" alt="原野队长"></section>
      <section class="party card"><div><b>原野小队</b><small>1战士 · 1萨满 · 2输出</small></div>${activePets().map(p=>petHtml(p,true)).join("")}</section>
      <section class="adventure-summary card"><div><small>第一远征区 · 30 个节点</small><b>下一站：${encounterName()}</b></div><div class="progress"><i style="width:${regionProgress}%"></i></div><strong>${Math.min(30,(state.stage-1)%30)}/30</strong></section>
      <section class="idle card"><span>🔥</span><div><h2>${Math.floor(seconds/3600)}小时 ${Math.floor(seconds%3600/60)}分</h2><small>离线巡猎最多积累 12 小时 · 预计 ${fmt(reward)} 贝币</small></div><button data-action="claim-idle">收取</button></section>
      <section class="quick"><button data-action="daily"><span>☀</span><b>部落签到</b><small>领取补给</small></button><button data-tab="summon"><span>🐾</span><b>灵宠召唤</b><small>${state.lastFree!==today()?"今日免费":`保底 ${80-state.pity} 抽`}</small></button><button data-tab="bag"><span>▣</span><b>远征背包</b><small>${state.gear.length} 件装备</small></button><button data-tab="team"><span>🏕</span><b>小队养成</b><small>技能与灵宠</small></button></section>`;
  }
  function eventPage(){
    const event=adventureEvents[Math.floor((state.stage-3)/5)%adventureEvents.length];
    return `${heading(`第 ${state.stage} 关 · 冒险事件`,zone(),`<span class="chip">选择会改变下一战</span>`)}
      <section class="event-card card"><div class="event-icon">${event.icon}</div><small>选择 · 代价 · 结果</small><h1>${event.title}</h1><p>${event.text}</p><div class="event-choices">${event.choices.map(choice=>{const blocked=(choice.coins<0&&state.coins<-choice.coins)||(choice.bones<0&&state.bones<-choice.bones);return `<button data-action="event" data-id="${choice.id}" ${blocked?"disabled":""}><b>${choice.label}</b><small>${blocked?"资源不足 · ":""}${choice.detail}</small></button>`}).join("")}</div></section>
      <section class="route card"><h2>远征路线</h2><div class="nodes">${routeNodes()}</div><p class="route-help">普通战斗 → 冒险事件 → 精英狩猎 → 巨兽讨伐</p></section>`;
  }
  function battle(){
    if(stageType()==="event")return eventPage();
    const type=stageType(),boss=type==="boss",adv=effectivePower()>=enemyPower(),checks=boss?mechanicChecks():[];
    return `${heading(`${encounterLabel(type)} · 第 ${state.stage} 关`,zone(),`<span class="chip">${adv?"战力优势":"战术挑战"}</span>`)}
      <div class="battle-grid"><section class="arena card"><div class="arena-top"><span>我方 ${fmt(effectivePower())}</span><b>${enemy()}</b><span>敌方 ${fmt(enemyPower())}</span></div><div class="fighters"><div class="squad">${activePets().map(p=>petHtml(p)).join("")}</div><div class="vs">VS</div><div class="monster"><span>${boss?"兽":type==="elite"?"精":"野"}</span><b>${enemy()}</b></div></div><div class="battle-log">${state.boonLabel?`${state.boonLabel} · `:""}${state.lastLog}</div></section>
      <aside class="side"><div class="controls"><button class="${state.auto?"on":""}" data-action="toggle-auto">∞ ${state.auto?"持续自动":"开始自动"}</button><button data-action="speed">» ${state.speed}× 速度</button></div>
      <section class="route card"><h2>远征路线</h2><div class="nodes">${routeNodes()}</div></section>
      ${boss?`<section class="mechanics card"><h2>巨兽机制诊断</h2><div class="tactic-list">${checks.map(item=>`<span class="${item.ok?"done":"miss"}">${item.ok?"✓":"!"} ${item.name}</span>`).join("")}</div><small>${checks.every(item=>item.ok)?"技能序列完整，可以稳定处理机制。":checks.filter(item=>!item.ok).map(item=>item.hint).join("；")}</small></section>`:""}</aside></div>${reportHtml()}`;
  }
  function team(){
    return `${heading("四人组队养成","原野小队",`<span class="chip">总战力 ${fmt(power())}</span>`)}
      <section class="formation card">${activePets().map(p=>`<article>${petHtml(p)}<strong>${p.role}</strong><small>战力 ${fmt(petPower(p))} · ${"★".repeat(p.stars)}</small></article>`).join("")}</section>
      <div class="actions"><button data-action="train">全队训练<br><small>贝币 ${fmt(180*Math.pow(1.12,state.level-1))}</small></button><button data-action="breakthrough">部落突破<br><small>兽骨 ${90+state.level*4}</small></button></div>
      <section class="skills card"><b>自动出手顺序</b><div class="skill-order">${state.order.map((id,i)=>{const s=state.skills.find(x=>x.id===id);return `<button data-action="prioritize" data-id="${id}">${i+1} · ${s.name}</button>`}).join("")}</div>
      ${state.skills.map((s,i)=>`<div class="skill-row"><span>${["破","吼","火"][i]}</span><div><b>${s.name}</b><small>${["击碎巨兽护盾","打断巨兽蓄力","破盾后集中爆发"][i]}</small></div><button data-action="skill" data-id="${s.id}">Lv.${s.level} +</button></div>`).join("")}</section>
      <section class="roster card">${state.pets.sort((a,b)=>petPower(b)-petPower(a)).map(p=>`<article>${petHtml(p,true)}<div><b>${p.rarity} · ${p.role}</b><br><small>战力 ${fmt(petPower(p))} · 碎片 ${p.shards}</small></div><button data-action="star" data-id="${p.id}">升星</button></article>`).join("")}</section>`;
  }
  function summon(){
    const free=state.lastFree!==today();
    return `${heading("祖灵足迹与透明保底","灵宠召唤",`<span class="chip">传说保底 ${80-state.pity}</span>`)}
      <section class="summon-banner card"><div><span>🐾</span><h2>追随祖灵，结识新的伙伴</h2><p>十连必得史诗或更高灵宠，80 抽内必得传说灵宠</p></div></section>
      <div class="summon-actions"><button data-action="summon" data-count="1">召唤 1 次<br><small>${free?"今日免费":state.horns?"号角 ×1":"琥珀 ×120"}</small></button><button data-action="summon" data-count="10">召唤 10 次<br><small>${state.horns>=10?"号角 ×10":"琥珀 ×1,080"} · 必得史诗+</small></button></div>
      ${state.results.length?`<section class="results">${state.results.map(r=>`<article><span>${r.glyph}</span><b>${r.name}</b><small>${r.rarity}</small><em>${r.isNew?"NEW":`碎片 +${r.shards}`}</em></article>`).join("")}</section>`:""}`;
  }
  function bag(){
    return `${heading("装备与养成资源","远征背包",`<button class="primary" data-action="best">一键最优</button>`)}
      <section class="gear card">${state.gear.map(g=>`<article><div><b>${g.name}</b><br><small>${g.rarity} · ${g.slot} · Lv.${g.level} · 战力 +${fmt(g.power)}</small></div><button data-action="forge" data-id="${g.id}">${g.equipped?"磨砺":"装备"}</button></article>`).join("")}</section>
      <section class="idle card"><span>⬡</span><div><h2>养成材料</h2><small>兽骨 ${fmt(state.bones)} · 祖灵号角 ${fmt(state.horns)} · 灵宠图鉴 ${state.pets.length}/12</small></div></section>`;
  }
  function render(){
    clearInterval(battleTimer); updateHeader();
    $("view").innerHTML=({home,battle,team,summon,bag}[tab])();
    document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    if(tab==="battle"&&state.auto&&stageType()!=="event") battleTimer=setInterval(runBattle,state.speed===2?1700:3100);
  }
  function runBattle(){
    if(stageType()==="event")return;
    const currentStage=state.stage,currentEnemy=enemy(),type=stageType(),boss=type==="boss",checks=boss?mechanicChecks():[],missed=checks.filter(item=>!item.ok);
    const ratio=effectivePower()/enemyPower();
    const mechanicPenalty=missed.length*(boss ? .14 : 0);
    const win=ratio>=1.3&&missed.length===0||Math.random()<Math.max(.06,Math.min(.96,.47+(ratio-1)*.68-mechanicPenalty-(type==="elite"?.05:0)));
    if(!win){
      let reason,advice;
      if(missed.length){reason=`${missed[0].name}处理失败，${currentEnemy}抓住技能空窗发动了致命攻击。`;advice=missed[0].hint;}
      else if(!activePets().some(p=>p.role==="萨满")){reason="治疗空窗过长，前排倒下后输出位失去保护。";advice="在小队页上阵萨满，或提高现有治疗灵宠的等级。";}
      else if(ratio<.9){reason=`敌方重击穿透了护甲，前排在第二轮技能前倒下。`;advice="磨砺已装备护甲，训练小队后再次挑战。";}
      else {reason="爆发技能落在破盾窗口之外，未能在巨兽狂暴前结束战斗。";advice="把破甲与打断放在技能序列前两位。";}
      state.lastLog=`远征失败：${reason}`;
      state.battleReport={result:"失败",stage:currentStage,enemy:currentEnemy,reason,advice};
      state.boonPower=0;state.boonLabel="";save();render();return;
    }
    const coins=Math.floor((48+state.stage*14)*(boss?2.8:type==="elite"?1.65:1));
    state.coins+=coins;state.bones+=Math.floor((3+state.stage*.8)*(boss?2:1));state.xp+=28+state.stage*6;state.wins++;
    if(state.xp>=120+state.level*32){state.xp=0;state.level++;state.pets.forEach(p=>p.level=Math.max(p.level,state.level));}
    if(Math.random()<(boss ? .65 : .16)){const slots=["武器","护甲","图腾环","护身符"],names=["雷牙矛","岩鳞甲","星纹指环","祖灵护符"];const i=Math.floor(Math.random()*4);state.gear.unshift({id:`g${Date.now()}`,name:names[i],slot:slots[i],rarity:boss?"史诗":"稀有",power:55+state.stage*13,level:1,equipped:false});}
    const victoryReason=boss?"破甲骨矛击碎护盾，战吼精准打断蓄力。":type==="elite"?"小队稳住治疗节奏，在精英狂暴前完成集火。":`${currentEnemy} 已被击退，获得 ${fmt(coins)} 贝币。`;
    state.lastLog=victoryReason;
    state.battleReport={result:"胜利",stage:currentStage,enemy:currentEnemy,reason:victoryReason,advice:boss?"机制执行完整，下一只巨兽会加入新的战术要求。":"继续推进，冒险事件会影响下一场战斗。"};
    state.boonPower=0;state.boonLabel="";state.stage++;save();render();
  }
  function resolveEvent(id){
    const currentStage=state.stage,event=adventureEvents[Math.floor((state.stage-3)/5)%adventureEvents.length],choice=event.choices.find(item=>item.id===id);
    if(!choice)return;
    if(choice.coins<0&&state.coins<-choice.coins){notify("贝币不足");return;}
    if(choice.bones<0&&state.bones<-choice.bones){notify("兽骨不足");return;}
    state.coins+=choice.coins||0;state.bones+=choice.bones||0;state.amber+=choice.amber||0;state.xp+=choice.xp||0;
    state.boonPower=choice.boon||0;state.boonLabel=choice.boon?`${choice.boon>0?"祖灵祝福":"疲惫"} ${choice.boon>0?"+":""}${Math.round(choice.boon*100)}% 战力`:"";
    state.eventChoices[currentStage]=choice.id;state.lastLog=choice.result;state.battleReport=null;state.stage++;
    save();notify("选择已记录，远征继续");render();
  }
  function doSummon(count){
    const free=count===1&&state.lastFree!==today(); const cost=count===10?1080:120; const keys=!free&&state.horns>=count;
    if(!free&&!keys&&state.amber<cost){notify("琥珀或号角不足");return;}
    if(free)state.lastFree=today();else if(keys)state.horns-=count;else state.amber-=cost;
    const out=[];
    for(let i=0;i<count;i++){state.pity++;const guaranteed=state.pity>=80;const epicGuarantee=count===10&&i===9&&!out.some(x=>x.rarity!=="稀有");const roll=Math.random();const rarity=guaranteed||roll<.02?"传说":epicGuarantee||roll<.14?"史诗":"稀有";if(rarity==="传说")state.pity=0;const pool=petPool.filter(p=>p.rarity===rarity);const tpl=pool[Math.floor(Math.random()*pool.length)];const existing=state.pets.find(p=>p.id===tpl.id);const shards=rarity==="传说"?40:rarity==="史诗"?20:10;if(existing)existing.shards+=shards;else state.pets.push({...tpl,level:state.level,stars:1,shards:0});out.push({...tpl,isNew:!existing,shards:existing?shards:0});}
    state.results=out;state.pulls+=count;save();notify(out.some(x=>x.rarity==="传说")?"传说灵宠加入营地！":"召唤完成");render();
  }
  document.addEventListener("click",event=>{
    const el=event.target.closest("button");if(!el)return;
    if(el.dataset.tab){tab=el.dataset.tab;render();return;}
    const action=el.dataset.action,id=el.dataset.id;
    if(action==="claim-idle"){const sec=Math.min(43200,Math.floor((Date.now()-state.lastClaim)/1000));const gain=Math.floor(sec*(8+state.stage*1.35)/60);state.coins+=gain;state.bones+=Math.floor(gain/90);state.lastClaim=Date.now();save();notify(`收取 ${fmt(gain)} 贝币`);render();}
    if(action==="event"){resolveEvent(id);return;}
    if(action==="daily"){const key=`wildsquad-daily-${today()}`;if(localStorage.getItem(key)){notify("今日已经领取");return;}localStorage.setItem(key,"1");state.coins+=600;state.amber+=30;save();notify("部落补给已领取");render();}
    if(action==="toggle-auto"){state.auto=!state.auto;save();render();}
    if(action==="speed"){state.speed=state.speed===1?2:1;save();render();}
    if(action==="train"){const cost=Math.floor(180*Math.pow(1.12,state.level-1));if(state.coins<cost){notify("贝币不足");return;}state.coins-=cost;state.level++;state.pets.forEach(p=>p.level=Math.max(p.level,state.level));save();notify("全队等级提升");render();}
    if(action==="breakthrough"){const cost=90+state.level*4;if(state.bones<cost){notify("兽骨不足");return;}state.bones-=cost;state.level+=2;save();notify("部落称号提升");render();}
    if(action==="prioritize"){state.order=[id,...state.order.filter(x=>x!==id)];save();notify("已设为优先技能");render();}
    if(action==="skill"){const s=state.skills.find(x=>x.id===id);const cost=300+s.level*180;if(state.coins<cost){notify("贝币不足");return;}state.coins-=cost;s.level++;save();notify(`${s.name} 已升级`);render();}
    if(action==="star"){const p=state.pets.find(x=>x.id===id),cost=p.stars*20;if(p.shards<cost){notify(`需要 ${cost} 个碎片`);return;}p.shards-=cost;p.stars++;save();notify(`${p.name} 升星成功`);render();}
    if(action==="summon")doSummon(Number(el.dataset.count));
    if(action==="best"){const slots={};state.gear.sort((a,b)=>b.power-a.power).forEach(g=>{g.equipped=!slots[g.slot];if(g.equipped)slots[g.slot]=1});save();notify("已装备最高战力组合");render();}
    if(action==="forge"){const g=state.gear.find(x=>x.id===id);if(!g.equipped){state.gear.filter(x=>x.slot===g.slot).forEach(x=>x.equipped=false);g.equipped=true;save();notify("装备已更换");render();return;}const cost=120+g.level*80;if(state.coins<cost){notify("贝币不足");return;}state.coins-=cost;g.level++;g.power=Math.floor(g.power*1.16+8);save();notify("装备磨砺成功");render();}
  });
  const away=Math.min(43200,Math.floor((Date.now()-state.lastSeen)/1000));if(away>60)notify(`小队离线巡猎了 ${Math.floor(away/60)} 分钟`);
  updateHeader();render();
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./pages-sw.js").catch(()=>{});
})();
