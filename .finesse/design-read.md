# Design Read — 识界（zhishi2.0） 第一次 run

日期：2026-09-03

## Register

个人工作台（product-ui · operate 为主）+ 移动 H5（morph A.1）**双形态同步**。
用户首屏 = 工具台 `/dashboard`。AI 是加工能力（消化/助理），非主角。

## Dials

| Dial | 值 |
|---|---|
| SPECTACLE | 工具台正文 1–2 / 首页引力场窗口 3 / 星图·图谱 5–7 |
| DENSITY | 手机 4 · 桌面 5 |
| Motion | 只花在"变的状态"上（数据驱动） |
| 载体 | 手机 + 桌面同一套 token，双形态精修 |

## Soul（用户修订版）

**一抬头，看见自己会长成的样子。**
工具台首页 = 第一画面，要惊艳、让用户喜欢、引发对"未来的自己"的畅想 →
顶部嵌入唯一**有界的深空「引力场窗口」**：沉淀一颗原子点亮一颗星，
未沉淀呈暗座轮廓（暗示会亮），素材流入如光点划入。
惊艳来自**用户自己的数据**，不是装饰粒子。

## Motion（route）

- 正文/列表/卡片：CSS + WAAPI（≤200ms），motion-reduce 尊重。
- 引力场窗口：Canvas 2D，入场逐点亮起 + 素材光点缓落（周期动画轻）。
- 图谱/星图：各自 Canvas（后续 craft）。

## Not right

炫技大屏感 / 像 ChatGPT / 数字变勋章 / 正文被星尘干扰 /
Hero 越过窗口边界蔓延全页 / 星域与数据脱钩。

## Rotation

项目首次 run，无约束（新模块，cursor 0）。

记录：`.finesse/log.json`
