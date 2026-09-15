/**
 * 双写轮换存储层单测 —— "存档不丢"的核心承诺（方案 v2 §七）。
 *
 * 用内存 Map 伪造 localStorage，重点覆盖：
 * 轮换交替、新槽损坏回退旧槽、写失败降级内存。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, type GameState } from '@cozy-farm/core';
import { createSaveStorage } from './storage';

const KEY_A = 'cozy-farm:save:a';
const KEY_B = 'cozy-farm:save:b';

/** 伪造 localStorage（可注入读写故障） */
function makeFakeStorage(): Storage & {
  map: Map<string, string>;
  flags: { failSet: boolean; failGet: boolean };
} {
  const map = new Map<string, string>();
  // 故障标志必须是独立对象：闭包直接捕获，避免挂在 Map 实例上读不到
  const flags = { failSet: false, failGet: false };
  return {
    map,
    flags,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => {
      if (flags.failGet) throw new DOMException('blocked', 'SecurityError');
      return map.get(k) ?? null;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      if (flags.failSet) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
  } as never;
}

let fake: ReturnType<typeof makeFakeStorage>;

beforeEach(() => {
  fake = makeFakeStorage();
  vi.stubGlobal('localStorage', fake);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stateWith(gold: number): GameState {
  const s = createInitialState();
  s.gold = gold;
  return s;
}

describe('createSaveStorage', () => {
  it('无档时 load 返回 null', () => {
    expect(createSaveStorage().load()).toBeNull();
  });

  it('写入后可读回，数据无损', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(777));
    const loaded = storage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.state.gold).toBe(777);
  });

  it('双写轮换：连续写入交替落 a/b 两槽', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(1));
    expect(fake.map.has(KEY_A)).toBe(true); // 首写落 a
    expect(fake.map.has(KEY_B)).toBe(false);

    storage.write(stateWith(2));
    expect(fake.map.has(KEY_B)).toBe(true); // 第二次落 b
  });

  it('seq 随写入递增，load 取最新', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(1));
    storage.write(stateWith(2));
    storage.write(stateWith(3));
    const loaded = storage.load();
    expect(loaded?.state.gold).toBe(3);
    expect(loaded?.seq).toBe(3);
  });

  it('新槽损坏时回退旧槽（双写的意义）', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(111)); // a
    storage.write(stateWith(222)); // b（更新）
    // 模拟 b 槽写入中途损坏（半截 JSON）
    fake.map.set(KEY_B, '{"slot":"b","seq":2,"savedAt":1');

    const loaded = createSaveStorage().load(); // 用新实例模拟下次启动
    expect(loaded).not.toBeNull();
    expect(loaded?.state.gold).toBe(111); // 回退到 a 槽旧档
    expect(loaded?.seq).toBe(1);
  });

  it('两槽全损坏时 load 返回 null（回到新档）', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(1));
    storage.write(stateWith(2));
    fake.map.set(KEY_A, 'garbage');
    fake.map.set(KEY_B, '{"broken":true}');

    expect(createSaveStorage().load()).toBeNull();
  });

  it('槽内 state 非法（被篡改）时同样淘汰该槽', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(1)); // a
    storage.write(stateWith(2)); // b
    // 篡改 b 槽信封内的 state：速度档位不合法
    const env = JSON.parse(fake.map.get(KEY_B)!);
    env.state.speed = 7;
    fake.map.set(KEY_B, JSON.stringify(env));

    const loaded = createSaveStorage().load();
    expect(loaded?.state.gold).toBe(1); // 回退 a 槽
  });

  it('clear 后无档可读', () => {
    const storage = createSaveStorage();
    storage.write(stateWith(1));
    storage.clear();
    expect(fake.map.has(KEY_A)).toBe(false);
    expect(fake.map.has(KEY_B)).toBe(false);
    expect(storage.load()).toBeNull();
  });

  it('localStorage 写入失败时降级内存：ok=false 但当次会话仍可读回', () => {
    const storage = createSaveStorage();
    fake.flags.failSet = true;

    const r = storage.write(stateWith(42));
    expect(r.ok).toBe(false); // 持久化失败如实上报

    // 同一实例（同一次会话）仍能从内存降级中读回
    const loaded = storage.load();
    expect(loaded?.state.gold).toBe(42);
  });

  it('localStorage 读取抛异常时 load 不崩溃且返回 null', () => {
    // 先正常写一档，再让读取故障 —— 验证的是"抛异常"而非"无档"
    const seed = createSaveStorage();
    seed.write(stateWith(1));
    fake.flags.failGet = true;

    expect(createSaveStorage().load()).toBeNull();
  });
});
