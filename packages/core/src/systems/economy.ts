/**
 * EconomySystem —— 出售与扩地（方案 v2 §三 P0 商店与经济）
 *
 * 出售：作物按 CROPS 售价卖金币；单件 / 一键全卖。
 * 扩地：解锁与已解锁地块边相邻的锁定块，价格按已扩次数递增
 * （EXPAND_PRICES 表），上限 80 格（网格常量约束，天然封顶）。
 *
 * 全部纯函数改 state，返回结果对象供 UI 提示，不抛异常。
 */

import { CROPS } from '../config/crops';
import { MAX_GRID_COLS, MAX_GRID_ROWS, expandPrice } from '../constants';
import { cropKey } from './farming';
import type { CropId, GameState } from '../types';

// ---------- 出售 ----------

/** 单种作物出售（count 默认 1；库存不足按拒绝处理，不部分成交） */
export function sellCrop(state: GameState, crop: CropId, count = 1): { ok: boolean; goldGained?: number } {
  const key = cropKey(crop);
  const owned = state.inventory[key] ?? 0;
  if (owned < count || count <= 0) return { ok: false };

  state.inventory[key] = owned - count;
  const goldGained = CROPS[crop].sellPrice * count;
  state.gold += goldGained;
  return { ok: true, goldGained };
}

/** 一键卖出背包里全部作物。背包空时 ok=false（UI 提示没东西可卖） */
export interface SellAllResult {
  ok: boolean;
  goldGained: number;
  /** 卖出的 {crop: 数量} 明细 */
  soldItems: Partial<Record<CropId, number>>;
}

export function sellAll(state: GameState): SellAllResult {
  const result: SellAllResult = { ok: false, goldGained: 0, soldItems: {} };

  for (const crop of Object.keys(CROPS) as CropId[]) {
    const key = cropKey(crop);
    const owned = state.inventory[key] ?? 0;
    if (owned <= 0) continue;

    state.inventory[key] = 0;
    result.goldGained += CROPS[crop].sellPrice * owned;
    result.soldItems[crop] = owned;
    result.ok = true;
  }
  state.gold += result.goldGained;
  return result;
}

// ---------- 扩地 ----------

/** id → 网格坐标（越界 id 返回 null） */
export function tileCoord(tileId: number): { row: number; col: number } | null {
  const row = Math.floor(tileId / MAX_GRID_COLS);
  const col = tileId % MAX_GRID_COLS;
  if (row < 0 || row >= MAX_GRID_ROWS || col < 0 || col >= MAX_GRID_COLS) return null;
  return { row, col };
}

/** 该锁定块是否与任一已解锁块边相邻（扩地的"向外生长"约束） */
export function isAdjacentToUnlocked(state: GameState, tileId: number): boolean {
  const coord = tileCoord(tileId);
  if (!coord) return false;
  const unlocked = new Set(state.unlockedTileIds);
  const neighbors = [
    coord.row > 0 ? tileId - MAX_GRID_COLS : null,
    coord.row < MAX_GRID_ROWS - 1 ? tileId + MAX_GRID_COLS : null,
    coord.col > 0 ? tileId - 1 : null,
    coord.col < MAX_GRID_COLS - 1 ? tileId + 1 : null,
  ];
  return neighbors.some((n) => n !== null && unlocked.has(n));
}

/** 扩地预检：可买 / 不可买的原因（UI 高亮与确认弹窗共用） */
export function canExpandTile(
  state: GameState,
  tileId: number,
): { ok: boolean; reason?: 'tile-not-found' | 'already-unlocked' | 'not-adjacent' | 'not-enough-gold'; price?: number } {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile || !tileCoord(tileId)) return { ok: false, reason: 'tile-not-found' };
  if (state.unlockedTileIds.includes(tileId)) return { ok: false, reason: 'already-unlocked' };
  if (!isAdjacentToUnlocked(state, tileId)) return { ok: false, reason: 'not-adjacent' };

  const price = nextExpandPrice(state);
  if (state.gold < price) return { ok: false, reason: 'not-enough-gold', price };
  return { ok: true, price };
}

/** 下一次扩地价格：由已解锁块数推导已扩次数 */
export function nextExpandPrice(state: GameState): number {
  const expanded = state.unlockedTileIds.length - INITIAL_TILE_COUNT;
  return expandPrice(Math.max(0, expanded));
}

/** 初始解锁块数（20）—— 从常量推导，避免循环 import */
const INITIAL_TILE_COUNT = 5 * 4;

/** 执行扩地：扣金币 + 加入解锁列表 */
export function expandTile(state: GameState, tileId: number): { ok: boolean; reason?: string; price?: number } {
  const check = canExpandTile(state, tileId);
  if (!check.ok) return { ok: false, reason: check.reason, price: check.price };

  state.gold -= check.price!;
  state.unlockedTileIds = [...state.unlockedTileIds, tileId];
  return { ok: true, price: check.price };
}
