# Hackathon Live · 活动大屏

黑客松现场的「大屏 + 后台」两人组：一块屏幕，两种形态 —— **倒计时**与**格言**，后台点几下就能换。

- **大屏** `/`：全屏投放，深色 HUD 风格，倒计时数字带入场动画，格言有三种切入动画（默认「切入」，逐词从遮罩里推上来）与 9 个落位。
- **后台** `/admin`：无登录，改完即生效；右侧 16:9 实时预览（滚动时固定跟随），未发布的改动随时可整体或按节撤销。

## 功能

### 倒计时
- 主标题 / 副标题 / 目标时间 / 开始时间
- 四个单位文案写死为 DAYS / HOURS / MINUTES / SECONDS（后台不再提供设置，避免误改）
- 倒计时结束文案（走到 00:00:00 之后显示的内容）
- 进度条（依据开始时间 → 目标时间计算百分比）、右上角时钟可单独开关
- 数字逐位变化时播出轻量入场动画，长时投放不刺眼

### 格言
- 多句内容按行录入，按间隔自动轮换（0 = 不轮换）
- 落位：3×3 九宫格（左上 / 上 / 右上 / 左 / 中 / 右 / 左下 / 下 / 右下）
- 对齐：左对齐 / 居中 / 右对齐
- 字号：24–160（以 1920×1080 为基准，实际按屏幕等比缩放）
- 切入动画共三种：**切入（默认，自下遮罩）** / 左侧滑入 / 右侧滑入
- 「切入」按「词」为单位从下方遮罩里推上来：英文整词、中文逐字、标点贴住前词，逐词延迟 58ms（上限 980ms），每次换句重播
- 可选署名（落款）

### 展示方式
- 固定倒计时、固定格言，或**自动轮播**，轮播有两种规则：
  - **整点对齐（默认）**：按剩余时间逼近整点的时刻切到倒计时。剩余 1 小时以上对齐整小时，1 小时内对齐 30 / 20 / 10 分钟，最后 10 分钟对齐每分钟；在整点前 `autoLeadSeconds` 秒（默认 60）切入，跨过整点后再停留 `autoHoldSeconds` 秒（默认 45）回到格言，其余时间只显示格言
  - 关闭整点对齐后回到按 `autoSeconds` 定时交替
- 时间全部由浏览器按时间戳计算，多台屏幕不会各切各的

### 主题
- 主色 / 辅色双色板、网格背景、氛围光晕、扫描线质感

### 后台体验
- 顶部常驻「已同步 / 未发布」状态与一键保存，未保存时浏览器标题带圆点
- 每张卡片可「还原本节」
- 时间填错（开始 ≥ 结束）会同时给出顶部错误摘要与字段内联提示，并禁止发布
- 标题/副标题有字数计数，数字项统一为步进器（HeroUI `NumberField`）
- 保存成功在底部弹出 Toast，并提示大屏同步延迟；`Ctrl / ⌘ + S` 随时发布
- 关闭整点对齐时才出现「每屏停留」；开关关闭的项不占版面

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15（App Router，两个路由都是 `force-dynamic`） |
| UI | React 19 + HeroUI v3（`@heroui/react` + `@heroui/styles`），后台控件全部为原生组件：`ToggleButtonGroup` / `NumberField` / `Slider` / `Switch` / `Card` / `ColorArea` + `ColorField` / `Input` / `TextArea` / `Button` |
| 样式 | Tailwind CSS v4（`@theme inline` + 自定义大屏样式）；`<html class="dark">` 启用 HeroUI 暗色 token，组件皮肤由 `globals.css` 的 `.seg-group` / `.pos-grid` / `.num-field` / `.chip` 微调 |
| 字体 | Space Grotesk + JetBrains Mono（next/font） |
| 数据 | 本地 JSON 文件 `data/config.json`，无数据库、无登录 |

## 运行

```bash
npm install
npm run dev      # http://localhost:3000 大屏，/admin 后台
npm run build && npm run start   # 生产模式
npm run typecheck                # tsc --noEmit
```

## 数据流

```
后台表单（draft）
  ├─ Ctrl/⌘ + S ─→ POST /api/config ─→ normalizeConfig ─→ data/config.json（原子写 + revision 自增）
  ├─ 右侧预览 ─→ iframe src="/?preview=1"，通过 postMessage 推 draft，所见即所得
  └─ 脏数据时离开页面会拦截

大屏 /（独立打开）
  ├─ 服务端读取 config 首屏渲染（无闪烁）
  └─ 每 4 秒轮询 /api/config，revision 变了才重渲染（不打断正在播的动画）
```

所有写入口径统一走 `normalizeConfig`：字段缺失、类型错误、越界值都会被收敛到安全区间，坏配置不会把大屏搞白屏。

## 目录

```
src/
  app/
    page.tsx              大屏入口
    admin/page.tsx        后台入口
    api/config/route.ts   GET 读取 / POST 保存
    globals.css           设计系统（舞台、倒计时、格言、后台）
  components/
    display/Stage.tsx         舞台骨架（顶栏、光晕、网格、模式判定）
    display/CountdownView.tsx  倒计时
    display/MottoView.tsx      格言（动画 / 落位 / 轮换）
    display/LiveConfigHost.tsx 大屏外壳（自动同步 + iframe 预览桥）
    admin/AdminConsole.tsx     控制台
  lib/
    config.ts  类型 + 默认值 + normalizeConfig
    store.ts   文件读写 + revision
    time.ts    本地时间解析与格式化
data/config.json   运行时配置
```

## 投放建议

- 现场用 Chrome / Edge 全屏（F11）打开 `/`，分辨率建议 1920×1080 及以上
- 主持人快捷键（只作用在当前这台大屏、不写回配置）：`1` 倒计时、`2` 格言、`3` 自动轮播、`0` / `Esc` 恢复后台设定
- 后台建议只在内网开放：**没有登录**，任何能访问 `/admin` 的人都能改内容
- 想换素材最快的方式：改 `data/config.json` 后等 4 秒，或直接在后台改并保存
- 需要接 OBS / 直播：把 `/` 作为浏览器源叠加即可（背景自带深色底与光晕）
