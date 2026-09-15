/**
 * 核心类型定义 —— GameState 是全游戏唯一真相源。
 *
 * 铁律：
 * 1. 本包（@cozy-farm/core）不得依赖 Vue / Pinia / Phaser 任何 API
 * 2. GameState 必须始终是"纯 JSON 可序列化"的数据（无类实例、无函数、无循环引用）
 * 3. 所有时间字段一律使用 gameTime 坐标（见 systems/time.ts），禁止存现实时间戳
 *    （唯一的例外：lastSeen，仅用于离线结算换算）
 */

// ---------- 基础枚举 ----------

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'] as const;

/** 时间流速档位（0 = 暂停）。档位表见 constants.ts 的 SPEED_STEPS */
export type Speed = 0 | 1 | 2 | 5 | 10;

/** 地块状态机：荒地 → 耕地 → 生长中 → 成熟 →（收获）→ 耕地 */
export type TileState = 'wild' | 'tilled' | 'growing' | 'mature';

// ---------- 作物 ----------

export type CropId =
  | 'radish'    // 萝卜
  | 'wheat'     // 小麦
  | 'potato'    // 土豆
  | 'corn'      // 玉米
  | 'tomato'    // 番茄
  | 'eggplant'  // 茄子
  | 'pumpkin'   // 南瓜
  | 'watermelon'; // 西瓜

/** 作物静态配置（数值表见 config/crops.ts） */
export interface CropDef {
  id: CropId;
  name: string;
  season: Season;
  seedPrice: number;
  sellPrice: number;
  /** 生长所需的游戏毫秒数（gameTime 坐标） */
  growMs: number;
  /** 解锁等级 */
  unlockLevel: number;
}

// ---------- 地块 ----------

export interface Tile {
  id: number;
  state: TileState;
  /** 仅 state 为 growing/mature 时有效 */
  crop: CropId | null;
  /** 种下时刻（gameTime 坐标，主要用于详情与存档诊断） */
  plantedAt: number;
  /** 湿度保持到（gameTime 坐标）；过期则生长暂停，浇水后延长 */
  wateredUntil: number;
  /** 已累计的有效生长时长；断水期间不增加，补浇后从原进度继续 */
  grownMs: number;
  /** 上次结算生长进度的 gameTime 坐标 */
  lastGrowthAt: number;
}

// ---------- 存档根 ----------

export interface GameState {
  /** 存档结构版本，用于迁移 */
  version: number;
  createdAt: number;

  // ---- 时间（详见 systems/time.ts）----
  /** 游戏时钟（毫秒）。所有游戏逻辑的唯一时间源 */
  gameTime: number;
  /** 上次保存时的现实时间戳（仅离线结算用） */
  lastSeen: number;
  /** 上次的速度倍率 */
  speed: Speed;

  // ---- 玩家进度 ----
  gold: number;
  level: number;
  exp: number;

  // ---- 农场 ----
  tiles: Tile[];
  /** 已解锁的地块 id 列表（网格扩展用） */
  unlockedTileIds: number[];

  // ---- 后续系统占位（M2+ 逐步填充）----
  animals: unknown[];
  inventory: Partial<Record<string, number>>;
  npcs: Record<string, { favor: number; lastTalkDay: number }>;
  orders: unknown[];
  decorations: unknown[];
  collection: {
    crops: CropId[];
    dishes: string[];
    fish: string[];
  };
}

// ---------- 离线结算报告 ----------

export interface OfflineReport {
  /** 离线的现实时长（毫秒，已截断到上限） */
  realElapsedMs: number;
  maturedCrops: CropId[];
  /** 其它结算摘要行（动物产出/订单刷新等，M3+ 填充） */
  notes: string[];
}
