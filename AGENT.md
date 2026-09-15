# AGENT.md — AI 协作者须知

> 本文件面向在本仓库工作的 AI 助手（以及未来的自己）。开始任何工作前请先读完本文。

## 这是什么项目

**《四季田园》**（工作名）—— 治愈系田园经营 H5 小游戏。**个人自用项目，不商业变现**。

- 平台：网页 H5，必须同时适配桌面大屏与移动端（含刘海屏安全区）
- 核心特色：**在线时间流速手动可调**（⏸/1x/2x/5x/10x），离线固定 1x
- 设计基调：无失败、无压力、有惊喜（详见 `docs/设计理念.md`）

## 当前状态

- ✅ 市场调研完成（`docs/田园经营游戏市场调研报告.md`）
- ✅ 方案设计 v2 定稿（`docs/田园小游戏方案设计.md`）
- ✅ Monorepo 骨架搭建（本提交）
- ⬜ M0：脚手架完善（进行中 —— 骨架已立，待安装依赖验证）
- ⬜ M1：种植循环（网格 + 锄地/种植/浇水/收获 + 离线结算）

里程碑路线图见方案文档 §六。

## 技术栈与仓库结构

pnpm workspace monorepo，Node ≥ 20.19：

```
packages/
├── core/    系统层：纯 TS。GameState、TimeSystem、作物配置、数值表。
│            ⚠️ 零框架依赖 —— 禁止 import vue / pinia / phaser
├── game/    表现层：Phaser 场景与 Canvas 渲染。只读 GameState。
│            ⚠️ 禁止 import Vue 组件 / Pinia（仅允许类型导入）
└── app/     应用层：Vue3 + Pinia 面板 UI、Phaser 挂载、存档读写、Vite 构建
```

依赖方向（单向）：`app → game → core`，`app → core`。

## 架构铁律（改代码前必读）

1. **GameState 是唯一真相源**，必须始终保持纯 JSON 可序列化（无类实例/函数/循环引用）
2. **高频数据不进 Vue 响应式**：gameTime、生长进度等由 Phaser/rAF 直接读原始对象（`shallowRef` 持有），绝不套 Vue Proxy
3. **单向数据流**：UI 操作 → core 系统函数改 state → 渲染层下一帧自然读到；禁止渲染层直接改状态
4. **所有游戏逻辑时间一律用 gameTime 坐标**（`state.gameTime`），禁止用 `Date.now()` 参与游戏逻辑；唯一例外是 `lastSeen`（离线结算换算用）
5. core 包新增系统时：类型进 `types.ts`，常量进 `constants.ts`，数值表进 `config/`，逻辑进 `systems/`，并在 `index.ts` 统一导出

## 时间系统速查（本作最核心机制）

- `gameTime`：游戏时钟毫秒数，1 游戏日 = 24 现实分钟（1x 下）
- 在线推进：`tick(state, deltaMs)` → `gameTime += delta × speed`
- 离线结算：`settleOffline(state, nowReal)`，固定 1x，上限 8 现实小时
- 季节：7 游戏日一季，4 季一年；换季不惩罚（在地作物继续长，只是种子下架）
- 浇水：保湿 1 游戏日，过期**暂停**生长（不枯萎 —— 无失败原则）

## 常用命令

```bash
pnpm install        # 安装依赖（workspace 全部包）
pnpm dev            # 启动开发服务器（host 模式，手机可访问 http://<本机IP>:5173）
pnpm build          # 构建 app 产物
pnpm typecheck      # 全部包类型检查
```

## 约定

- TypeScript strict 模式 + `noUncheckedIndexedAccess`，不写 any
- 组件/函数注释说明"为什么"，而不是复述"做了什么"
- 存档结构变更必须递增 `GameState.version` 并写迁移函数
- 提交信息：中文，`类型: 描述`（feat / fix / docs / chore / refactor）
- 美术资源只从 `docs/美术风格.md` 认可的渠道获取，整套同作者，先确认授权

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/田园经营游戏市场调研报告.md` | 市场产品盘点、功能卖点、付费模式分析 |
| `docs/田园小游戏方案设计.md` | 完整方案 v2：玩法系统、数值表、架构、里程碑 |
| `docs/设计理念.md` | 三原则、时间哲学、反模式清单 |
| `docs/美术风格.md` | 像素风规范、四季色板、资源选型原则 |
