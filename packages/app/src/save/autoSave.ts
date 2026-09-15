/**
 * 自动存档控制器 —— 三个触发时机（方案 v2 §三 P0）：
 *
 * 1. 30 秒定时间隔（兜底，覆盖纯流逝的时间）
 * 2. 关键操作后 3 秒防抖（M1 的锄地/种植/浇水/收获调用 notifyAction）
 * 3. 页面隐藏/关闭前（visibilitychange hidden + pagehide 双保险，
 *    移动端切后台随时可能被系统杀掉，hidden 是最可靠的最后时机）
 *
 * saveNow 由调用方注入且必须同步完成（localStorage 写入本身是同步的），
 * 这样 pagehide 触发时来不及排异步队列也能写完。
 */

export interface AutoSaveOptions {
  /** 执行一次保存（同步）。返回 false 表示失败，控制器只透传不管重试 */
  saveNow: () => boolean;
  /** 定时间隔，默认 30s */
  intervalMs?: number;
  /** 关键操作后的防抖窗口，默认 3s */
  debounceMs?: number;
}

export interface AutoSaveController {
  start(): void;
  stop(): void;
  /** 关键操作后调用（种植/收获/购买等改变进度的动作） */
  notifyAction(): void;
  /** 立即保存（手动保存按钮也走这里） */
  flush(): void;
}

export function createAutoSaveController(opts: AutoSaveOptions): AutoSaveController {
  const intervalMs = opts.intervalMs ?? 30_000;
  const debounceMs = opts.debounceMs ?? 3_000;

  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function save(): void {
    // 防抖窗口内的保存已经覆盖了"刚操作完"的场景，触发即清，避免双写
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    opts.saveNow();
  }

  function onHidden(): void {
    if (document.visibilityState === 'hidden') save();
  }

  return {
    start() {
      if (intervalTimer) return; // 已启动，幂等
      intervalTimer = setInterval(save, intervalMs);
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', save);
    },

    stop() {
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = undefined;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', save);
    },

    notifyAction() {
      // 连点合并：每次操作重置倒计时，停手 3 秒后落一次盘
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(save, debounceMs);
    },

    flush: save,
  };
}
