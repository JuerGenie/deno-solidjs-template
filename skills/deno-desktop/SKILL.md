---
name: deno-desktop
description: Use when packaging this Deno + Solid app as a desktop application with `deno desktop` — adding the Deno.serve desktop entry, configuring desktop.app/output/backend in deno.json, building .app/.dmg/.msi/.AppImage artifacts, or cross-compiling for other platforms. Triggers include deno desktop, desktop app, DMG, AppImage, MSI, webview, CEF, BrowserWindow.
---

# Deno Desktop：把 SSR 应用打包成桌面应用

用 `deno desktop`（Deno 2.9+）把本模板编译成自包含桌面应用：二进制内嵌
Deno、你的代码、 构建产物与渲染后端，运行后起一个本地 HTTP 服务，系统 webview
指向它。

## 何时使用

- 需要分发桌面形态（macOS `.app`/`.dmg`、Windows `.msi`、Linux
  `.AppImage`/`.deb`）。
- 需要窗口/菜单/托盘/通知/自动更新等原生能力。

## 原理（决定写法，先读）

- `deno desktop` 运行时分配一个本地端口，写入
  `DENO_SERVE_ADDRESS`（`tcp:127.0.0.1:<port>`）； **`Deno.serve()`
  会读取它并绑定，忽略你传入的端口**；webview 导航到该地址。
- 因此桌面入口**必须使用 `Deno.serve`**。本模板的 `server.js` 是 `node:http`
  宿主 （面向通用/Node 部署），不会被桌面运行时接管——所以需要单独的 `desktop.ts`
  入口； SSR、server functions、`/api/rpc` 全部复用构建产物的
  `handleRequest`，行为与生产一致。
- 绑定地址恒为
  `127.0.0.1`，不暴露公网；与本机浏览器行为一致，可先在浏览器里开发。
- 编译后进程的 cwd 是用户的 cwd：**不要**用 `Deno.cwd()` 定位资源，用
  `import.meta.url`。
- 非框架入口需 `--include dist`
  把构建产物嵌进二进制（框架自动探测项目才自动内嵌）。

## 前置检查（sentinel）

根目录已有 `desktop.ts` 且 `deno.json` 的 tasks 里有 `desktop` → 已安装，跳过
Apply。 另确认：`deno --version` ≥ 2.9；`deno task build` 能产出 `dist/`（首次
`deno desktop` 会下载渲染后端，webview 较小、CEF 约数百 MB，需要网络）。

## Apply

### 1. desktop.ts（仓库根，新入口）

```ts
// Desktop entry for `deno desktop desktop.ts --include dist`.
// `deno desktop` allocates a local port, sets DENO_SERVE_ADDRESS, and points
// the embedded webview at it; Deno.serve() binds to that address (port args
// are ignored in desktop mode). Everything else — SSR pages, server
// functions, /api/rpc — goes through the same built handleRequest as
// production. server.js (node:http) is the generic host and is not used here.
import { handleRequest } from "./dist/server/server.js";

const clientDir = new URL("./dist/client/", import.meta.url);

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function serveStatic(pathname: string): Promise<Response | undefined> {
  if (pathname.includes("..")) return undefined;
  try {
    const body = await Deno.readFile(new URL(`.${pathname}`, clientDir));
    const ext = pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
    return new Response(body, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return undefined; // Not a built asset: fall through to the app handler.
  }
}

const port = Number(Deno.env.get("PORT") ?? 3000);

Deno.serve({ port, hostname: "127.0.0.1" }, async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const asset = await serveStatic(url.pathname);
    if (asset) return asset;
  }
  return await handleRequest(request);
});
```

说明：`deno desktop` 会按需忽略这里的 `port`/`hostname`；`deno run`
直接跑时用它们（便于本地验证）。

### 2. deno.json：desktop 配置与任务

```jsonc
{
  "desktop": {
    "app": {
      "name": "Deno Solid App",
      // 反向 DNS，macOS 通知授权等需要稳定值；不写会生成合成 id
      "identifier": "com.example.deno-solid-app"
    },
    // 默认 webview（系统 webview，体积小）；要跨平台渲染一致改 "cef"（大很多）
    "backend": "webview",
    "output": {
      "macos": "./dist-desktop/DenoSolid.app",
      "windows": "./dist-desktop/DenoSolid",
      "linux": "./dist-desktop/deno-solid"
    }
  },
  "tasks": {
    "desktop": "deno task build && deno desktop desktop.ts --include dist --allow-net --allow-read --allow-env --exclude-unused-npm"
  }
}
```

- `--exclude-unused-npm`：只嵌入模块图可达的 npm
  包，显著减小体积；若运行时报模块缺失就去掉它。
- 首次构建产物命名以实际输出为准：官方语法是带扩展名（`MyApp.app`）；若在部分
  Deno 2.9.x 上出现 `X.app.app`，把 `output.*` 改成不带扩展名的基名（如
  `./dist-desktop/DenoSolid`）。
- 产物按平台扩展名决定格式：macOS `.app` / `.dmg`；Windows 目录（含 `.bat`
  启动器）/ `.msi`； Linux 目录 / `.AppImage` / `.deb` / `.rpm`。

### 3. .gitignore

```gitignore
# Desktop build output
dist-desktop
```

## Verify

先验证入口逻辑（不打包，走普通 HTTP）：

```sh
deno task build
PORT=3106 deno run --allow-net --allow-read --allow-env desktop.ts &
curl -s localhost:3106/ | head -c 200
curl -s localhost:3106/posts | grep -o "<h1[^>]*>Posts"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3106/nope        # 404
curl -s -X POST localhost:3106/api/rpc/greet \
  -H 'content-type: application/json' -d '{"json":{"name":"world"}}'
kill %1
```

再打包并人工验收：

```sh
deno task desktop
open dist-desktop/DenoSolid.app   # macOS；Windows/Linux 运行对应产物
```

窗口打开后：首页 greet 表单应走 server function、`/posts` 应渲染数据、导航正常。
失败时排查顺序：入口是否 `Deno.serve` → `--include dist` 是否传了 → `dist/`
是否最新构建。

## 平台与分发（按需）

| 需求       | 做法                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| 跨平台构建 | `--target <triple>` 或 `--all-targets`（无需本地工具链）                           |
| 图标       | `desktop.app.icons.{macos,windows,linux}`（`.icns`/`.ico`/`.png`，相对 deno.json） |
| macOS 签名 | `desktop.macos.codesignIdentity`（`"-"` 为 ad-hoc；缺省也会 ad-hoc 签名）          |
| 深链       | `desktop.app.deepLinks: ["myapp"]`（注册到系统；处理回调能力后续版本提供）         |
| 自动更新   | `desktop.release.baseUrl` + `Deno.autoUpdate()`（bsdiff 补丁 + 回滚）              |
| 错误上报   | `desktop.errorReporting.url`（未设则只弹原生提示）                                 |
| 原生能力   | `Deno.BrowserWindow`、菜单、托盘、对话框、通知、`bindings.<name>()` 进程内调用     |
| 调试       | `--inspect*` 双端调试；统一 DevTools 目前仅 CEF 后端可用                           |

体积策略：优先 webview 后端 + `--exclude-unused-npm`；必要时 `--compress`（xz
默认，zstd 更小但需系统有 zstd）。 服务端产物会外部化 npm
依赖，若体积异常先检查是否有不必要的服务端依赖。

## 组合注意

- 依赖 `deno task build`（技能内任务已串联）；与其它技能无硬依赖。
- 开发循环用 `deno task dev`（浏览器 + Vite HMR）；`deno desktop`
  用于验收与分发。 显式入口下 `--hmr` 主要重载 Deno 侧代码，不会把 Vite 的 HMR
  带进内嵌 webview。
- 环境变量：桌面进程继承系统环境，不会自动读 `.env`；`typed-env`
  的服务端变量需由运行环境注入 （编译期权限已把 `--allow-env` 烘进二进制）。
- CI：桌面打包依赖平台目标与后端下载，建议本地或按平台矩阵单独跑，不必并入
  `skills/ci` 的门禁。

## 记录能力

在 `AGENTS.md` 的 `## Enabled capabilities` 追加：`- deno-desktop (<日期>)`。
