# deno-solidjs-template

Agent-Native 的 Deno 全栈模板：Solid 2.0 SSR + 类型化契约 + Tailwind 4 +
文件路由， 内置给 Agent 使用的 [AGENTS.md](./AGENTS.md)、[docs/](./docs)
与按需启用的 [skills/](./skills)。

## 技术栈

| 能力            | 选型                                                              |
| --------------- | ----------------------------------------------------------------- |
| 运行时 / 包管理 | Deno（`deno.json` imports + `deno.lock`，无 package.json）        |
| 构建 / SSR      | Vite 8 + `@solidjs/vite-plugin`（turnkey SSR，流式输出）          |
| UI              | Solid 2.0（`solid-js` + `@solidjs/web`）                          |
| 路由            | `@solidjs/router` 2 + `filesystem-routing`（`src/routes` 即路由） |
| 契约 / RPC      | oRPC 2（contract-first）+ Zod 4                                   |
| 样式            | Tailwind CSS 4（CSS-first）                                       |

## 快速开始

```sh
deno install
deno task dev        # http://localhost:3000
```

生产 / 桌面：

```sh
deno task build        # dist/client + dist/server
deno task start        # start.ts 托管（静态资源 + handleRequest）
deno task serve        # 或 vite preview，不写宿主验收生产
deno task dev:desktop  # 桌面容器接 Vite dev-server（客户端 HMR）
```

## 目录

```
src/
  protocol/      # 契约（oc + zod）与传输路径常量 —— 唯一真相
  server/        # 契约实现、数据访问、服务端 client
  lib/           # 应用数据层：server functions（query / action）
  routes/        # 文件路由：页面 + API 路由（api/rpc 为 oRPC 端点）
  middleware.ts  # 每个请求前的 fetch 中间件链
  router.ts      # 文件路由 → createRouter
  App.tsx        # 应用根（Router + Loading / Errored 边界）
  Document.tsx   # 文档壳（html/head/HydrationScript）
start.ts         # 统一宿主：dev 编程式起 Vite；生产托管构建产物（含 deno desktop）
docs/            # architecture.md（架构）· development.md（开发规范）
skills/          # 可选能力模块（测试 / 环境变量 / CI / 工程卫生）
```

## 示例

- `/`：`greet` 表单 —— server function 的写入路径。
- `/posts`：`route.preload` + `query` + 契约 procedure —— 全链路只读数据示例。
- `POST /api/rpc/<procedure>`：oRPC HTTP 端点（body 信封
  `{"json": <input>}`），供外部客户端调用。

## 常用命令

| 命令              | 作用                    |
| ----------------- | ----------------------- |
| `deno task dev`   | 开发服务器（HMR + SSR） |
| `deno task build` | 双端构建                |
| `deno task start` | 生产宿主                |
| `deno task serve` | `vite preview`          |
| `deno task check` | 类型检查                |
| `deno task lint`  | lint                    |

启用 [`skills/project-hygiene`](./skills/project-hygiene/SKILL.md) 后增加
`deno task fmt` 与 `deno task verify`（check + lint + format + build）。

## 给 Agent

- 入口是 [AGENTS.md](./AGENTS.md)；能力模块索引在
  [skills/README.md](./skills/README.md)。
- 不确定该读什么时，先加载
  [skills/skills-index](./skills/skills-index/SKILL.md)（导航技能）。
- 开发规范（Solid 2.0 反模式、路由数据 API、server functions、oRPC/Zod
  4、Tailwind 4）见 [docs/development.md](./docs/development.md)。
- 启用可选能力：让 Agent 读对应技能并按其 Apply 步骤执行，例如"按 skills/testing
  给项目加测试基建"。
