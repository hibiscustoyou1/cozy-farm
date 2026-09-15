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
- ✅ Monorepo 骨架落地并首次提交（main `5abe16a`）：三包架构 + 时间系统（gameTime/调速/离线结算）+ 双端布局骨架，install / typecheck / dev / build 全绿
- ✅ M0 收尾：存档框架（`f18bb98` 之后）：core 存档系统（信封/校验/迁移链）+ localStorage 双写轮换（损坏自愈/内存降级）+ 自动存档（30s 定时/关键操作 3s 防抖/页面隐藏与关闭前）+ JSON 导入导出 + 存档菜单（手动保存/重置）；vitest 全绿
- ✅ M1 前置：静态资源基础已入库：Ellen0ra 16×16 环境图块为主视觉，Mossbell / LPC / OpenGameArt / Tiny Farm 作补充候选，临时 BGM 与原创像素图标已就绪；见 `docs/资源来源与授权.md`
- ✅ M1：种植循环：core `systems/farming.ts`（锄/种/浇/收 + 快速买种 + 经验升级）+ 生长累计模型（断水暂停、补浇续长；存档升 v3：tile 增 `grownMs`/`lastGrowthAt`）+ Phaser 农场网格（5×4、拖动批量、hover 红绿高亮、成熟弹跳、收获粒子）+ 工具栏（桌面左栏/移动底栏）+ 种子面板（当季可购、反季可种）+ toast 反馈
- ⬜ M2 经济：正式商店 + 背包出售 + 扩地（200/500/1200/3000…上限 10×8=80 格）+ 经验曲线平衡 + 图鉴雏形

里程碑路线图见方案文档 §六。

## 新对话从这里开始

1. 读完本文（AGENT.md）
2. 按需查阅 `docs/` 下的方案与理念文档（不必全读）
3. 跑 `git log --oneline` 看最近提交，对照上方"当前状态"确认进度
4. 从第一个 ⬜ 项继续，或听用户的具体指示

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

## 存档框架速查（M0）

- 分层：core `systems/save.ts`（纯逻辑：信封/校验/迁移链）↔ app `save/`（storage.ts 双写轮换、autoSave.ts 三时机、fileIO.ts 导入导出）
- localStorage 两槽 `cozy-farm:save:a|b` 交替写，信封 `seq` 比新旧；一槽损坏自动回退另一槽
- localStorage 不可用（隐私模式等）→ 内存降级，UI 顶栏 💾 变红提示
- 自动存档三时机：30s 定时 + 关键操作 3s 防抖（`store.notifyGameAction()`）+ 页面隐藏/关闭前
- 当前 `SAVE_VERSION=3`（v3：tile 增 `grownMs`/`lastGrowthAt` 支持断水续长）；结构变更：递增 `SAVE_VERSION` + 在 `MIGRATIONS` 链补函数 + 补单测

## 种植循环速查（M1）

- 状态机：`wild →(锄)→ tilled →(种)→ growing →(浇水保湿 1 游戏日)→ mature →(收)→ tilled`
- 生长模型：湿润窗口 `[plantedAt, wateredUntil)` 内的 gameTime 才计入 `grownMs`；断水只暂停不倒退，补浇从断点续长（`advanceGrowth` 每帧结算）
- 种植不限季（种子是玩家财产）；季节只过滤商店货架；等级解锁作物
- 交互：game 层 `FarmHooks`（getState 只读 + onTileActivate 上报 + canActivate 高亮判定），工具语义由 app store `applyTool` 解释
- 作物素材：Mossbell 6 物种 × 4 阶段；corn/eggplant/watermelon 借近似素材 + tint（`game/src/visuals.ts`，TODO 换专属素材）

## 常用命令

```bash
pnpm install        # 安装依赖（workspace 全部包）
pnpm dev            # 启动开发服务器（host 模式，手机可访问 http://<本机IP>:5173）
pnpm build          # 构建 app 产物
pnpm typecheck      # 全部包类型检查
pnpm test           # 全部包单测（core + app，vitest）
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
