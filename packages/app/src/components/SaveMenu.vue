<script setup lang="ts">
/**
 * 存档菜单 —— M0 收尾件：手动保存 / 导出 / 导入 / 重置。
 *
 * 自动存档（30s + 关键操作 + 关页前）在后台静默运行，这里只暴露
 * "防手滑"的人工通道。导入解析复用 core 的 parseSave（含版本迁移）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGameStore } from '../stores/game';
import { downloadSaveFile, readSaveFile } from '../save/fileIO';

const store = useGameStore();

const open = ref(false);
/** 操作反馈（导入成功/失败等），4 秒自动消失 */
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function showNotice(text: string): void {
  notice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = ''), 4000);
}

const lastSavedLabel = computed(() => {
  if (!store.lastSavedAt) return '尚未保存';
  const d = new Date(store.lastSavedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
});

function onManualSave(): void {
  showNotice(store.saveNow() ? '已保存 ✓' : '保存失败（存储不可用）');
}

function onExport(): void {
  downloadSaveFile(store.gameData);
  showNotice('已导出存档文件');
}

// 导入用隐藏 file input，避免样式受限
const fileInput = ref<HTMLInputElement | null>(null);

async function onImportChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // 允许重复选择同一文件
  if (!file) return;

  const parsed = await readSaveFile(file);
  if (!parsed) {
    showNotice('导入失败：不是有效的存档文件');
    return;
  }
  if (!window.confirm('导入会覆盖当前进度，确定继续吗？')) return;

  store.applyImport(parsed);
  showNotice(parsed.migratedFrom ? `已导入（存档从 v${parsed.migratedFrom} 升级）` : '已导入 ✓');
}

function onReset(): void {
  if (!window.confirm('确定要清空存档、从头开始吗？此操作不可恢复。')) return;
  if (!window.confirm('再次确认：真的要丢掉全部进度吗？')) return;
  store.resetSave();
  showNotice('已重置，新的开始 🌱');
}

// 点击菜单外部关闭
function onDocClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest('.save-menu')) open.value = false;
}

onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<template>
  <div class="save-menu">
    <button
      class="save-btn"
      :class="{ degraded: store.saveDegraded }"
      :title="store.saveDegraded ? '存储不可用：本次会话进度刷新后会丢失' : '存档'"
      :aria-expanded="open"
      @click="open = !open"
    >
      💾
    </button>

    <div v-if="open" class="menu-panel">
      <p class="menu-info">上次保存：{{ lastSavedLabel }}</p>
      <p v-if="store.saveDegraded" class="menu-warn">
        ⚠️ 浏览器存储不可用，进度仅保留在本会话
      </p>
      <p v-if="store.migratedFrom" class="menu-info migrated">
        旧存档已自动升级到 v{{ store.gameData.version }}
      </p>

      <button class="menu-item" @click="onManualSave">立即保存</button>
      <button class="menu-item" @click="onExport">导出 JSON 文件</button>
      <button class="menu-item" @click="fileInput?.click()">导入 JSON 文件</button>
      <button class="menu-item danger" @click="onReset">重置存档…</button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden-input"
        @change="onImportChange"
      />
    </div>

    <Transition name="notice">
      <span v-if="notice" class="notice">{{ notice }}</span>
    </Transition>
  </div>
</template>

<style scoped>
.save-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.save-btn {
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: 8px;
  background: rgba(61, 90, 61, 0.15);
  font-size: 18px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.save-btn:hover {
  background: rgba(127, 176, 105, 0.35);
}

/* 存储降级：红点提醒 */
.save-btn.degraded {
  background: rgba(217, 119, 87, 0.25);
}

.menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 200px;
  padding: 8px;
  background: #fffdf5;
  border: 2px solid #e0d8c3;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.menu-info {
  padding: 6px 10px;
  font-size: 12px;
  opacity: 0.7;
}

.menu-info.migrated {
  color: #8a6d1a;
  opacity: 1;
}

.menu-warn {
  padding: 6px 10px;
  font-size: 12px;
  color: #b3543a;
}

.menu-item {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 14px;
  color: #3d5a3d;
  cursor: pointer;
}

.menu-item:hover {
  background: rgba(127, 176, 105, 0.2);
}

.menu-item.danger {
  color: #b3543a;
}

.menu-item.danger:hover {
  background: rgba(179, 84, 58, 0.12);
}

.hidden-input {
  display: none;
}

/* 操作反馈气泡 */
.notice {
  position: absolute;
  top: calc(100% + 8px);
  right: 48px;
  white-space: nowrap;
  padding: 6px 12px;
  background: #3d5a3d;
  color: #fff;
  font-size: 12px;
  border-radius: 8px;
  pointer-events: none;
}

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.2s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
