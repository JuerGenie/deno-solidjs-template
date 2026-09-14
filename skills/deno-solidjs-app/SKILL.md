---
name: deno-solidjs-app
description: Use when working in this Deno + SolidJS 2.0 + oRPC + Tailwind v4 full-stack template (or a project derived from it) — running dev/build tasks, adding page routes, API routes, contract procedures, server functions or router queries, or debugging Solid reactivity. Triggers include deno task, deno.json, src/routes, src/protocol/contract.ts, "use server", filesystem-routing, oRPC, Vite SSR.
---

# Deno + Solid 2.0 全栈应用

本技能是这个模板的**操作入口**：怎么跑、怎么加东西、怎么验证。
深度规则与各库最佳实践在仓库根的 `docs/development.md`，架构与数据流在
`docs/architecture.md`； 可选基建（格式化门禁、测试、类型化 env、CI）在
`skills/README.md` 索引的技能模块里，按需加载。

## 3 分钟上手

```sh
deno task dev      # Vite 开发服务器（SSR + HMR），端口 3000
deno task check    # 类型检查
deno task lint     # lint
deno task build    # dist/client（静态资源）+ dist/server（handleRequest）
deno task start    # server.js 托管生产产物
deno task serve    # vite preview（不写宿主验收生产）
```

依赖只由 `deno.json` 的 `imports` 管理（无
`package.json`）：`deno add npm:pkg@version` 会同时更新
`deno.lock`。新增命令写进 `deno.json` 的 `tasks`。

## 心智模型

```
UI (src/routes, src/App.tsx)
  └─ src/lib/api.ts —— server functions（UI 唯一数据缝）
       └─ src/server/client.ts —— createRouterClient（服务端进程内直调；换远端改这里）
            └─ src/server/orpc.ts —— implement(contract) 的实现
                 └─ src/server/data.ts —— 数据访问
契约：src/protocol/contract.ts（oc + zod）
HTTP 面：src/routes/api/rpc/[...rest].ts（RPCHandler，外部客户端用）
文件路由：filesystem-routing 扫描 src/routes；中间件链在 src/middleware.ts
```

- 服务端渲染时 server function 是普通函数调用；浏览器里编译器把它变成对
  `/_server` 的类型化 fetch。
- 页面数据用 router 的 `query()` + `route.preload`；写入用 `action()` +
  表单，router 自动重验证。
- 外部客户端用 `/api/rpc`（oRPC 标准协议，`POST` JSON 信封
  `{"json": <input>}`）。

## 边界规则（必须遵守）

1. 改 API 一律从 `src/protocol/contract.ts` 开始：契约 → 实现 → `src/lib/api.ts`
   → UI。
2. UI 只 import `src/lib/api.ts`；不 import `src/server/*`，不建浏览器端 oRPC
   client。
3. `"use server"` 参数/返回值必须可序列化（默认 JSON）；函数体与静态 import
   只进服务端包。
4. Solid 2.0：props 传值不解构；`createEffect(compute, apply)` 双参；不在 owned
   scope 写信号； 异步派生用 `createMemo` + `<Loading>`，不要 `createResource` /
   `Suspense` / `batch`（见 `docs/development.md` §2.10）。
5. Tailwind 类名必须字面量完整出现，不要动态拼接。
6. 不新增架构层；数据访问收口在 `src/server/*`，页面代码不进 `src/server/*`。

## 配方

### R1 加页面

`src/routes/about.tsx`：

```tsx
import { Title } from "@solidjs/meta";

export default function About() {
  return (
    <main class="p-6">
      <Title>About</Title>
      <h1>About</h1>
    </main>
  );
}
```

文件名即路径：`posts/[id].tsx` → `/posts/:id`，`[[page]].tsx`
可选段，`[...path].tsx` 通配，`(group)/` 不进 URL。

### R2 加布局路由

`blog.tsx`（布局）+ `blog/`（子页面目录）：

```tsx
import type { ParentProps } from "solid-js";

export default function BlogLayout(props: ParentProps) {
  return (
    <section class="mx-auto max-w-2xl">
      {props.children}
    </section>
  );
}
```

### R3 加 API 路由（非 oRPC 的普通 HTTP）

`src/routes/api/health.ts`：

```ts
import type { APIHandler } from "filesystem-routing/api";

export const GET: APIHandler = () => Response.json({ ok: true });
```

无默认导出 = 不是页面，handler 与其 import 不进客户端包；只写 `GET` 会自动兜
`HEAD`。

### R4 加一个契约 procedure（四步）

以 `post.create` 为例：

```ts
// 1) src/protocol/contract.ts —— 契约
post: {
  create: oc
    .input(z.object({ title: z.string().min(1, { error: "Title is required" }) }))
    .output(postSchema),
},
```

```ts
// 2) src/server/orpc.ts —— 实现（漏了/放错 key 直接编译失败）
post: {
  list: os.post.list.handler(({ input }) => listPosts(input.limit)),
  create: os.post.create.handler(({ input }) => createPost(input)),
},
```

```ts
// 3) src/lib/api.ts —— 应用数据层：读 query / 写 action
export const createPost = action(async (title: string) => {
  "use server";
  return await client.post.create({ title });
}, "create-post");
```

```ts
// 4) UI 调用（表单接法见 R6）
await createPost("Hello from the UI");
```

领域类型从 schema 推导（`z.output<typeof schema>`），不要手写 interface。错误用
`ORPCError` / `os.errors({...})`；`message`、`data`
会发给客户端，不要放敏感信息。

### R5 页面数据读取（query + preload）

```ts
// src/lib/api.ts
export const getPosts = query(async () => {
  "use server";
  return await client.post.list({ limit: 10 });
}, "posts");
```

```tsx
// src/routes/posts.tsx
export const route = {
  preload: () => void getPosts(), // 导航开始/链接 hover 时预热
} satisfies RouteDefinition;

export default function Posts() {
  const posts = createMemo(() => getPosts());
  return <For each={posts()}>{(post) => <article>{post.title}</article>}</For>;
}
```

未就绪读取由最近的 `<Loading>`（`src/App.tsx`）兜底；变更指示用
`isPending(() => posts())`。 query key（第二个参数）用于 action
后的定点重验证，`getPosts.keyFor(...)` 可精确到参数。

### R6 写入（action + 表单）

表单绑定的是接收 `FormData` 的 action（与 R4 的程序调用签名不同）：

```ts
// src/lib/api.ts
export const createPostForm = action(async (form: FormData) => {
  "use server";
  await client.post.create({ title: String(form.get("title") ?? "") });
}, "create-post-form");
```

```tsx
function NewPost() {
  return (
    <form action={createPostForm} method="post">
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

action 必须 POST；提交中自动 `aria-busy`；无 JS 也可用；router
在落定后重取受影响的 query。 乐观 UI 用 `createOptimisticStore`（见
`docs/development.md` §4.2）。

### R7 Tailwind 令牌与条件类

```css
/* src/App.css */
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.72 0.11 221.19);
}
```

```tsx
function Tag(props: { selected: boolean; children: string }) {
  return (
    <span
      class={["rounded-lg px-2 py-0.5", { "bg-brand-500": props.selected }]}
    >
      {props.children}
    </span>
  );
}
```

`@theme` 变量自动生成工具类；条件类用 `class`
数组/对象；完整类名字面量，禁止拼接。

## 调试

- 控制台/测试里的 Solid 诊断码 → 先读
  `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` 对应条目再改。
- 页面 500：看 `handleRequest` 抛错前打印的 `Errored` 信息；SSR
  阶段错误直接出现在 dev 终端。
- `/posts` 这类页 404：确认 `file-routes.d.ts` 已由 dev/build
  重新生成（新增路由后需再跑一次 vite）。
- oRPC 端点 404：确认 `prefix` 与 `src/protocol/transport.ts` 的 `rpcPath`
  一致。
- 生产宿主行为：`server.js` 先静态资源后 `handleRequest`；`/` 不落静态分支。

## 验证

```sh
deno task check && deno task lint && deno task build
# 生产冒烟
PORT=3105 deno task start &
curl -s localhost:3105/posts | grep -o "<h1[^>]*>Posts"
curl -s -X POST localhost:3105/api/rpc/greet -H 'content-type: application/json' -d '{"json":{"name":"world"}}'
```

启用 `skills/project-hygiene` 后加 `deno task fmt`，一键闭环
`deno task verify`； 启用 `skills/testing` 后加 `deno task test`。

## 参考

- `skills/skills-index/SKILL.md` —— 导航：意图 → 技能/文档路由表
- `docs/development.md` —— 开发规范（Solid 2.0 / 路由 / server functions / oRPC
  / Zod 4 / Tailwind 4 / Deno）
- `docs/architecture.md` —— 分层、数据流、请求旅程
- `skills/README.md` —— 可选能力模块与组合方式
