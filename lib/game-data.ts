import type { CompanionRole, CompanionState, GearSlot, Rarity } from "./game-types";

export const REALMS = [
  "拾火者", "寻路者", "驯兽师", "守望者", "巨兽猎人", "部落勇士", "荒野先驱", "原野之星", "远征传奇",
] as const;

export const ZONES = [
  { name: "风草原", subtitle: "长牙兽的足迹", accent: "#88c95f" },
  { name: "赤岩谷", subtitle: "滚烫岩壁", accent: "#e98a46" },
  { name: "冰牙高地", subtitle: "暴雪迁徙线", accent: "#79bde8" },
  { name: "雾藤雨林", subtitle: "会呼吸的密林", accent: "#49aa78" },
  { name: "星落荒原", subtitle: "远古巨兽巢", accent: "#e5bd5e" },
] as const;

export const ENEMIES = [
  "尖牙豚", "刺藤怪", "石壳蜥", "火尾狐", "甲背犀",
  "长喙鸟", "裂刃螳螂", "沼泽蟒", "双角龙", "星陨巨兽",
] as const;

export const SLOT_META: Record<GearSlot, { label: string; glyph: string }> = {
  weapon: { label: "武器", glyph: "◇" },
  armor: { label: "护甲", glyph: "⬡" },
  ring: { label: "图腾环", glyph: "○" },
  charm: { label: "护身符", glyph: "✦" },
};

export const RARITY_META: Record<Rarity, { label: string; color: string; multiplier: number }> = {
  common: { label: "普通", color: "#8b9a82", multiplier: 1 },
  rare: { label: "稀有", color: "#479ddb", multiplier: 1.35 },
  epic: { label: "史诗", color: "#9a6ad6", multiplier: 1.8 },
  legendary: { label: "传说", color: "#e59a2d", multiplier: 2.5 },
};

export const ROLE_META: Record<CompanionRole, { label: string; short: string; color: string }> = {
  guardian: { label: "战士", short: "盾", color: "#5a9fc6" },
  healer: { label: "萨满", short: "愈", color: "#66b86b" },
  ranger: { label: "猎人", short: "猎", color: "#d89a3e" },
  mage: { label: "术士", short: "术", color: "#9a70c4" },
};

export const COMPANION_POOL: Omit<CompanionState, "level" | "stars" | "shards">[] = [
  { id: "comp-iron-mountain", name: "石墩", role: "guardian", rarity: "rare", basePower: 285, skillName: "厚皮嘲吼", glyph: "犀" },
  { id: "comp-moon-healer", name: "芽芽", role: "healer", rarity: "rare", basePower: 270, skillName: "青草治愈", glyph: "鹿" },
  { id: "comp-wind-hunter", name: "风团", role: "ranger", rarity: "rare", basePower: 305, skillName: "连珠飞羽", glyph: "鹰" },
  { id: "comp-spark-mage", name: "火豆", role: "mage", rarity: "rare", basePower: 300, skillName: "火种喷吐", glyph: "狐" },
  { id: "comp-tide-warden", name: "壳壳", role: "guardian", rarity: "epic", basePower: 430, skillName: "潮壳壁垒", glyph: "龟" },
  { id: "comp-dew-sage", name: "露角", role: "healer", rarity: "epic", basePower: 415, skillName: "雨林复苏", glyph: "麋" },
  { id: "comp-falcon", name: "闪翎", role: "ranger", rarity: "epic", basePower: 455, skillName: "裂空箭雨", glyph: "隼" },
  { id: "comp-frost-mage", name: "冰尾", role: "mage", rarity: "epic", basePower: 448, skillName: "霜息冻结", glyph: "狼" },
  { id: "comp-dragon-guard", name: "熔角", role: "guardian", rarity: "legendary", basePower: 650, skillName: "远古不灭", glyph: "龙" },
  { id: "comp-sun-priest", name: "日歌", role: "healer", rarity: "legendary", basePower: 625, skillName: "太阳鼓舞", glyph: "鸟" },
  { id: "comp-star-archer", name: "星爪", role: "ranger", rarity: "legendary", basePower: 690, skillName: "陨星突袭", glyph: "豹" },
  { id: "comp-void-mage", name: "雾团", role: "mage", rarity: "legendary", basePower: 680, skillName: "迷雾吞噬", glyph: "熊" },
];

export const ITEM_NAMES: Record<GearSlot, string[]> = {
  weapon: ["石矛", "骨刃", "雷牙矛", "星火战锤"],
  armor: ["兽皮衣", "岩鳞甲", "猛犸战衣", "远古龙铠"],
  ring: ["草绳环", "牙骨环", "星纹指环", "巨兽图腾环"],
  charm: ["羽毛符", "暖石坠", "祖灵护符", "原野之心"],
};

export const formatNumber = (value: number) => {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe >= 1_000_000_000) return `${(safe / 1_000_000_000).toFixed(2)}B`;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(2)}M`;
  if (safe >= 10_000) return `${(safe / 1_000).toFixed(1)}K`;
  return Math.floor(safe).toLocaleString("zh-CN");
};

export const formatDuration = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${secs}秒`;
  return `${secs}秒`;
};
