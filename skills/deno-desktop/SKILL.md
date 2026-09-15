---
name: deno-desktop
description: Use when developing this Deno + Solid app as a desktop application with `deno desktop` — unifying browser dev / desktop dev / production behind one `start.ts` host, running the desktop shell against the Vite dev server, window menu/close/quit/geometry behaviour, permissions and app-data placement. Packaging lives in `packaging.md`, printing in `printing.md` inside this skill folder. Triggers include deno desktop, deno.desktop lib, desktop app, start.ts, BrowserWindow, desktop dev, DENO_SERVE_ADDRESS, CEF backend.
---

# Deno Desktop：桌面开发模式（技能集入口）

用 `deno desktop`（Deno 2.9+）把本模板变成自包含桌面应用。核心主张是**收敛宿主**：
浏览器 dev / 桌面 dev / 生产（浏览器与桌面）四种形态都走同一个 `start.ts`，不再维护
「`server.js` 生产宿主 + `desktop.ts` 桌面入口」两套代码。

这是一个**技能集**：本文件是入口（含 frontmatter、核心 Apply 与 Verify），
子文件放在同一目录、按需加载——只读当前任务需要的那一个。

| 文件                             | 何时读                                             |
| -------------------------------- | -------------------------------------------------- |
| [`packaging.md`](./packaging.md) | 要 `prod:desktop*` 打包、跨平台构建、图标/签名/更新 |
| [`printing.md`](./printing.md)   | 要用 Chromium（CEF）打印 PDF / 标签                |

## 何时使用

- 需要桌面分发形态（macOS `.app`/`.dmg`、Windows `.msi`、Linux `.AppImage`/`.deb`）。
- 需要窗口/菜单/通知等原生能力。
- 需要"内嵌 webview 跑 Vite dev server"的开发循环（客户端 HMR，而不是只重载 Deno 侧）。

## 模式矩阵（先读）

| 模式       | 命令                       | 宿主                    | 页面资源                                        |
| ---------- | -------------------------- | ----------------------- | ----------------------------------------------- |
| 浏览器 dev | `deno task dev`            | `start.ts --dev`        | Vite dev server（`import("vite")` 程序内启动）   |
| 桌面 dev   | `deno task dev:desktop`    | `start.ts`（env 标记）  | Vite dev server 直接绑到桌面运行时分配的端口     |
| 浏览器生产 | `deno task start`          | `start.ts`              | `dist/client` 静态 + `dist/server` handleRequest |
| 桌面生产   | `deno task prod:desktop*`  | `start.ts`              | 同上，产物内嵌进二进制（见 packaging 子技能）    |

## 原理（决定写法，先读）

- `deno desktop` 运行时分配一个本地端口写入 `DENO_SERVE_ADDRESS`
  （`tcp:127.0.0.1:<port>`）；**`Deno.serve()` 会读取它并绑定，忽略你传入的端口**，
  webview 导航到该地址。所以桌面入口**必须用 `Deno.serve`**——`server.js` 的
  `node:http` 宿主不会被接管。
- 绑定地址恒为 `127.0.0.1`；编译后进程的 cwd 是用户的 cwd，**不要用
  `Deno.cwd()` 定位资源**，用 `import.meta.url`。
- 非框架入口要 `--include dist` 把构建产物嵌进二进制（动态 import 的
  `dist/server/server.js` 也因此可达）。
- **就绪探针**：运行时启动后会不断轮询地址（不带 `Accept` 头的 `GET /`），成功才导航；
  Vite 的 HTML 回退只认 `Accept: text/html`，对探针返回 404 —— 不处理就会白等
  15 秒（日志 `Server not ready after 15s, navigating anyway`）。dev 中间件先应答它。
- **laufey 没有宿主侧屏幕 API**：窗口居中要 `executeJs` 读 webview 的
  `screen.avail*`（打印另见 printing 子技能）。
- Deno desktop 的运行时 API 由 **`deno.desktop` lib** 提供：在 `deno.json` 的
  `compilerOptions.lib` 里加上 `"deno.desktop"`，`Deno.BrowserWindow`、
  `Deno.MenuItem`、`Deno.BrowserWindowOptions` 等类型直接可用，不要在 start.ts
  里手写声明。
- GUI 模式下关闭窗口不会结束进程（`Deno.serve` 让事件循环活着），必须自己
  `Deno.exit(0)`；没有应用菜单就没有 Cmd+Q / Cmd+W / 剪贴板快捷键。

## 前置检查（sentinel）

根目录已有 `start.ts` 且 `deno.json` 的 tasks 里有 `dev:desktop` → 已安装，跳过
Apply，只跑 Verify。另确认 `deno --version` ≥ 2.9、`deno task build` 能产出
`dist/`（首次 `deno desktop` 会下载对应平台渲染后端，需网络）。

## Apply

### 1. start.ts（仓库根，统一宿主）

```ts
// Unified host — every mode serves through this file:
//
//   browser dev   deno run -A start.ts --dev
//                 starts Vite programmatically (HMR + SSR).
//   desktop dev   DESKTOP_DEV=1 deno desktop start.ts ...
//                 Vite takes the port the desktop runtime allocated
//                 (DENO_SERVE_ADDRESS) so the embedded webview gets HMR.
//   production    deno run ... start.ts  /  deno desktop start.ts ...
//                 serves dist/client statics plus the built dist/server
//                 handleRequest.
import { serveDir } from "@std/http/file-server";
import { fileURLToPath } from "node:url";

const APP_NAME = "Deno Solid App"; // 改成你的应用名
const IS_DEV = Deno.args.includes("--dev") ||
  Deno.env.get("DESKTOP_DEV") === "1";

const BUILT_SERVER = "./dist/server/server.js";
const CLIENT_DIR = fileURLToPath(new URL("./dist/client/", import.meta.url));
const WINDOW_SIZE = { width: 1280, height: 800 };
const WINDOW_MIN_SIZE = { width: 960, height: 640 };

interface RequestHandler {
  (
    request: Request,
    options?: { event?: { nativeEvent?: unknown } },
  ): Promise<Response>;
}

// Desktop runtime types (`Deno.BrowserWindow`, `Deno.MenuItem`, …) come from
// the `deno.desktop` lib enabled in deno.json's `compilerOptions.lib`.

// Roles give the platform-native label, accelerator and behavior; the first
// submenu becomes the macOS application menu. Without this the window has no
// Cmd+Q / Cmd+W handling (and the Edit roles provide clipboard shortcuts).
const APPLICATION_MENU: Deno.MenuItem[] = [
  {
    submenu: { label: APP_NAME, items: [{ role: { role: "quit" } }] },
  },
  {
    submenu: {
      label: "Edit",
      items: [
        { role: { role: "undo" } },
        { role: { role: "redo" } },
        "separator",
        { role: { role: "cut" } },
        { role: { role: "copy" } },
        { role: { role: "paste" } },
        { role: { role: "selectAll" } },
      ],
    },
  },
  {
    submenu: {
      label: "Window",
      items: [
        { role: { role: "minimize" } },
        { role: { role: "close" } },
      ],
    },
  },
];

// There is no minimum-size option, so a size below the floor is snapped back
// on every resize (the follow-up setSize settles immediately).
function clampToMinSize(window: Deno.BrowserWindow): void {
  const [width, height] = window.getSize();
  const clampedWidth = Math.max(width, WINDOW_MIN_SIZE.width);
  const clampedHeight = Math.max(height, WINDOW_MIN_SIZE.height);
  if (clampedWidth !== width || clampedHeight !== height) {
    window.setSize(clampedWidth, clampedHeight);
  }
}

// Centering needs the renderer's screen work area (no host-side screen API),
// and the webview is not ready right away — retry until executeJs answers.
async function centerWindow(
  window: Deno.BrowserWindow,
  attempt = 0,
): Promise<void> {
  try {
    // `executeJs` resolves the script's value directly (not an envelope), so
    // narrow the untyped `BrowserWindowValue` to the object we asked for.
    const bounds = await window.executeJs(
      "({ x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight })",
    ) as { x: number; y: number; width: number; height: number } | null;
    if (!bounds) throw new Error("no screen bounds");
    const [width, height] = window.getSize();
    window.setPosition(
      Math.round(bounds.x + (bounds.width - width) / 2),
      Math.round(bounds.y + (bounds.height - height) / 2),
    );
  } catch {
    if (attempt < 40) {
      setTimeout(() => void centerWindow(window, attempt + 1), 250);
    }
  }
}

// The first BrowserWindow constructed adopts the startup window. Closing it
// does not stop the runtime while Deno.serve is alive, so exit explicitly —
// that is what makes the traffic light, Cmd+W and Cmd+Q actually quit.
function setupDesktopWindow(): void {
  // Browser dev runs this same file without the desktop runtime.
  if (typeof Deno.BrowserWindow !== "function") return;
  const window = new Deno.BrowserWindow({ title: APP_NAME, ...WINDOW_SIZE });
  window.setApplicationMenu(APPLICATION_MENU);
  window.addEventListener("resize", () => clampToMinSize(window));
  window.addEventListener("close", () => {
    Deno.exit(0);
  });
  void centerWindow(window);
}

// The desktop runtime writes `tcp:127.0.0.1:<port>` for the webview to load.
function desktopPort(): number | undefined {
  const address = Deno.env.get("DENO_SERVE_ADDRESS");
  const port = address?.match(/:(\d+)$/)?.[1];
  return port ? Number(port) : undefined;
}

async function startDevServer(): Promise<void> {
  const { createServer } = await import("vite");
  const allocated = desktopPort();
  // In desktop mode the webview is already pointed at the allocated address,
  // so silently hopping to another port would strand it.
  const server = await createServer({
    plugins: [
      {
        name: "dev-readiness",
        // The desktop runtime polls `GET /` with no Accept header until the
        // address answers; Vite's HTML fallback ignores those (404), which
        // parks the webview for its full 15s probe budget. Answer the probe
        // before internal middlewares.
        configureServer(devServer) {
          devServer.middlewares.use((request, response, next) => {
            if (
              request.method === "GET" && request.url === "/" &&
              !request.headers.accept
            ) {
              response.statusCode = 200;
              response.setHeader("content-type", "text/plain; charset=utf-8");
              response.end(
                "dev server is running. Request with `Accept: text/html` for the app.\n",
              );
              return;
            }
            next();
          });
        },
      },
    ],
    server: {
      port: allocated ?? Number(Deno.env.get("PORT") ?? 3000),
      strictPort: allocated !== undefined,
      host: "127.0.0.1",
    },
  });
  // Document requests only — the quickest way to confirm the embedded webview
  // actually reached the dev server.
  server.httpServer?.on("request", (request) => {
    if (request.headers.accept?.includes("text/html")) {
      console.log(`[dev] ${request.method ?? "GET"} ${request.url ?? "/"}`);
    }
  });
  await server.listen();
  server.printUrls();
}

async function startProductionServer(): Promise<void> {
  const { handleRequest } = (await import(BUILT_SERVER)) as {
    handleRequest: RequestHandler;
  };
  const port = desktopPort() ?? Number(Deno.env.get("PORT") ?? 3000);
  const hostname = Deno.env.get("HOST") ?? "127.0.0.1";

  Deno.serve({ port, hostname }, async (request, info) => {
    if (request.method === "GET" || request.method === "HEAD") {
      // Built assets live in dist/client; anything not found there (app
      // routes, /_server, /api/rpc) falls through to the SSR handler.
      const asset = await serveDir(request, {
        fsRoot: CLIENT_DIR,
        quiet: true,
      });
      if (asset.status !== 404) return asset;
    }
    return await handleRequest(request, { event: { nativeEvent: info } });
  });
}

if (desktopPort() !== undefined) {
  setupDesktopWindow();
}

if (IS_DEV) {
  await startDevServer();
} else {
  await startProductionServer();
}
```

要点：

- `import(BUILT_SERVER)` 用**变量说明符**：dev 模式没有 `dist/` 也不会挂，
  生产/桌面靠 `--include dist` 内嵌可达。
- 静态资源交给 `@std/http/file-server` 的 `serveDir`，**只处理 404 之外的响应**，
  其余落到 `handleRequest`（不要把 `dist/client` 的 404 当成应用 404）。
- 四种形态同用一个入口：server functions、`/api/rpc`、SSR 都复用构建产物的
  `handleRequest`，行为与生产一致。

### 2. deno.json（配置、任务、权限）

```jsonc
{
  "compilerOptions": {
    // 在既有 lib 列表里追加；桌面运行时类型（BrowserWindow/MenuItem 等）由它提供
    "lib": ["deno.window", "dom", "dom.iterable", "deno.desktop"]
  },
  "desktop": {
    "app": {
      "name": "Deno Solid App",
      // 反向 DNS，系统通知/签名需要稳定值；不写会生成合成 id
      "identifier": "com.example.deno-solid-app"
    },
    // 渲染后端：webview 体积小（系统内核）；cef 跨平台一致 + 可打印，
    // 体积大数百 MB，详见 packaging.md / printing.md（同一技能目录）
    "backend": "webview"
  },
  "imports": {
    // 静态资源托管用官方实现，不要手写 MIME 表
    "@std/http": "jsr:@std/http@^1"
  },
  "tasks": {
    "dev": "deno run -A start.ts --dev",
    "start": "deno run --allow-net --allow-read --allow-write --allow-env --allow-sys start.ts",
    "dev:desktop": "DESKTOP_DEV=1 deno desktop -A --hmr --exclude-unused-npm start.ts"
  }
}
```

- **`--allow-sys`**：`node:process` 的部分 API（如 `process.umask`）需要它；服务端
  依赖里只要有 exceljs 这类 Node 生态包，导入期就可能触发。`--allow-write` 给用户
  数据目录。dev 任务直接用 `-A` 省心。
- `compilerOptions.lib` 加 `"deno.desktop"`：`Deno.BrowserWindow`、
  `Deno.MenuItem`、`Deno.BrowserWindowOptions` 等桌面运行时类型直接可用；
  配合覆盖 `start.ts` 的 `check` 任务获得完整类型检查，不要手写这些类型。
- `check` / `lint` 记得带上 `start.ts`（模板默认只覆盖 `src`）：
  `"check": "deno check src start.ts"`、`"lint": "deno lint src start.ts"`。
- `prod:desktop*` 任务由 packaging 子技能追加。

### 3. .gitignore

```gitignore
# Desktop build output
dist-desktop
```

### 4. 替换旧宿主与文档引用

`start.ts` 上线后 `server.js`（`node:http` 生产宿主）与 `desktop.ts` 都不再需要：

- 删除 `server.js` / `desktop.ts`，把 `deno.json` 的 `exports` 指向 `start.ts`；
- 同步更新文档里"宿主是谁"的表述（`AGENTS.md`、`README.md`、
  `docs/architecture.md`、`docs/development.md` 以及其它技能里出现 `server.js`
  的地方，全部改指 `start.ts`）；
- 需要 Node 部署时再单独写一个 `node:http` 适配层——`handleRequest` 本身是
  平台无关的。

## 窗口与原生能力（要点）

- **认领启动窗口**：第一次 `new Deno.BrowserWindow()` 认领运行时创建的窗口，
  之后再构造才是新窗口。
- **菜单 → 快捷键**：`setApplicationMenu` 用 `role` 项拿系统原生标签与快捷键
  （`quit`/`close`/`minimize`/`undo`/`redo`/`cut`/`copy`/`paste`/`selectAll`）；
  macOS 第一个 submenu 是应用菜单。
- **尺寸/居中/最小尺寸**：`BrowserWindowOptions` 没有 `center`/`minWidth`；居中读
  `screen.avail*` 再 `setPosition`（`executeJs` 直接 resolve 脚本求值结果，用 `as`
  收窄，**不是** `{ ok, value }` 信封），最小尺寸靠 `resize` 事件里 clamp。
- **退出**：`close` 事件里 `Deno.exit(0)`，否则窗口关了进程还在。
- **数据目录**：打包后的 `.app` 内部是只读的，用户数据（上传的 PDF/表格等）放应用
  数据目录（macOS `~/Library/Application Support/<App>/`），并提供
  `APP_DATA_DIR` 之类的环境变量覆盖，便于测试与迁移；写文件靠 `--allow-write`。
- 打印能力见 [`printing.md`](./printing.md)。

## Verify

先验证宿主本身（不打包，走普通 HTTP）：

```sh
deno task build
PORT=3106 deno run --allow-net --allow-read --allow-write --allow-env --allow-sys start.ts &
curl -s localhost:3106/ | head -c 200
curl -s localhost:3106/posts | grep -o "<h1[^>]*>Posts"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3106/nope        # 404
curl -s -X POST localhost:3106/api/rpc/greet \
  -H 'content-type: application/json' -d '{"json":{"name":"world"}}'
curl -s -H 'Accept:' localhost:3106/ | head -c 40                   # 探针应答
kill %1
```

再验证 dev 模式（**必须带 `Accept: text/html`**，否则拿到的是 Vite 的 404）：

```sh
deno task dev &
sleep 8
curl -s -H 'Accept: text/html' localhost:3000/ | grep -c "<h1"
kill %1
```

桌面形态验收（打包 + 启动 + 分配端口 curl）见 packaging 子技能的 Verify。

## 常见坑（开发相关）

- 探针没应答 → 每次启动白等 15 秒；`dev:desktop` 日志里能看到
  `Server not ready after 15s`。
- `--hmr` 在显式入口下主要重载 Deno 侧代码，**不会**把 Vite 的客户端 HMR 带进
  webview——要客户端 HMR 就用 `dev:desktop`。
- 桌面进程继承系统环境，**不会自动读 `.env`**（与 `typed-env` 组合时见其技能）。
- dev SSR 依赖模板 `vite.config.ts` 里的 `fileRoutes({ codeSplitting: false })`
  （见 `docs/development.md` §3.1）：默认 lazy 路由在 dev 下会命中 Solid 的
  asset-manifest 守卫（`lazy() called … but no asset manifest is set`），整页
  SSR 挂掉——桌面 dev 用的正是 dev server，这条是前置条件。

## 组合注意

- 依赖 `deno task build`（任务里已串联）；与其它技能无硬依赖。
- 与 `skills/typed-env` 组合：桌面任务按需把 `--env-file=.env` 交给 `deno run`；
  编译进二进制的变量仍需运行环境提供。
- 与 `skills/testing` 组合：`start.ts` 里的纯函数（端口解析、尺寸 clamp、菜单
  构造）适合用 server project 直接单测。
- 打包分发见 [`packaging.md`](./packaging.md)；打印见 [`printing.md`](./printing.md)。

## 回滚

- 删除 `start.ts`，还原 `deno.json`（tasks / desktop 配置 / imports）、
  `.gitignore` 与文档引用；如需恢复 Node 宿主，按 git 历史找回 `server.js`。

## 记录能力

在 `AGENTS.md` 的 `## Enabled capabilities` 追加：`- deno-desktop (<日期>)`。
