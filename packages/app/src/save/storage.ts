/**
 * 存储层 —— localStorage 双写轮换（app 层，方案 v2 §七"存档丢失"对策）
 *
 * 为什么双写：localStorage 单次 setItem 可能在写入中途被打断（断电/杀进程/
 * 配额异常），留下半截 JSON。两个槽位 a/b 交替写入 + 信封 seq 比对新旧，
 * 保证任意时刻至少有一份完整旧档可回退。
 *
 * 降级策略：localStorage 整体不可用（隐私模式/被禁用）时切换到会话内存 Map
 * —— 当次会话不崩、能玩，刷新后回到新档（比白屏好，符合无压力原则）。
 */
import {
  makeEnvelope,
  parseEnvelope,
  parseSave,
  type GameState,
  type ParsedSave,
  type SaveEnvelope,
  type SaveSlot,
} from '@cozy-farm/core';

const KEY_A = 'cozy-farm:save:a';
const KEY_B = 'cozy-farm:save:b';

/** 读档结果：解析并校验通过的最新存档 */
export interface LoadedSave {
  state: GameState;
  /** 该槽信封 seq（下次写入接续 +1） */
  seq: number;
  /** 现实保存时刻（UI 显示"上次保存"） */
  savedAt: number;
  /** 迁移前版本；null = 未迁移 */
  migratedFrom: ParsedSave['migratedFrom'];
}

export interface SaveStorage {
  /** 读两槽并挑出最新有效档；无档/全损坏返回 null */
  load(): LoadedSave | null;
  /** 轮换写入下一槽。返回 ok=false 表示持久化失败（已内存降级） */
  write(state: GameState): { ok: boolean; seq: number };
  /** 清空两槽（重置存档用，需调用方自行二次确认） */
  clear(): void;
}

export function createSaveStorage(): SaveStorage {
  // 轮换状态：load 时从有效槽恢复，write 时推进。
  // 放在闭包而非模块级，避免 HMR/多实例共享脏状态。
  let lastSlot: SaveSlot = 'b'; // 首写落 a
  let maxSeq = 0;

  // localStorage 不可用时的降级存储（惰性创建）
  let memory: Map<string, string> | null = null;

  function rawGet(key: string): string | null {
    try {
      return memory ? (memory.get(key) ?? null) : localStorage.getItem(key);
    } catch {
      // 读都抛异常（被禁用/跨域 iframe）—— 切内存降级
      memory = memory ?? new Map();
      return memory.get(key) ?? null;
    }
  }

  function rawSet(key: string, value: string): boolean {
    try {
      if (memory) {
        memory.set(key, value);
      } else {
        localStorage.setItem(key, value);
      }
      return true;
    } catch {
      // 写入失败（配满/隐私模式）—— 降级到内存，本次会话继续可用
      memory = memory ?? new Map();
      memory.set(key, value);
      return false;
    }
  }

  function rawRemove(key: string): void {
    try {
      if (memory) memory.delete(key);
      else localStorage.removeItem(key);
    } catch {
      memory?.delete(key);
    }
  }

  return {
    load() {
      const candidates: Array<{ env: SaveEnvelope; state: GameState; migratedFrom: ParsedSave['migratedFrom'] }> = [];

      for (const [key, slot] of [
        [KEY_A, 'a'],
        [KEY_B, 'b'],
      ] as const) {
        // 信封损坏（JSON 断裂/形状不对）直接淘汰，另一槽就是为此准备的
        const env = parseEnvelope(rawGet(key));
        if (!env) continue;
        // 信封完好还要过完整 state 解析（迁移 + 校验 + 补全）
        const parsed = parseSave(env.state);
        if (!parsed) continue;
        candidates.push({ env: { ...env, slot }, state: parsed.state, migratedFrom: parsed.migratedFrom });
      }

      if (candidates.length === 0) {
        lastSlot = 'b';
        maxSeq = 0;
        return null;
      }

      // seq 大者新；seq 相等（异常情况）优先 a 槽
      candidates.sort((x, y) => y.env.seq - x.env.seq || (x.env.slot === 'a' ? -1 : 1));
      const best = candidates[0]!;

      // 记住轮换状态：下次写另一槽、seq 接续。
      // 注意 maxSeq 只认"有效档"——损坏槽的 seq 已不可知，从有效档重新计数，
      // 下一次写入会覆盖掉损坏槽，双写自愈。
      lastSlot = best.env.slot;
      maxSeq = best.env.seq;

      return {
        state: best.state,
        seq: best.env.seq,
        savedAt: best.env.savedAt,
        migratedFrom: best.migratedFrom,
      };
    },

    write(state: GameState) {
      const env = makeEnvelope(state, maxSeq, lastSlot);
      const key = env.slot === 'a' ? KEY_A : KEY_B;
      const ok = rawSet(key, JSON.stringify(env));
      if (ok) {
        // 只有真正落盘才推进轮换；失败时保持旧槽位，下次重试同一槽
        lastSlot = env.slot;
        maxSeq = env.seq;
      }
      return { ok, seq: env.seq };
    },

    clear() {
      rawRemove(KEY_A);
      rawRemove(KEY_B);
      lastSlot = 'b';
      maxSeq = 0;
    },
  };
}
