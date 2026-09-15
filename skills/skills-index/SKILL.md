---
name: skills-index
description: Use when starting a task in this project and unsure which skill or document to read — a navigation hub mapping intents to the main skill, capability skills (hygiene/testing/typed-env/ci), docs/architecture.md, docs/development.md, and the versioned diagnostics skill. Triggers include where to start, which skill, project navigation, index, overview.
---

# 导航：这个项目该读什么

一个路由表，不是教程。先在这里定位，再去读对应技能/文档的正文——
**一次只加载需要的那个**，不要把技能全部读一遍。

## 意图 → 去处

| 我要做的事                                                                | 读这个                                                         | 说明                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| 第一次接触项目：跑起来、加页面/API/契约过程/数据查询、调试                | `skills/deno-solidjs-app/SKILL.md`                             | 常驻主技能：上手命令、心智模型、R1–R7 配方      |
| 加格式化门禁、统一风格、要一条 `deno task verify`                         | `skills/project-hygiene/SKILL.md`                              | 可选能力，先看其 sentinel 是否已装              |
| 装测试基建 / 写测试                                                       | `skills/testing/SKILL.md`                                      | Vitest 双 project（client jsdom + server node） |
| 加环境变量（类型、校验、防泄漏）                                          | `skills/typed-env/SKILL.md`                                    | `env.ts` + `virtual:env/*`                      |
| 开发 / 打包桌面应用（dev 模式、窗口/打印、.app / .dmg / .msi / .AppImage） | `skills/deno-desktop/SKILL.md`（+ 同目录 `packaging.md` / `printing.md`） | 技能集：Deno ≥ 2.9；统一 `start.ts` 宿主        |
| 加 GitHub Actions CI                                                      | `skills/ci/SKILL.md`                                           | 硬前置：已装 hygiene + testing                  |
| 理解分层、请求怎么走、边界为什么这么划                                    | `docs/architecture.md`                                         | 含 `/posts` 全链路示例                          |
| 查规则细节：Solid 2.0 反模式、路由数据 API、oRPC、Zod 4、Tailwind 4、Deno | `docs/development.md`                                          | 权威开发规范；按章节查阅                        |
| 遇到 Solid 诊断码（`STRICT_READ_UNTRACKED` 等）                           | `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` | 按编码对号入座，勿盲改                          |
| 技能怎么组合、怎么新增、如何被外部项目引用                                | `skills/README.md`                                             | 技能库的元信息与应用协议                        |
| 项目硬规则速览（契约先行、边界、props 等）                                | `AGENTS.md`                                                    | Agent 总入口，本技能只做导航                    |

## 能力装载状态（先检测，再决定读不读）

```sh
grep -q '"verify"' deno.json && echo "hygiene: installed"   || echo "hygiene: not installed"
test -f vitest-setup.ts         && echo "testing: installed" || echo "testing: not installed"
test -f env.ts                  && echo "typed-env: installed" || echo "typed-env: not installed"
test -f .github/workflows/ci.yml && echo "ci: installed"      || echo "ci: not installed"
test -f start.ts && grep -q '"prod:desktop"' deno.json && echo "desktop: installed" || echo "desktop: not installed"
```

- `not installed` + 任务命中 → 读对应 SKILL 走 Apply 流程；装完记得在
  `AGENTS.md` 的 `## Enabled capabilities` 追加一行。
- `installed` → 直接干活，用该技能 Verify 章节的命令验收。
- **不要**为了"以后可能用到"安装技能。

## 阅读顺序（新任务）

先读本技能定位 → 主技能找配方（或直接查 `docs/development.md` 对应章节）→ 动手 →
按 `AGENTS.md` 的 Verification loop 验收；已装 hygiene 则 `deno task verify`。

## 30 秒项目地图

```
src/protocol/contract.ts   契约（唯一真相）
src/server/                实现 + 数据访问 + 服务端 client
src/lib/api.ts             server functions：UI 唯一数据缝（query / action）
src/routes/                文件路由：页面 + api/rpc（外部 oRPC 端点）
src/middleware.ts          请求中间件链
docs/                      架构 + 开发规范
skills/                    按需能力模块（本文件是导航）
```

命令：`deno task dev | check | lint | build | start | serve`（+ 启用技能后的
`verify` / `test`）。
