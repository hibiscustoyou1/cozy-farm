/**
 * FarmingSystem —— 种植循环（方案 v2 §三 P0、§2.2 浇水机制）
 *
 * 状态机：荒地 →(锄)→ 耕地 →(种)→ 生长中 →(浇水保湿/断水暂停)→ 成熟 →(收)→ 耕地
 *
 * 设计要点：
 * - 全部纯函数改 state，返回 FarmResult 供 UI 提示；不抛异常（无失败原则）
 * - 种下时 wateredUntil = 0：必须浇一次水才启动生长（方案 §2.2）
 * - 浇水延长规则：从 max(now, wateredUntil) 起 +1 游戏日 —— 已湿润时
 *   顺延不浪费；断水后从当下重新保湿
 * - 种植不限季节（种子是玩家财产）；季节只过滤商店货架（"换季不惩罚"）
 * - 经验曲线为 M1 临时值，M2 经济里程碑统一平衡
 */

import { CROPS } from '../config/crops';
import { WATERING_LASTS_MS } from '../constants';
import { currentSeason } from './time';
import type { CropId, GameState, Tile } from '../types';

// ---------- 库存 key 约定 ----------

/** 背包里种子的 key（'seed:radish'） */
export const seedKey = (crop: CropId): string => `seed:${crop}`;
/** 背包里作物的 key（'crop:radish'） */
export const cropKey = (crop: CropId): string => `crop:${crop}`;

// ---------- 结果类型 ----------

export type FarmFailReason =
  | 'tile-not-found'    // 地块不存在（越界）
  | 'tile-locked'       // 地块未解锁（需扩地）
  | 'wrong-state'       // 当前工具对该地块状态不可用
  | 'no-seed'           // 种子库存不足
  | 'season-mismatch'   // 商店货架季节不符
  | 'level-locked'      // 等级未解锁
  | 'not-enough-gold';  // 金币不足

export interface FarmResult {
  ok: boolean;
  reason?: FarmFailReason;
  /** 成功时的附加信息 */
  crop?: CropId;
  /** 收获经验 */
  expGained?: number;
  /** 收获触发升级时为新等级 */
  newLevel?: number;
}

function fail(reason: FarmFailReason): FarmResult {
  return { ok: false, reason };
}

/**
 * 查找地块并校验已解锁。返回 null 表示 tile-not-found；
 * 返回 'locked' 表示地块存在但未解锁（M2 网格含全部 80 块）。
 */
function findTile(state: GameState, tileId: number): Tile | 'locked' | null {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile) return null;
  if (!state.unlockedTileIds.includes(tileId)) return 'locked';
  return tile;
}

/** 统一把 findTile 的三态转成 FarmResult（各操作共用） */
function requireTile(state: GameState, tileId: number): { tile: Tile } | { fail: FarmResult } {
  const tile = findTile(state, tileId);
  if (tile === null) return { fail: { ok: false, reason: 'tile-not-found' } };
  if (tile === 'locked') return { fail: { ok: false, reason: 'tile-locked' } };
  return { tile };
}

// ---------- 锄地 ----------

/** 荒地 → 耕地 */
export function tillTile(state: GameState, tileId: number): FarmResult {
  const r = requireTile(state, tileId);
  if ('fail' in r) return r.fail;
  const { tile } = r;
  if (tile.state !== 'wild') return fail('wrong-state');
  tile.state = 'tilled';
  return { ok: true };
}

// ---------- 种植 ----------

/** 耕地 → 生长中（种下需浇水启动，见 waterTile） */
export function plantSeed(state: GameState, tileId: number, crop: CropId): FarmResult {
  const r = requireTile(state, tileId);
  if ('fail' in r) return r.fail;
  const { tile } = r;
  if (tile.state !== 'tilled') return fail('wrong-state');

  const key = seedKey(crop);
  const owned = state.inventory[key] ?? 0;
  if (owned <= 0) return fail('no-seed');

  state.inventory[key] = owned - 1;
  tile.state = 'growing';
  tile.crop = crop;
  tile.plantedAt = state.gameTime;
  tile.wateredUntil = 0; // 未浇水：湿润窗口为空，生长不启动
  tile.grownMs = 0;
  tile.lastGrowthAt = state.gameTime;
  return { ok: true, crop };
}

// ---------- 浇水 ----------

/**
 * 生长中地块浇水：湿度窗口延长 1 游戏日。
 * 关键：延长前先把 [lastGrowthAt, now) 的增量结算进 grownMs，
 * 否则断水期会被新窗口追溯覆盖（单测覆盖该边界）。
 */
export function waterTile(state: GameState, tileId: number): FarmResult {
  const r = requireTile(state, tileId);
  if ('fail' in r) return r.fail;
  const { tile } = r;
  if (tile.state !== 'growing') return fail('wrong-state');

  // 先结算：把 lastGrowthAt 推进到 now，保证新窗口从当下起算
  const now = state.gameTime;
  const from = Math.max(tile.lastGrowthAt, tile.plantedAt);
  if (now > from) {
    const wetEnd = Math.min(now, tile.wateredUntil);
    if (wetEnd > from) tile.grownMs += wetEnd - from;
    tile.lastGrowthAt = now;
  }

  tile.wateredUntil = Math.max(now, tile.wateredUntil) + WATERING_LASTS_MS;
  return { ok: true };
}

// ---------- 收获 ----------

/**
 * M2 经验曲线：升级所需 = 80 × level^1.35（前期快、后期缓陡）。
 * Lv1→2 仅 80 exp（约一茬混合春收），Lv4→5 约 541。
 * TODO(M7 打磨)：随实际游玩节奏微调指数。
 */
export function expToNext(level: number): number {
  return Math.round(80 * Math.pow(level, 1.35));
}

/** 收获经验 ≈ 售价 / 10（与售价挂钩：贵作物经验也多，鼓励种长作物） */
function harvestExp(crop: CropId): number {
  return Math.max(1, Math.round(CROPS[crop].sellPrice / 10));
}

/** 成熟 → 耕地；产物进背包、加经验、记图鉴 */
export function harvestTile(state: GameState, tileId: number): FarmResult {
  const r = requireTile(state, tileId);
  if ('fail' in r) return r.fail;
  const { tile } = r;
  if (tile.state !== 'mature' || !tile.crop) return fail('wrong-state');

  const crop = tile.crop;

  // 产物进背包
  const key = cropKey(crop);
  state.inventory[key] = (state.inventory[key] ?? 0) + 1;

  // 图鉴：首次收获记录
  if (!state.collection.crops.includes(crop)) {
    state.collection.crops = [...state.collection.crops, crop];
  }

  // 经验与升级
  const gained = harvestExp(crop);
  state.exp += gained;
  let leveledUp = false;
  while (state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level += 1;
    leveledUp = true;
  }

  // 地块回到耕地（保留 tilled，省一次锄地）
  tile.state = 'tilled';
  tile.crop = null;
  tile.plantedAt = 0;
  tile.wateredUntil = 0;
  tile.grownMs = 0;
  tile.lastGrowthAt = 0;

  return { ok: true, crop, expGained: gained, ...(leveledUp ? { newLevel: state.level } : {}) };
}

// ---------- 种子购买（M1 快速补货；M2 正式商店接管） ----------

/** 按当前季节与等级校验后购买种子。季节不符/等级不够/金币不足都会拒绝 */
export function buySeed(state: GameState, crop: CropId, count = 1): FarmResult {
  const def = CROPS[crop];
  if (state.level < def.unlockLevel) return fail('level-locked');
  if (currentSeason(state) !== def.season) return fail('season-mismatch');

  const cost = def.seedPrice * count;
  if (state.gold < cost) return fail('not-enough-gold');

  state.gold -= cost;
  const key = seedKey(crop);
  state.inventory[key] = (state.inventory[key] ?? 0) + count;
  return { ok: true, crop };
}
