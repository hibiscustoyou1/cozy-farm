/**
 * FarmingSystem + 生长累计模型单测 —— M1 核心循环的行为契约。
 *
 * 重点边界：断水暂停不倒退、补浇从断点续长（不追溯）、
 * 种下未浇水不生长、收获结算（背包/图鉴/经验/升级）。
 */
import { describe, expect, it } from 'vitest';
import {
  advanceGrowth,
  buySeed,
  cropKey,
  effectiveGrownMs,
  harvestTile,
  plantSeed,
  seedKey,
  settleOffline,
  tick,
  tillTile,
  waterTile,
  type GameState,
} from '../index';
import { createInitialState } from '../systems/state';

const HOUR = 60 * 60 * 1000;

/** 中心区左上角地块 id（10×8 网格 row2 col2）—— 初始解锁 */
const TILE = 22;
const TILE_B = 23; // 相邻的另一块解锁地

/** 造一份已锄好地、库存有种子、时间在春 1 日 6:00 的档 */
function farm(): GameState {
  const s = createInitialState();
  s.inventory = { 'seed:radish': 10, 'seed:wheat': 10 };
  tillTile(s, TILE);
  return s;
}

/** 直接推进游戏时钟（绕过 tick 的速度倍率，测试用） */
function advance(state: GameState, gameMs: number): void {
  state.gameTime += gameMs;
}

// ---------- 锄地 ----------

describe('tillTile', () => {
  it('荒地 → 耕地', () => {
    const s = createInitialState();
    expect(tillTile(s, TILE).ok).toBe(true);
    expect(s.tiles[TILE]?.state).toBe('tilled');
  });

  it('对已耕地/生长中地块拒绝', () => {
    const s = farm();
    expect(tillTile(s, TILE)).toMatchObject({ ok: false, reason: 'wrong-state' });
  });

  it('对锁定块拒绝（tile-locked）', () => {
    expect(tillTile(createInitialState(), 0)).toMatchObject({
      ok: false,
      reason: 'tile-locked',
    });
  });

  it('不存在的地块拒绝', () => {
    expect(tillTile(createInitialState(), 999)).toMatchObject({
      ok: false,
      reason: 'tile-not-found',
    });
  });
});

// ---------- 种植 ----------

describe('plantSeed', () => {
  it('耕地 → 生长中，扣一粒种子', () => {
    const s = farm();
    const r = plantSeed(s, TILE, 'radish');
    expect(r.ok).toBe(true);
    expect(s.tiles[TILE]?.state).toBe('growing');
    expect(s.tiles[TILE]?.crop).toBe('radish');
    expect(s.inventory[seedKey('radish')]).toBe(9);
  });

  it('种下但未浇水：完全不生长', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    advance(s, 10 * HOUR);
    advanceGrowth(s);
    expect(s.tiles[TILE]?.grownMs).toBe(0);
    expect(s.tiles[TILE]?.state).toBe('growing');
  });

  it('种子不足拒绝', () => {
    const s = farm();
    s.inventory = {};
    expect(plantSeed(s, TILE, 'radish')).toMatchObject({ ok: false, reason: 'no-seed' });
  });

  it('对荒地种植拒绝', () => {
    const s = createInitialState();
    s.inventory = { 'seed:radish': 1 };
    expect(plantSeed(s, TILE_B, 'radish')).toMatchObject({ ok: false, reason: 'wrong-state' });
  });
});

// ---------- 浇水与断水续长（核心边界） ----------

describe('waterTile + advanceGrowth', () => {
  it('浇水启动生长，窗口内累计', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    advance(s, 2 * HOUR);
    advanceGrowth(s);
    expect(s.tiles[TILE]?.grownMs).toBe(2 * HOUR);
  });

  it('断水后生长暂停（不倒退、不枯萎）', () => {
    // 玉米 36 游戏小时才熟：24h 湿润 + 断水，确保停在 growing
    const s = farm();
    s.level = 5;
    s.inventory['seed:corn'] = 1;
    plantSeed(s, TILE, 'corn');
    waterTile(s, TILE); // 湿润 24 游戏小时
    advance(s, 24 * HOUR + 5 * HOUR); // 湿度耗尽后又断水 5 小时
    advanceGrowth(s);
    expect(s.tiles[TILE]?.grownMs).toBe(24 * HOUR);
    expect(s.tiles[TILE]?.state).toBe('growing'); // 暂停而非枯死
  });

  it('补浇从断点续长：断水期不被追溯计入', () => {
    const s = farm();
    s.level = 5;
    s.inventory['seed:corn'] = 1;
    plantSeed(s, TILE, 'corn');
    waterTile(s, TILE);
    advance(s, 24 * HOUR + 5 * HOUR); // 长满 24h 后断水 5h
    advanceGrowth(s);
    expect(s.tiles[TILE]?.grownMs).toBe(24 * HOUR);

    waterTile(s, TILE); // 补浇：从当下重新保湿 24h
    advance(s, 3 * HOUR);
    advanceGrowth(s);
    // 关键断言：24 + 3，而不是 24 + 5 + 3（追溯）或 24（没续上）
    expect(s.tiles[TILE]?.grownMs).toBe(27 * HOUR);
    expect(s.tiles[TILE]?.state).toBe('growing'); // 27h < 36h 仍未熟
  });

  it('湿润期内重复浇水：顺延不浪费', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    advance(s, 2 * HOUR);
    waterTile(s, TILE); // 已湿润到 26h，再浇顺延到 26h+24h
    advance(s, 30 * HOUR); // 距首浇 32h < 50h，全程湿润
    advanceGrowth(s);
    expect(s.tiles[TILE]?.grownMs).toBe(32 * HOUR);
  });

  it('effectiveGrownMs 纯读：包含未结算的湿润增量', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    advance(s, 4 * HOUR);
    // 未调 advanceGrowth 也能读到实时进度（渲染层用）
    const tile = s.tiles[TILE]!;
    expect(effectiveGrownMs(s, tile)).toBe(4 * HOUR);
  });

  it('成熟：advanceGrowth 返回新成熟地块并置状态', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish'); // 萝卜 4 游戏小时成熟
    waterTile(s, TILE);
    advance(s, 4 * HOUR);
    const matured = advanceGrowth(s);
    expect(matured).toEqual([TILE]);
    expect(s.tiles[TILE]?.state).toBe('mature');
    // 再推进不再重复报告
    expect(advanceGrowth(s)).toEqual([]);
  });

  it('暂停（speed=0）时 tick 不推进时间', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    s.speed = 0;
    const t0 = s.gameTime;
    tick(s, 5000);
    expect(s.gameTime).toBe(t0);
  });
});

// ---------- 收获 ----------

describe('harvestTile', () => {
  function ripe(): GameState {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    advance(s, 4 * HOUR);
    advanceGrowth(s);
    expect(s.tiles[TILE]?.state).toBe('mature');
    return s;
  }

  it('收获：产物进背包、经验、图鉴、回到耕地', () => {
    const s = ripe();
    const r = harvestTile(s, TILE);
    expect(r.ok).toBe(true);
    expect(r.crop).toBe('radish');
    expect(r.expGained).toBe(4); // 售价 35 → round(3.5) = 4
    expect(s.inventory[cropKey('radish')]).toBe(1);
    expect(s.collection.crops).toContain('radish');
    expect(s.tiles[TILE]?.state).toBe('tilled');
    expect(s.tiles[TILE]?.crop).toBeNull();
  });

  it('收获经验累积触发升级（Lv1→2 需 80 exp）', () => {
    const s = createInitialState();
    // 初始 20 块 × 4 exp = 80 恰好够 Lv1→2，再解锁 10 块验证跨级余量
    const extra = [1 * 10 + 2, 1 * 10 + 3, 1 * 10 + 4, 1 * 10 + 5, 1 * 10 + 6, 5 * 10 + 2, 5 * 10 + 3, 5 * 10 + 4, 5 * 10 + 5, 5 * 10 + 6];
    s.unlockedTileIds = [...s.unlockedTileIds, ...extra];
    s.inventory = { 'seed:radish': 30 };
    for (const id of s.unlockedTileIds) tillTile(s, id);

    let lastLevel = s.level;
    let sawLevelUp = false;
    for (const id of s.unlockedTileIds) {
      plantSeed(s, id, 'radish');
      waterTile(s, id);
    }
    advance(s, 4 * HOUR);
    advanceGrowth(s);
    for (const id of s.unlockedTileIds) {
      const r = harvestTile(s, id);
      if (r.newLevel) {
        sawLevelUp = true;
        lastLevel = r.newLevel;
      }
    }
    // 30 株萝卜 × 4 exp = 120 ≥ 100 → 至少升一级
    expect(sawLevelUp).toBe(true);
    expect(s.level).toBeGreaterThan(1);
    expect(s.level).toBe(lastLevel);
  });

  it('对未成熟地块收获拒绝', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    expect(harvestTile(s, TILE)).toMatchObject({ ok: false, reason: 'wrong-state' });
  });
});

// ---------- 种子购买 ----------

describe('buySeed', () => {
  it('当季已解锁作物：扣金币入库存', () => {
    const s = createInitialState(); // 春季 Lv1 金币 500
    const r = buySeed(s, 'radish', 2);
    expect(r.ok).toBe(true);
    expect(s.gold).toBe(460); // 500 - 20×2
    expect(s.inventory[seedKey('radish')]).toBe(8); // 初始 6 + 2
  });

  it('非当季作物拒绝（春买夏玉米）', () => {
    const s = createInitialState();
    s.level = 5; // 玉米 Lv2 解锁，先抬高等级以单独验证季节校验
    expect(buySeed(s, 'corn')).toMatchObject({ ok: false, reason: 'season-mismatch' });
  });

  it('等级未解锁拒绝', () => {
    const s = createInitialState(); // Lv1，番茄要 Lv3
    expect(buySeed(s, 'tomato')).toMatchObject({ ok: false, reason: 'level-locked' });
  });

  it('金币不足拒绝且不扣款', () => {
    const s = createInitialState();
    s.gold = 10;
    expect(buySeed(s, 'radish')).toMatchObject({ ok: false, reason: 'not-enough-gold' });
    expect(s.gold).toBe(10);
    expect(s.inventory[seedKey('radish')]).toBe(6);
  });
});

// ---------- 离线结算集成 ----------

describe('settleOffline 与生长模型集成', () => {
  it('离线期间湿润窗口内的作物成熟并进报告', () => {
    const s = farm();
    plantSeed(s, TILE, 'radish');
    waterTile(s, TILE);
    // 模拟离开 10 现实分钟（1x = 10 游戏分钟 < 4 游戏小时，未熟）
    s.lastSeen = 0; // 绕过"首档不结算"守卫
    s.lastSeen = Date.now() - 10 * 60 * 1000;
    const r1 = settleOffline(s, Date.now());
    expect(r1.realElapsedMs).toBeGreaterThan(0);
    expect(s.tiles[TILE]?.state).toBe('growing');

    // 再离开 5 现实小时（> 4 游戏小时，萝卜成熟）
    s.lastSeen = Date.now() - 5 * 60 * 60 * 1000;
    const r2 = settleOffline(s, Date.now());
    expect(s.tiles[TILE]?.state).toBe('mature');
    expect(r2.maturedCrops).toContain('radish');
  });
});
