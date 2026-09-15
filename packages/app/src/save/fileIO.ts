/**
 * 存档文件导入导出 —— 换设备 / 防手滑的最后手段（方案 v2 §三 P0）。
 *
 * 导出格式即裸 GameState JSON（方案 §5.3 的存档结构，version 字段在内），
 * 不套信封 —— 信封 seq 只对本地双写轮换有意义，跨设备无意义。
 * 导入兼容：裸 GameState（本作导出的）；解析与迁移全部复用 core 的 parseSave。
 */
import { parseSave, serializeSave, type GameState, type ParsedSave } from '@cozy-farm/core';

/** 触发浏览器下载一份存档 JSON */
export function downloadSaveFile(state: GameState): void {
  const json = serializeSave(state);
  const blob = new Blob([json], { type: 'application/json' });

  // 文件名带时间戳，多次导出不会互相覆盖
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name =
    `cozy-farm-save-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会导致部分浏览器取消下载，延迟释放
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** 读取用户选择的存档文件；任何一步失败返回 null（调用方提示导入失败） */
export async function readSaveFile(file: File): Promise<ParsedSave | null> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return null;
  }
  try {
    return parseSave(JSON.parse(text));
  } catch {
    return null; // 非 JSON / 结构不认识
  }
}
