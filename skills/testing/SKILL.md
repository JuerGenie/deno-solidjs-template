---
name: testing
description: Use when a Deno + Solid project needs test infrastructure or when writing tests — setting up Vitest with client (jsdom + @solidjs/testing-library) and server (node) projects, adding test scripts, or testing contract handlers and components. Triggers include vitest, deno task test, testing-library, component test.
---

# 测试基建：Vitest 双 project

装一套与本栈（Solid 2.0 + Vite 8 + Deno）匹配的测试：**client project** 用 jsdom
渲染组件， **server project** 用 node
跑真实服务端姿态（契约、处理器、纯逻辑），不碰 HTTP。

## 何时使用

- 项目需要 `deno task test`，或要为新功能补测试。
- 准备启用 `skills/ci`（它调用 `deno task test:run`）。

## 前置检查（sentinel）

`vitest-setup.ts` 存在且 `deno.json` 有 `test` 任务 → 已安装，跳过 Apply。

## Apply

### 1. deps（deno.json imports）

```jsonc
"imports": {
  // 已有的保持不变 …
  "@solidjs/testing-library": "npm:@solidjs/testing-library@^1.0.0-beta.3",
  "@testing-library/jest-dom": "npm:@testing-library/jest-dom@^7.0.0",
  "jsdom": "npm:jsdom@^25.0.1",
  "vitest": "npm:vitest@^5.0.0"
}
```

然后 `deno install`（更新 lock）。

### 2. vite.config.ts：改用 vitest/config 并加 test 块

```ts
import { defineConfig } from "vitest/config"; // ← 替代 "vite"
// 其余 import / plugins 不变

export default defineConfig({
  // plugins 不变 …
  test: {
    globals: false,
    setupFiles: ["./vitest-setup.ts"],
    // 两个 project：组件测试跑 DOM，服务端测试跑真实 server 姿态
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
```

若同时启用了 `skills/typed-env`（根目录有 `env.ts`），给 server project 追加
alias，并用 stub 替代插件的 env 模块：

```ts
{
  extends: true,
  test: {
    name: "server",
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: [
      {
        find: "virtual:env/server",
        replacement: fileURLToPath(new URL("./vitest-env-server-stub.ts", import.meta.url)),
      },
    ],
  },
},
```

配套 `vitest-env-server-stub.ts`：

```ts
// 与插件 virtual:env/server 同契约：访问时实时读 process.env，测试可逐条设置。
export const env: Record<string, string | undefined> = new Proxy(
  {},
  { get: (_, key) => (typeof key === "string" ? process.env[key] : undefined) },
);
```

`fileURLToPath` 从 `node:url` import。

### 3. vitest-setup.ts

```ts
// 把 @testing-library/jest-dom 的 matcher（toHaveTextContent 等）注册进 vitest。
import "@testing-library/jest-dom/vitest";
```

### 4. deno.json 任务

```jsonc
"tasks": {
  // 已有的保持不变 …
  "check": "deno check vitest-setup.ts src vite.config.ts",
  "test": "vitest",
  "test:run": "vitest run"
}
```

### 5. 示例测试

**服务端：契约与处理器**（`src/server/orpc.test.ts`，进程内直调，零 HTTP）：

```ts
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { router } from "./orpc.ts";

const client = createRouterClient(router, { context: {} });

describe("contract implementation", () => {
  it("greets", async () => {
    await expect(client.greet({ name: "world" })).resolves.toEqual({
      message: "Hello, world!",
    });
  });

  it("applies the input default", async () => {
    const posts = await client.post.list({}); // limit 默认 10
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ id: "hello-solid" });
  });

  it("rejects invalid input at the boundary", async () => {
    await expect(client.greet({ name: "" })).rejects.toThrow();
  });
});
```

**客户端：组件行为**（`src/App.test.tsx` 或任意 `*.test.tsx`）：

```tsx
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  );
}

describe("reactivity in the DOM", () => {
  it("re-renders only after flush", () => {
    render(() => <Counter />);
    flush(); // 挂载后的首次结算
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("count: 0");

    fireEvent.click(button);
    flush(); // Solid 2：setter 排队，flush 后可见
    expect(button).toHaveTextContent("count: 1");
  });
});
```

## Verify

```sh
deno task test:run     # client 与 server 两个 project 都通过
deno task check        # 类型仍全绿
```

## 记录能力

在 `AGENTS.md` 的 `## Enabled capabilities` 追加：`- testing (<日期>)`。

## 组合注意

- 与 `typed-env` 组合时必须做第 2 步的 alias + stub，否则 server project
  解析不到 `virtual:env/server`。
- 反应式回归（更新过频/粒度退化）可在需要时引入 `@solidjs/diagnostics`：用
  `captureArtifact` 捕获重跑归因，用预算断言（`toStayWithinRerunBudget`
  等）锁住。 该包自带与版本匹配的 agent
  技能（`node_modules/@solidjs/diagnostics/skills/`）。
- `skills/ci` 依赖 `test:run` 任务名，不要改名。
