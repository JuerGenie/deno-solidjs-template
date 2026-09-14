# 开发规范

- 版本：v1.0（2026-09-14）
- 适用范围：本模板及由其派生的项目
- 版本基线：Solid 2.0 RC、`@solidjs/router` 2 next、Vite 8、oRPC 2 beta、Zod
  4、Tailwind 4、Deno 2.9+
- 每条规则都对齐对应版本的官方文档或包内文档（来源见文末）

> 对 Agent 的提醒：Solid **不是 React**，2.0 **不是 1.x**。写代码前先过一遍
> §2.10 的对照表； 遇到诊断码先查
> `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`。

## 0. 验证闭环

改动完成后至少跑：

```sh
deno task check   # deno check src：类型
deno task lint    # deno lint src
deno task build   # 双端构建：dist/client + dist/server
```

冒烟（可选但推荐）：

```sh
deno task build && PORT=3105 deno task start &
curl -s localhost:3105/ | head -c 300
curl -s localhost:3105/posts | grep -o "<h1[^>]*>Posts"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3105/nope        # 期待 404
curl -s -X POST localhost:3105/api/rpc/greet \
  -H 'content-type: application/json' -d '{"json":{"name":"world"}}' # 期待 {"json":{"message":"Hello, world!"}}
```

启用 `skills/project-hygiene` 后升级为 `deno task verify`（格式化 + lint +
类型 + 构建一键过）。 `skills/testing` 提供 `deno task test`。

## 1. 目录与命名

| 位置                | 放什么                                   | 命名                                                                     |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `src/routes/**`     | 页面与 API 路由（文件路由）              | 遵循路由约定：`index.tsx`、`posts.tsx`、`posts/[id].tsx`、`[...404].tsx` |
| `src/components/**` | 可复用组件（自行创建）                   | PascalCase 文件与组件名，`UserCard.tsx`                                  |
| `src/lib/**`        | 应用数据层（server functions）与前端工具 | 小写模块名，`api.ts`、`format.ts`                                        |
| `src/protocol/**`   | 契约与传输常量                           | `contract.ts`、`transport.ts`                                            |
| `src/server/**`     | 服务端实现、数据访问、server-only 工具   | `orpc.ts`、`data.ts`、`client.ts`                                        |
| `tools/**`          | 无头脚本（smoke、sim；由技能引入）       | 小写                                                                     |
| `docs/**`           | 架构与规范                               | kebab-case                                                               |

约定：代码注释用英文（与库生态一致），文档用中文；一个模块一个职责；`src/server/*`
里不写 UI 的东西。

## 2. Solid 2.0

### 2.1 核心心智

组件只运行一次，没有 re-render；更新由信号沿依赖图细粒度传播。不要代入 React
的"重渲染 → 重新执行组件体"模型。

### 2.2 信号与派生

```ts
const [count, setCount] = createSignal(0);
setCount(1);
count(); // 仍是 0 — setter 之后要等 flush（微任务）才可见
flush();
count(); // 1

const doubled = createMemo(() => count() * 2);
```

- 测试里断言信号：`setCount(1); flush(); expect(count()).toBe(1)`。
- 派生优先 `createMemo`，不要用 effect 把值搬进另一个信号（诊断
  `EFFECT_RELAY_TEAR`）。

### 2.3 props：值语义，禁止解构

```tsx
// 调用方：传值，不传 accessor
<Counter value={count()} />        // ✅
<Counter value={count} />          // ❌ 子组件拿到的是函数

// 子组件：通过 props.x 读取（属性访问本身建立追踪）
function Counter(props: { value: number }) {
  return <div>{props.value}</div>;  // ✅
}
function Counter({ value }: { value: number }) {
  return <div>{value}</div>;        // ❌ 解构后失去反应性
}
```

合并/剔除用 `merge` / `omit`（替代 1.x 的 `mergeProps` / `splitProps`）：

```ts
const merged = merge(defaults, props);
const rest = omit(props, "class", "style");
```

### 2.4 effects 与生命周期

- `createEffect(compute, apply)` **双参是唯一形式**；compute 里追踪，apply
  里做副作用并可选返回清理函数。
- 组件级"初始化 + 清理"用 `onSettled` 返回清理函数；`onCleanup`
  只用于计算内部的反应式清理。

```ts
onSettled(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});

createEffect(
  () => count(),
  (value, prev) => console.log(prev, "→", value),
);

createEffect(() => count(), (v) => log(v), { defer: true }); // 跳过首跑
```

### 2.5 异步与边界

异步就是"返回 Promise / AsyncIterable 的 computation"，没有 `createResource`：

```tsx
const posts = createMemo(() => getPosts());

<Loading fallback={<p>Loading…</p>}>
  <For each={posts()}>{(post) => <article>{post.title}</article>}</For>
</Loading>;
```

- 未就绪的读取会抛给最近的 `<Loading>`；错误抛给 `<Errored>`。
- 变更中的指示用 `isPending(() => posts())`；过渡期间展示输入值用 `latest(id)`。
- `refresh(x)` 重问同一问题（静默）；要让刷新表现为
  pending：`affects(x); refresh(x)`。
- 服务端渲染按流式输出：壳先到，`Loading` 边界的内容随后补丁进页面。

### 2.6 控制流

```tsx
<For each={items()}>{(item, i) => <Row item={item} index={i()} />}</For>          // 默认按身份
<For each={items()} keyed={false}>{(item, i) => <Row item={item()} index={i} />}</For> // 非 keyed（替代 Index）
<For each={items()} keyed={(t) => t.id}>{item => <Row todo={item()} />}</For>     // 自定义 key
<Repeat count={store.items.length}>{i => <Row name={store.items[i].name} />}</Repeat>

<Show when={user()} fallback={<Login />}>{u => <Profile user={u()} />}</Show>
<Switch fallback={<NotFound />}>
  <Match when={tab() === "a"}><A /></Match>
</Switch>
```

注意 accessor 形态（读的位置错误会冻结在初始值，开发期报
`STRICT_READ_UNTRACKED`）：

| 组件                      | item     | index  |
| ------------------------- | -------- | ------ |
| `<For>` 默认 / 自定义 key | accessor | 普通值 |
| `<For keyed={false}>`     | accessor | 普通值 |
| `<Repeat>`                | —        | 普通值 |

回调体是 owner 而不是追踪作用域：在 JSX / memo / effect 里读
accessor，不要在回调顶部解包。

### 2.7 class、属性与 ref

```tsx
<div class="card" />
<div class={{ active: isActive(), invalid: !valid() }} />
<div class={["card", props.class, { active: isActive() }]} />

<video muted={true} />        // 布尔属性 = 存在/不存在
<div tabindex={0} />          // 内置属性小写；事件仍 camelCase：onClick
```

Ref 是函数；指令用工厂函数 + `ref`（替代 `use:`）：

```tsx
<button ref={(el) => (button = el)} />
<button ref={tooltip({ content: "Save" })} />
<button ref={[autofocus, tooltip({ content: "Save" })]} />
```

事件处理器在挂载时绑定一次，条件别写在绑定表达式里：

```tsx
onClick={(e) => (cond() ? a : b)(e)}   // ✅
onClick={cond() ? a : b}               // ❌ 永远用挂载时的那个
```

### 2.8 Context

默认无值的 `createContext<T>()` 是标准形态：context 本身即 Provider，无 Provider
时读取会抛 `ContextNotFoundError`，不需要 `useXxx` 包装。

```tsx
const CartContext = createContext<Cart>();          // T，不是 T | undefined

<CartContext value={cart}>                          // 不是 <CartContext.Provider>
  <Checkout />
</CartContext>

const cart = useContext(CartContext);
```

### 2.9 常见诊断码

开发构建会在控制台给出稳定编码，先从编码查修复表，不要盲改：

- `STRICT_READ_UNTRACKED`：在非追踪作用域读了信号/解构了 props → 把读移进 JSX /
  memo / effect，或显式 `untrack`。
- `REACTIVE_WRITE_IN_OWNED_SCOPE`：在组件体/计算里写信号 → 移到事件处理器或
  `onSettled`；确属初始化的用 `{ ownedWrite: true }`。
- `MISSING_EFFECT_FN`：`createEffect` 单参 → 拆分 compute/apply。
- `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE`：用 effect 同步派生值 → 改成
  `createMemo`。
- `IMMUTABLE_UPDATE_IN_STORE`：store 里整体替换对象/数组 → 就地改 draft，或
  `reconcile(data, "id")`。
- `UNSTABLE_LIST_IDENTITY`：刷新后整列表重建 → `<For keyed={r => r.id}>` 或
  `reconcile`。
- `SILENT_HOLD` / `LONG_HOLD`：异步写导致长时间无反馈 → `isPending` / `latest` /
  乐观值 / 带 `on` 的 `<Loading>`。
- `NO_OWNER_*` / `RUN_WITH_DISPOSED_OWNER`：生命周期泄漏 → 在组件或 `createRoot`
  下创建。

完整修复表：`node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`。

### 2.10 1.x → 2.0（AI 高风险项速查）

| 1.x                                           | 2.0                                                       |
| --------------------------------------------- | --------------------------------------------------------- |
| `solid-js/web`                                | `@solidjs/web`（`jsxImportSource` 也改为 `@solidjs/web`） |
| `solid-js/store`                              | 并入 `solid-js`                                           |
| `Suspense` / `SuspenseList` / `ErrorBoundary` | `Loading` / `Reveal` / `Errored`                          |
| `mergeProps` / `splitProps`                   | `merge` / `omit`                                          |
| `onMount` / `onCleanup`（组件级）             | `onSettled`（返回清理函数）                               |
| `createResource`                              | 异步 computation + `<Loading>`                            |
| `batch` / `startTransition`                   | 默认微任务批量；`flush()` 立即应用                        |
| `createSelector`                              | `createProjection` 或 `createStore(fn)`                   |
| `Index`                                       | `<For keyed={false}>`                                     |
| `classList`                                   | `class` 的对象/数组形式                                   |
| `<Ctx.Provider>`                              | `<Ctx value>`                                             |
| `use:foo` 指令                                | `ref={foo(...)}`                                          |

行为差异（最容易写出 bug 的点）：props 传值、禁止解构；setter
不立即对读可见；owned scope 禁写； 无 `on(...)` 依赖助手（拆分
effect）；`undefined` 在 `merge`/setter 中是真实值。

## 3. 路由

### 3.1 文件约定（filesystem-routing，嵌套式）

| 文件                    | 路径                                         |
| ----------------------- | -------------------------------------------- |
| `index.tsx`             | `/`                                          |
| `about.tsx`             | `/about`                                     |
| `blog/[id].tsx`         | `/blog/:id`                                  |
| `blog/[[page]].tsx`     | `/blog/:page?`                               |
| `docs/[...path].tsx`    | `/docs/*path`                                |
| `(marketing)/about.tsx` | `/about`（分组段不入 URL）                   |
| `[...404].tsx`          | 兜底                                         |
| `posts.tsx` + `posts/`  | `posts.tsx` 是目录内所有页面的布局（layout） |

模块约定：**默认导出 = 页面**；`route` 导出 =
路由配置；`GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS` 导出 = API 路由。 有 handler
无默认导出的模块 `page: false`，handler 代码与其 import 不会进客户端包。只导出
`GET` 时自动补 `HEAD`。

### 3.2 route 导出与 preload

```tsx
export const route = {
  preload: ({ params, location, intent }) => {
    void getUser(params.id!); // 起跑数据；返回值不消费
  },
} satisfies RouteDefinition;

export default function User(props: RouteProps<"/users/:id">) {
  const user = createMemo(() => getUser(props.params.id));
  return <h2>{user().name}</h2>;
}
```

- `preload` 在首次渲染、导航、浏览器前进后退、**链接
  hover/focus**（`intent === "preload"`）时触发，是数据预取的唯一入口。
- 参数类型从路径字面量推导：`RouteProps<"/users/:id">` 的 `params.id` 是
  `string`。

### 3.3 类型化路径与链接

```ts
import { paths } from "../router.ts";
paths.posts; // "/posts"
paths.users(2).settings; // "/users/2/settings"
```

链接就是原生 `<a href={path}>`（无 Link 组件）；路由自动加 `aria-current` /
`data-active` / `data-pending`。 重定向用
`throw redirect(paths.posts)`（`redirect` 来自 `@solidjs/web`）。

### 3.4 状态码与响应头

```tsx
// [...404].tsx
export const route = {
  preload: () => httpStatus(404), // SSR 期间设置响应状态；浏览器端 no-op
} satisfies RouteDefinition;
```

同族 API：`httpHeader(name, value)`。壳 flush 前设置的 `Location` 是真 3xx。

### 3.5 搜索参数

可选：在路由配置声明 Standard Schema 校验，`search.page` 就是 `number` 而不是
`"2"`（见 router 文档 "Typed Search Params"）。

## 4. Router 2 数据 API

### 4.1 query（读）

```ts
// src/lib/api.ts
import { query } from "@solidjs/router";
import { client } from "../server/client.ts";

export const getPosts = query(async () => {
  "use server";
  return await client.post.list({ limit: 10 });
}, "posts");
```

语义（来自 router 文档）：

1. 服务端同一请求内去重（单飞）；
2. 浏览器保留 5 秒 preload 缓存，hover 预取与真正进入共享一次 fetch；
3. 按 key 参与 action 后的重验证；`getPosts.key` / `getPosts.keyFor(...)`
   支持定点失效；
4. 作为前进后退缓存最多 5 分钟（用户主动导航绕过）。

不要在 query 里做写操作。读取结果直接配 `createMemo` / `createProjection`，没有
resource 包装层。

### 4.2 action（写）与表单

```ts
import { action, query } from "@solidjs/router";

const getPosts = query(async () => {
  "use server";
  return await client.post.list({ limit: 10 });
}, "posts");

export const createPost = action(async (form: FormData) => {
  "use server";
  await client.post.create({ title: String(form.get("title") ?? "") });
}, "create-post");
```

```tsx
<form action={createPost} method="post">
  <input name="title" required />
  <button type="submit">Create</button>
</form>;
```

- action 只接受 POST；提交中表单自动 `aria-busy="true"`；无 JS 也可用（真实
  POST + 回填）。
- router 在 action 落定后按 key 重验证受影响的 query；配 `createOptimisticStore`
  做乐观 UI。
- 单飞增强（可选）：让 mutation 响应携带页面刷新数据。新建
  `src/server-config.ts`：

  ```ts
  import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server";
  import { createFlightDataCollector } from "@solidjs/router/server";
  import { Router } from "./router.ts";

  configureServerFunctionsServer({
    collectFlightData: createFlightDataCollector(Router),
  });
  ```

  并在 `vite.config.ts` 配
  `serverFunctions: { configure: "./src/server-config.ts" }`（预派发模块，见插件
  README）。

### 4.3 在服务端组件/中间件里读取

服务端同样可以调用 query；同一请求内去重。中间件装饰的 `event.locals` 对 server
function 可见。

## 5. Server Functions（`"use server"`）

### 5.1 规则

- 放在模块顶层，函数体首行 `"use server"`；服务端是普通函数调用，浏览器编译成对
  `/_server` 的 fetch。
- 参数与返回值必须可序列化（默认 JSON；`@solidjs/web` 的 codec/rich arguments
  是实验能力，不要默认依赖）。
- 函数体及其静态 import 只进服务端包——这就是它可以 import `src/server/*`
  的原因。
- 端点默认同源 CSRF 防护；跨可信源需在 server-only 模块里
  `configureServerFunctionsServer({ csrf: { origin: [...] } })`。
- 读取用 `query()` 包一层，写入用 `action()`
  包一层（§4），不要裸调用后再手搓缓存。

### 5.2 何时不用 server function

外部客户端要调用的 API（CLI、第三方、未来联机）→ 走 oRPC HTTP 端点；非 RPC
的普通 HTTP（webhook、文件、sitemap） → `src/routes/api/**` 的 `GET`/`POST`
导出。三者可以共存，契约只有一份。

## 6. 契约层：oRPC + Zod 4

### 6.1 契约先行工作流

新增一个 procedure 的顺序固定为四步：

```ts
// 1) src/protocol/contract.ts
export const contract = {
  post: {
    create: oc
      .input(
        z.object({ title: z.string().min(1, { error: "Title is required" }) }),
      )
      .output(postSchema),
  },
};

// 2) src/server/orpc.ts —— 实现（缺了或放错位置直接编译失败）
export const router = os.router({
  post: { create: os.post.create.handler(({ input }) => createPost(input)) },
});

// 3) src/lib/api.ts —— 应用数据层（读 query / 写 action）
export const createPost = action(async (title: string) => {
  "use server";
  return await client.post.create({ title });
}, "create-post");

// 4) UI 调用 createPost(...)
```

要点：

- `.output` 不是可选项：契约没有 handler
  帮你推导返回类型，且服务端会按它校验响应。
- `os.router` 校验完整性：漏实现、放错 key 都是编译错误。
- `createRouterClient(router)` 是服务端默认接法（进程内直调，无
  HTTP）；换远端服务时改 `src/server/client.ts` 为
  `createORPCClient(new RPCLink({ url }))`（`@orpc/client/fetch`），契约与调用方不变。
- `RPCHandler` 只服务 HTTP 面；API 路由里 `prefix` 必须与
  `src/protocol/transport.ts` 的 `rpcPath` 一致。
- 同一契约还能通过 metadata 生成
  OpenAPI（`@orpc/openapi`），本模板未启用，需要时再加。

### 6.2 Zod 4 惯用法

```ts
const postSchema = z.object({
  id: z.string(),
  title: z.string().min(1, { error: "Title is required" }),
  tags: z.array(z.string()).default([]),
});

export type Post = z.output<typeof postSchema>; // 输出类型（默认值已应用）
type PostInput = z.input<typeof postSchema>; // 输入类型（default 处可选）
```

- 自定义错误统一用 `error` 参数（Zod 4 取代了 v3 的 `message` / `errorMap`）：
  `z.string().min(5, { error: "太长不看" })`，或传函数按 issue
  动态生成；`undefined` 表示回退默认。
- 只想知道"过没过"用 `.validate()`（比 `safeParse().success`
  快）；需要结构化错误用 `.safeParse()`。
- 非 schema 类型（类实例、引擎对象）用 `z.custom<T>()`
  占位，运行时交给类型系统与业务校验。
- 中文错误可全局加载
  locale：`z.config(z.locales.zhCN())`（在可共享的模块里做一次）。
- schema 是唯一真相：领域类型从 `z.output` 推导，不手写重复的 interface。

### 6.3 错误

```ts
import { ORPCError } from "@orpc/server";

// 简单场景
throw new ORPCError("NOT_FOUND", { message: "Post not found" });

// 需要类型安全时在 procedure 上声明
const find = os
  .errors({
    NOT_FOUND: {
      message: "Post not found",
      data: z.object({ id: z.string() }),
    },
  })
  .handler(({ input, errors }) => {
    if (!exists) throw errors.NOT_FOUND({ data: { id: input.id } });
  });
```

`message` 与 `data`
会发给客户端，不放敏感信息；错误信息面向用户而非堆栈。复用错误用
`error("CODE", { ... })` 工厂。

## 7. Tailwind CSS 4

CSS-first：没有 `tailwind.config.js`，设计令牌写在 CSS 里。

```css
/* src/App.css */
@import "tailwindcss";

@theme {
  --color-brand-500: oklch(0.72 0.11 221.19);
  --font-display: "Satoshi", sans-serif;
}

@custom-variant dark (&:where(.dark, .dark *));
```

- `@theme` 里的变量按命名空间自动生成工具类：`--color-brand-500` →
  `bg-brand-500` / `text-brand-500`； `--font-display` → `font-display`。普通
  CSS 变量用 `:root`，不要混。
- 内容探测自动包含项目文件；第三方目录/被忽略路径用 `@source "../path"`
  显式加入。
- 复用样式优先组合工具类；需要自定义工具用 `@utility`，`@apply` 只在组件 CSS
  里少量使用。
- **不要动态拼类名**（扫描器按源码字面量识别）：`bg-${color}-500`
  不会生成；用完整类名映射：

```tsx
const tone = { error: "bg-red-500", ok: "bg-emerald-500" };
<div class={tone[kind]} />;
```

- 与 Solid 配合：条件类用 `class` 的数组/对象形式（§2.7），不要手写
  `filter(Boolean).join(" ")`。

## 8. Deno

- 依赖只写在 `deno.json` 的 `imports`（`npm:`
  specifier）里，`deno add npm:pkg@1.2.3` 会自动更新 `deno.lock`；
  提交锁文件。beta/RC 依赖精确锁版本（oRPC、Solid
  系），升级时客户端与服务端同步升。
- 任务：`deno task dev/build/start/serve/check/lint`；工具脚本放 `tools/`，以
  `deno run --allow-...` 暴露为任务。
- 类型检查覆盖 `src`（`deno task check`）；`server.js` 是纯 JS
  宿主，不在检查范围。
- 环境变量：
  - 服务端：`Deno.env.get(...)` / `process.env`，启动任务可加
    `--env-file=.env`。
  - 客户端：Vite 的 `import.meta.env.VITE_*`（构建期烘入，切勿放密钥）。
  - 启用 `skills/typed-env` 后改用类型化 virtual 模块 `virtual:env/client` /
    `virtual:env/server`（服务端启动校验、客户端按 `VITE_`
    前缀烘入、类型自动生成到 `solid-env.d.ts`）。
- 格式化/检查命令由 `skills/project-hygiene` 引入；写新文件时直接按 `deno fmt`
  风格（双引号、分号、尾逗号）。

## 9. 测试

示例测试与运行器通过 `skills/testing` 引入（Vitest 双 project：client 用 jsdom +
`@solidjs/testing-library`， server 用 node 跑真实服务端构建）。约定：

- 纯函数/契约/处理器 → server project（`createRouterClient` 直调，不碰 HTTP）。
- 组件行为 → client project，用 `render` + `screen`，断言用户可见行为。
- 反应式回归 → 引入 `@solidjs/diagnostics` 后用 `captureArtifact` + 预算断言；
  该包自带与版本匹配的 agent 技能（安装后在
  `node_modules/@solidjs/diagnostics/skills/`）。

## 10. 评审清单

- [ ] API 变更是否从 `src/protocol/contract.ts` 开始，四步（契约 → 实现 → 数据层
      → UI）齐全？
- [ ] UI 是否只 import `src/lib/api.ts`，没有碰 `src/server/*`？
- [ ] 读取是否走 `query()` 且有对应 `preload`？写入是否走 `action()`？
- [ ] 是否有 props 解构、owned scope 写信号、effect 搬值等 2.0 反模式？
- [ ] 是否存在动态拼 Tailwind 类名？
- [ ] `deno task check` / `lint` / `build` 是否通过？

## 附：文档来源

- Solid 2.0：`node_modules/solid-js/CHEATSHEET.md`（API 与 1.x
  差异）、`node_modules/@solidjs/web/README.md`、
  [docs.solidjs.com](https://docs.solidjs.com)（概念）、reactivity-diagnostics
  SKILL。
- 路由/数据
  API：`node_modules/@solidjs/router/README.md`、`node_modules/filesystem-routing/README.md`。
- Server functions / env / 构建：`node_modules/@solidjs/vite-plugin/README.md`。
- oRPC：[getting-started](https://orpc.unnoq.com/docs/getting-started)、[contract-first](https://orpc.unnoq.com/docs/contract-first)、
  [error-handling](https://orpc.unnoq.com/docs/error-handling)。
- Zod
  4：[basics](https://zod.dev/basics)、[error-customization](https://zod.dev/error-customization)。
- Tailwind
  4：[theme](https://tailwindcss.com/docs/theme)、[dark mode](https://tailwindcss.com/docs/dark-mode)。
