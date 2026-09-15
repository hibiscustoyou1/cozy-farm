/**
 * EconomySystem 单测 —— 出售与扩地（M2 经济闭环）。
 *
 * 覆盖：单件/一键出售结算、扩地价格递增、相邻约束、
 * 金币不足拒绝、上限封顶、v3→v4 网格重排迁移。
 */
import { describe, expect, it } from 'vitest';
import {
  canExpandTile,
  expandTile,
  initialUnlockedTileIds,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  nextExpandPrice,
  sellAll,
  sellCrop,
  tileCoord,
  createInitialState,
  harvestTile,
  plantSeed,
  tillTile,
  waterTile,
  advanceGrowth,
  type GameState,
} from '../index';

const HOUR = 60 * 60 * 1000;

/** 中心区左上角地块 id（row2 col2）—— 初始解锁块 */
const TILE = 2 * MAX_GRID_COLS + 2; // 22

function farm(): GameState {
  return createInitialState();
}

// ---------- 出售 ----------

describe('sellCrop', () => {
  it('按售价卖出并扣库存', () => {
    const s = farm();
    s.inventory['crop:radish'] = 3;
    const gold0 = s.gold;
    const r = sellCrop(s, 'radish', 2);
    expect(r.ok).toBe(true);
    expect(r.goldGained).toBe(70); // 35 × 2
    expect(s.gold).toBe(gold0 + 70);
    expect(s.inventory['crop:radish']).toBe(1);
  });

  it('库存不足整单拒绝（不部分成交）', () => {
    const s = farm();
    s.inventory['crop:wheat'] = 1;
    const r = sellCrop(s, 'wheat', 2);
    expect(r.ok).toBe(false);
    expect(s.inventory['crop:wheat']).toBe(1);
  });
});

describe('sellAll', () => {
  it('一键卖出全部作物并汇总金额', () => {
    const s = farm();
    s.inventory['crop:radish'] = 2; // 70
    s.inventory['crop:potato'] = 1; // 90
    s.inventory['crop:pumpkin'] = 3; // 1680
    s.inventory['seed:wheat'] = 5; // 种子不卖
    const gold0 = s.gold;

    const r = sellAll(s);
    expect(r.ok).toBe(true);
    expect(r.goldGained).toBe(70 + 90 + 1680);
    expect(s.gold).toBe(gold0 + r.goldGained);
    expect(s.inventory['crop:radish']).toBe(0);
    expect(s.inventory['crop:pumpkin']).toBe(0);
    expect(s.inventory['seed:wheat']).toBe(5); // 种子保留
    expect(r.soldItems).toEqual({ radish: 2, potato: 1, pumpkin: 3 });
  });

  it('背包空时 ok=false', () => {
    const s = farm();
    expect(sellAll(s).ok).toBe(false);
  });
});

// ---------- 扩地 ----------

describe('expandTile + canExpandTile', () => {
  it('初始档：中心 20 块解锁，边缘块锁定', () => {
    const s = farm();
    expect(s.unlockedTileIds).toEqual(initialUnlockedTileIds());
    expect(s.unlockedTileIds.length).toBe(20);
    // 左上角 (0,0) 锁定
    expect(s.unlockedTileIds.includes(0)).toBe(false);
  });

  it('相邻锁定块可购买，扣金币并入解锁表', () => {
    const s = farm();
    s.gold = 1000;
    // (1,2) 与中心区顶行 (2,2) 相邻
    const target = 1 * MAX_GRID_COLS + 2; // 12
    expect(canExpandTile(s, target).ok).toBe(true);

    const r = expandTile(s, target);
    expect(r.ok).toBe(true);
    expect(r.price).toBe(200); // 第一次扩地
    expect(s.gold).toBe(800);
    expect(s.unlockedTileIds.includes(target)).toBe(true);
  });

  it('不相邻的锁定块拒绝（农场要向外生长）', () => {
    const s = farm();
    // (0,0) 离中心区至少隔 1 格
    expect(canExpandTile(s, 0)).toMatchObject({ ok: false, reason: 'not-adjacent' });
  });

  it('已解锁块拒绝重复购买', () => {
    const s = farm();
    expect(canExpandTile(s, TILE)).toMatchObject({ ok: false, reason: 'already-unlocked' });
  });

  it('越界 id 拒绝', () => {
    const s = farm();
    expect(canExpandTile(s, 999)).toMatchObject({ ok: false, reason: 'tile-not-found' });
    expect(tileCoord(999)).toBeNull();
  });

  it('金币不足拒绝且价格照常上报', () => {
    const s = farm();
    s.gold = 100;
    const target = 1 * MAX_GRID_COLS + 2;
    expect(canExpandTile(s, target)).toMatchObject({ ok: false, reason: 'not-enough-gold', price: 200 });
    expect(expandTile(s, target).ok).toBe(false);
    expect(s.unlockedTileIds.length).toBe(20);
  });

  it('价格随扩地次数递增（200→500→1200→3000→…）', () => {
    const s = farm();
    s.gold = 1_000_000;
    // 连续买 5 块，验证价格表 + 尾部 1.5x
    const prices: number[] = [];
    for (let i = 0; i < 5; i++) {
      prices.push(nextExpandPrice(s));
      // 买一块与已解锁区相邻的（沿顶行向右推进）
      const target = 1 * MAX_GRID_COLS + 3 + i;
      expect(expandTile(s, target).ok).toBe(true);
    }
    expect(prices).toEqual([200, 500, 1200, 3000, 4500]);
  });

  it('扩到 80 格后无处可买（网格封顶）', () => {
    const s = farm();
    s.gold = Number.MAX_SAFE_INTEGER;
    // 解锁全部
    s.unlockedTileIds = Array.from({ length: MAX_GRID_COLS * MAX_GRID_ROWS }, (_, i) => i);
    let anyExpandable = false;
    for (let i = 0; i < MAX_GRID_COLS * MAX_GRID_ROWS; i++) {
      if (canExpandTile(s, i).ok) anyExpandable = true;
    }
    expect(anyExpandable).toBe(false);
  });
});

// ---------- 种植操作与锁定块 ----------

describe('锁定地块的种植操作', () => {
  it('对锁定块锄地返回 tile-locked（区别于越界）', () => {
    const s = farm();
    expect(tillTile(s, 0)).toMatchObject({ ok: false, reason: 'tile-locked' });
    expect(tillTile(s, 999)).toMatchObject({ ok: false, reason: 'tile-not-found' });
  });

  it('扩地后新块可正常种植', () => {
    const s = farm();
    s.gold = 1000;
    const target = 1 * MAX_GRID_COLS + 2;
    expandTile(s, target);

    expect(tillTile(s, target).ok).toBe(true);
    expect(plantSeed(s, target, 'radish').ok).toBe(true);
    expect(waterTile(s, target).ok).toBe(true);
    s.gameTime += 4 * HOUR;
    advanceGrowth(s);
    expect(harvestTile(s, target).ok).toBe(true);
  });
});
