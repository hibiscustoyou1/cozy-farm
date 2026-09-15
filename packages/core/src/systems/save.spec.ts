/**
 * SaveSystem 单测 —— 覆盖序列化往返、校验拒绝、v1 迁移、信封轮换。
 *
 * 这些是"存档不丢"的最后防线，边界 case 必须全覆盖（方案 v2 §七）。
 */
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../systems/state';
import {
  makeEnvelope,
  parseEnvelope,
  parseSave,
  serializeSave,
} from '../systems/save';
import type { GameState } from '../types';

/** 造一份带种植中作物的真实感 state */
function sampleState(): GameState {
  const s = createInitialState();
  s.gold = 1250;
  s.level = 3;
  s.gameTime = 123456789;
  const tile = s.tiles[12];
  if (tile) {
    tile.state = 'growing';
    tile.crop = 'corn';
    tile.plantedAt = 123450000;
    tile.wateredUntil = 123536000;
  }
  s.inventory = { wheat: 5, egg: 2 };
  return s;
}

// ---------- 序列化 / 解析往返 ----------

describe('serializeSave + parseSave 往返', () => {
  it('完整 GameState 序列化后可无损还原', () => {
    const state = sampleState();
    const parsed = parseSave(JSON.parse(serializeSave(state)));
    expect(parsed).not.toBeNull();
    expect(parsed?.state).toEqual(state);
    expect(parsed?.migratedFrom).toBeNull();
  });

  it('解析合法对象（非 JSON 文本）同样通过', () => {
    const parsed = parseSave(sampleState());
    expect(parsed?.state.gold).toBe(1250);
  });
});

// ---------- 校验拒绝 ----------

describe('parseSave 校验', () => {
  it.each([
    ['null', null],
    ['数字', 42],
    ['字符串', 'not-a-save'],
    ['数组', [1, 2, 3]],
  ])('拒绝非对象输入：%s', (_label, input) => {
    expect(parseSave(input)).toBeNull();
  });

  it('拒绝来自未来版本的存档（version > SAVE_VERSION）', () => {
    const s = sampleState();
    (s as unknown as Record<string, unknown>).version = 99;
    expect(parseSave(s)).toBeNull();
  });

  it('拒绝非法速度档位', () => {
    const s = sampleState();
    s.speed = 3 as GameState['speed']; // 故意传入不在 SPEED_STEPS 里的档位
    expect(parseSave(s)).toBeNull();
  });

  it('拒绝非法地块状态', () => {
    const s = sampleState();
    const tile = s.tiles[0];
    if (tile) (tile as unknown as Record<string, unknown>).state = 'floating';
    expect(parseSave(s)).toBeNull();
  });

  it('拒绝未知作物 id', () => {
    const s = sampleState();
    const tile = s.tiles[0];
    if (tile) {
      tile.state = 'growing';
      (tile as unknown as Record<string, unknown>).crop = 'pizza';
    }
    expect(parseSave(s)).toBeNull();
  });

  it('拒绝非整数等级 / 非有限数值', () => {
    const s = sampleState();
    s.level = 3.5;
    expect(parseSave(s)).toBeNull();
    s.level = 3;
    s.gameTime = Number.NaN;
    expect(parseSave(s)).toBeNull();
  });
});

// ---------- v1 迁移 ----------

describe('v1 → v2 迁移', () => {
  it('version 缺失视为 v1：已有值保留、缺失字段补全', () => {
    const old = {
      // 故意不带 version
      createdAt: 1700000000000,
      gameTime: 999,
      lastSeen: 1700000001000,
      speed: 2,
      gold: 777,
      level: 4,
      exp: 100,
      tiles: [
        { id: 0, state: 'wild', crop: null, plantedAt: 0, wateredUntil: 0 },
      ],
      unlockedTileIds: [0],
      // animals / inventory / npcs / orders / decorations / collection 全缺
    };
    const parsed = parseSave(old);
    expect(parsed).not.toBeNull();
    expect(parsed?.migratedFrom).toBe(1);
    expect(parsed?.state.version).toBe(2);
    // 旧值保留
    expect(parsed?.state.gold).toBe(777);
    expect(parsed?.state.speed).toBe(2);
    expect(parsed?.state.gameTime).toBe(999);
    // 缺失占位字段补全
    expect(parsed?.state.animals).toEqual([]);
    expect(parsed?.state.inventory).toEqual({});
    expect(parsed?.state.collection).toEqual({ crops: [], dishes: [], fish: [] });
  });

  it('显式 version: 1 同样走迁移', () => {
    const parsed = parseSave({ ...sampleState(), version: 1 });
    expect(parsed?.migratedFrom).toBe(1);
    expect(parsed?.state.version).toBe(2);
  });
});

// ---------- 信封（双写轮换） ----------

describe('makeEnvelope + parseEnvelope', () => {
  it('槽位轮换：b 之后写 a，a 之后写 b', () => {
    expect(makeEnvelope(sampleState(), 5, 'a').slot).toBe('b');
    expect(makeEnvelope(sampleState(), 6, 'b').slot).toBe('a');
  });

  it('seq 严格递增', () => {
    expect(makeEnvelope(sampleState(), 0, 'b').seq).toBe(1);
    expect(makeEnvelope(sampleState(), 41, 'a').seq).toBe(42);
  });

  it('首写落 a 槽（prevSlot 传 b）', () => {
    expect(makeEnvelope(sampleState(), 0, 'b').slot).toBe('a');
  });

  it('合法信封文本可还原', () => {
    const env = makeEnvelope(sampleState(), 3, 'a');
    const back = parseEnvelope(JSON.stringify(env));
    expect(back).not.toBeNull();
    expect(back?.seq).toBe(4);
    expect(back?.slot).toBe('b');
    expect(back?.savedAt).toBe(env.savedAt);
    // 信封内的 state 还能再过一遍完整解析
    expect(parseSave(back?.state)?.state.gold).toBe(1250);
  });

  it.each([
    ['null 输入', null],
    ['空字符串', ''],
    ['损坏 JSON', '{oops'],
    ['非信封对象', JSON.stringify({ hello: 1 })],
    ['slot 非法', JSON.stringify({ slot: 'c', seq: 1, savedAt: 0, state: {} })],
    ['seq 非法', JSON.stringify({ slot: 'a', seq: -3, savedAt: 0, state: {} })],
  ])('拒绝无效信封：%s', (_label, raw) => {
    expect(parseEnvelope(raw)).toBeNull();
  });
});
