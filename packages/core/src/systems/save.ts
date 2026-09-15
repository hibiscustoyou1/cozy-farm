/**
 * SaveSystem —— 存档的序列化 / 校验 / 版本迁移（方案 v2 §三 P0、§5.3）
 *
 * 职责边界：本文件只做"纯数据变换"（JSON 文本 ⇄ GameState），不碰任何
 * 存储 API —— localStorage 双写轮换在 app 层（save/storage.ts），
 * 这样解析与迁移逻辑可以脱离浏览器单测。
 *
 * 双写轮换的信封（envelope）也定义在此：localStorage 每个槽位存的
 * 不是裸 GameState，而是带 seq 序号的信封 —— seq 单调递增，
 * 读档时取两槽中 seq 更大的有效档，写入时轮换槽位。
 * 这样即使一次写入中途损坏（断电/杀进程），另一槽还保有上一份完整存档。
 */

import { SAVE_VERSION, SPEED_STEPS } from '../constants';
import { CROPS } from '../config/crops';
import { createInitialState } from './state';
import type { GameState, Tile } from '../types';

// ---------- 信封 ----------

/** localStorage 双写槽位标识 */
export type SaveSlot = 'a' | 'b';

/** localStorage 每个槽位实际写入的结构 */
export interface SaveEnvelope {
  slot: SaveSlot;
  /** 保存序号，全局单调递增 —— 双槽比对新旧的唯一依据 */
  seq: number;
  /** 现实保存时刻（仅诊断展示，不参与游戏逻辑） */
  savedAt: number;
  state: GameState;
}

/** parseSave 的成功结果 */
export interface ParsedSave {
  state: GameState;
  /** 迁移前的版本号；null = 未发生迁移 */
  migratedFrom: number | null;
  /** 信封 seq（裸 GameState 导入时为 0） */
  seq: number;
  savedAt: number;
}

// ---------- 序列化 ----------

/**
 * 把 GameState 序列化为可存储/可导出的 JSON 文本。
 * GameState 本身保证纯 JSON 可序列化（types.ts 铁律 2），这里只做兜底检查。
 */
export function serializeSave(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * 为下一次写入构造信封：seq 接续两槽中的最大值 +1，槽位轮换。
 * @param state   要保存的游戏状态（调用方应已刷新 lastSeen）
 * @param prevMaxSeq 两槽中最大的已有 seq（无档时 0）
 * @param prevSlot 上一次写入的槽位（用于轮换；无档时传 'b' 使首写落 'a'）
 */
export function makeEnvelope(
  state: GameState,
  prevMaxSeq: number,
  prevSlot: SaveSlot,
): SaveEnvelope {
  return {
    slot: prevSlot === 'a' ? 'b' : 'a',
    seq: prevMaxSeq + 1,
    savedAt: Date.now(),
    state,
  };
}

/** 解析 localStorage 槽位里的信封文本（只解 JSON 与信封形状，state 校验交给 parseSave） */
export function parseEnvelope(raw: string | null): SaveEnvelope | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // JSON 损坏 —— 双写的另一槽就是为此准备的
  }
  if (typeof data !== 'object' || data === null) return null;
  const env = data as Record<string, unknown>;
  if (env.slot !== 'a' && env.slot !== 'b') return null;
  // Number.isInteger 不收窄 unknown，先 typeof 收窄再校验整数
  const seq = env.seq;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null;
  if (typeof env.savedAt !== 'number') return null;
  return { slot: env.slot, seq, savedAt: env.savedAt, state: env.state as GameState };
}

// ---------- 版本迁移 ----------

/**
 * 迁移链：MIGRATIONS[i] 把 version 从 i+1 升到 i+2。
 * 存档结构变更时递增 SAVE_VERSION 并在此追加函数（AGENT.md 约定）。
 * 返回 null 表示数据不满足该版本的最小形状，整档判无效。
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown> | null;

const MIGRATIONS: readonly Migration[] = [
  /**
   * v1 → v2：v1 是开发期未定版结构（version 字段缺失或为 1），
   * 字段与 v2 大体一致。策略：以 v2 初始结构为模板浅合并补全，
   * 旧档已有的值一律保留。
   */
  (data) => {
    // 最小形状预检：v1 时代就存在的核心字段必须类型正确，
    // 否则垃圾数据会被模板"洗白"成一份合法新档（单测踩过的坑）
    if (typeof data.gameTime !== 'number' || !Number.isFinite(data.gameTime)) return null;
    if (!Array.isArray(data.tiles)) return null;
    const template = createInitialState();
    return { ...template, ...data, version: SAVE_VERSION };
  },
];

// ---------- 校验 ----------

const TILE_STATES: readonly string[] = ['wild', 'tilled', 'growing', 'mature'];
const CROP_IDS: ReadonlySet<string> = new Set(Object.values(CROPS).map((c) => c.id));

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidTile(v: unknown): v is Tile {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    Number.isInteger(t.id) &&
    typeof t.state === 'string' &&
    TILE_STATES.includes(t.state) &&
    (t.crop === null || (typeof t.crop === 'string' && CROP_IDS.has(t.crop))) &&
    isFiniteNumber(t.plantedAt) &&
    isFiniteNumber(t.wateredUntil)
  );
}

/**
 * 核心字段校验：类型不对即判整档无效（宁可回退另一槽/新档，也不带病运行）。
 * 占位系统字段（animals/orders 等 M2+ 才定型的）宽松处理，由 repairSave 补全。
 */
function isValidGameState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    s.version === SAVE_VERSION &&
    isFiniteNumber(s.createdAt) &&
    isFiniteNumber(s.gameTime) &&
    isFiniteNumber(s.lastSeen) &&
    typeof s.speed === 'number' &&
    (SPEED_STEPS as readonly number[]).includes(s.speed) &&
    isFiniteNumber(s.gold) &&
    Number.isInteger(s.level) &&
    Number.isInteger(s.exp) &&
    Array.isArray(s.tiles) &&
    s.tiles.every(isValidTile) &&
    Array.isArray(s.unlockedTileIds) &&
    s.unlockedTileIds.every((id) => Number.isInteger(id))
  );
}

/** 补全可缺省的占位系统字段，避免旧档/手改档在 M2+ 系统接入时炸 undefined */
function repairSave(s: GameState): GameState {
  return {
    ...s,
    animals: Array.isArray(s.animals) ? s.animals : [],
    inventory:
      typeof s.inventory === 'object' && s.inventory !== null
        ? s.inventory
        : {},
    npcs: typeof s.npcs === 'object' && s.npcs !== null ? s.npcs : {},
    orders: Array.isArray(s.orders) ? s.orders : [],
    decorations: Array.isArray(s.decorations) ? s.decorations : [],
    collection: {
      crops: Array.isArray(s.collection?.crops) ? s.collection.crops : [],
      dishes: Array.isArray(s.collection?.dishes) ? s.collection.dishes : [],
      fish: Array.isArray(s.collection?.fish) ? s.collection.fish : [],
    },
  };
}

// ---------- 解析入口 ----------

/**
 * 解析一份存档数据（来源：localStorage 信封内的 state，或导入的 JSON 文件）。
 *
 * 流程：形状检查 → 版本检查（未来版本拒绝，旧版本逐级迁移）→ 补全 → 校验。
 * 任何一步失败都返回 null，由调用方决定回退（另一槽 / 新档 / 提示导入失败）。
 */
export function parseSave(raw: unknown): ParsedSave | null {
  // 数组也是 object，必须显式排除（spread 会把它洗成 {0:..,1:..} 对象）
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  let data = { ...(raw as Record<string, unknown>) };

  // version 缺失视为 v1（开发期旧档）；非整数说明数据损坏
  let version = typeof data.version === 'number' ? data.version : 1;
  if (!Number.isInteger(version) || version < 1) return null;
  if (version > SAVE_VERSION) return null; // 来自未来版本的档，本版本代码无法理解

  const migratedFrom = version < SAVE_VERSION ? version : null;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version - 1];
    if (!migrate) return null; // 迁移链缺口 —— 理论上不可达
    const next = migrate(data);
    if (next === null) return null; // 不满足旧版本最小形状
    data = next;
    version++;
  }

  const repaired = repairSave(data as unknown as GameState);
  if (!isValidGameState(repaired)) return null;

  return { state: repaired, migratedFrom, seq: 0, savedAt: 0 };
}
