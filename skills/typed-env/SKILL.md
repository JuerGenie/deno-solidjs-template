---
name: typed-env
description: Use when a project needs environment variables — adding typed/validated env with env.ts and virtual:env/client or virtual:env/server, documenting .env.example, or separating build-time public vars from runtime server secrets. Triggers include env.ts, VITE_ prefix, SESSION_SECRET, virtual:env.
---

# 类型化环境变量

用 `@solidjs/vite-plugin` 的 start 特性给环境变量加上**类型 + 校验 +
泄漏防护**： 根目录 `env.ts` 声明 schema，客户端变量（`VITE_`
前缀）构建期烘入，服务端变量启动时从 `process.env` 校验。

## 何时使用

- 需要读取 `VITE_*` 公共变量，或需要密钥类服务端变量并希望启动即校验。
- 手工 `process.env` / `import.meta.env`
  开始散落、缺类型或担心把密钥打进前端时。

## 前置检查（sentinel）

仓库根已有 `env.ts` → 已安装，跳过 Apply。

## Apply

### 1. env.ts（仓库根，插件自动探测）

```ts
import { z } from "zod";

// server：服务端启动时从 process.env 读取并校验（同步 validator）。
// 密钥不会出现在任何构建产物里；缺失/非法则启动失败。
// client：必须有 VITE_ 前缀；构建期校验并烘入 bundle，切勿放密钥。
export default {
  server: {
    // SESSION_SECRET: z.string().min(32),
  },
  client: {
    VITE_APP_NAME: z.string().min(1).default("Deno + Solid"),
  },
};
```

领域类型直接从 schema 推导（`z.output`），不要手写重复类型。

### 2. .env.example（提交；`.env` 已在 .gitignore）

```sh
# cp .env.example .env 或在部署平台注入真实值。
# 每个变量都在 env.ts 里声明并校验，这里只做说明与占位。

# SESSION_SECRET=
# 生成一个：openssl rand -base64 32
```

### 3. solid-env.d.ts 的类型接线

插件在每次 dev/build 启动时生成 `solid-env.d.ts`（不要手改）。 在
`src/vite-env.d.ts` 里加一行，让 `deno check` 认识 virtual 模块：

```ts
/// <reference types="../file-routes.d.ts" />
/// <reference types="../solid-env.d.ts" />
```

把生成物提交进仓库（避免没跑过 vite 的环境类型缺失）；`skills/project-hygiene`
已把它排除出格式化。

### 4. 使用

```tsx
// 任意模块（包括客户端组件）
import { env } from "virtual:env/client";
env.VITE_APP_NAME; // 类型来自 schema，构建期定值
```

```ts
// 仅限服务端模块：middleware、"use server" 模块、服务端入口
import { env } from "virtual:env/server";
env.SESSION_SECRET; // 启动时校验后的 process.env
```

### 5. start 任务加载 `.env`

让生产入口在本地也能读到 `.env`（文件不存在只警告）：

```jsonc
"tasks": {
  "start": "deno run --env-file=.env --allow-net --allow-read --allow-env server.js"
}
```

## 规则（违反多为硬错误）

- client 变量必须带 `VITE_` 前缀；没有前缀的会被配置期拒绝。
- server validator 必须同步；async refinement/transform 会在配置期报错（client
  变量可在构建期 await）。
- 在客户端模块图里 import `virtual:env/server` 是**硬错误**，并会点名违规 import
  方。
- 构建时 client 校验失败会直接失败；server
  校验失败只警告（构建机可能没有生产密钥），启动时强校验。
- 直接写 `process.env` 的服务端代码同样能看到 `.env` 文件加载的值（插件会并入
  `process.env`），但优先用 `virtual:env/server` 以获得类型。

## Verify

```sh
deno task check                       # virtual:env/* 类型可用
deno task build                       # client 变量烘入；故意写错 VITE_ 变量应构建失败
PORT=3105 deno task start             # server 变量启动校验
curl -s localhost:3105/ | grep -o "Deno + Solid" | head -1
```

## 记录能力

在 `AGENTS.md` 的 `## Enabled capabilities` 追加：`- typed-env (<日期>)`。

## 组合注意

- 与 `skills/testing` 组合：server project 需要 alias + stub 替代
  `virtual:env/server`（见该技能第 2 步）。
- 上线时不要依赖构建期注入 server 变量——部署平台在运行时注入即可，无需重建。
