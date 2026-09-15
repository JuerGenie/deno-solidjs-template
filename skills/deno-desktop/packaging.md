# Deno Desktop：打包与分发（子技能）

> `skills/deno-desktop/` 技能集的子文件，由 [`SKILL.md`](./SKILL.md) 按需加载。
> 在统一宿主已就位后，把应用编译成各平台自包含产物。

在 [`SKILL.md`](./SKILL.md)（统一宿主）之上，把应用编译成各平台
自包含产物。本子技能只管打包任务、后端选择、体积与分发；窗口/宿主行为见主技能。

## 何时使用

- 要产出 `.app` / `.dmg` / `.msi` / `.AppImage` / `.deb` / 目录形态。
- 要在 macOS 上交叉编译 Windows/Linux 产物。
- 要配图标、签名、深链、自动更新、错误上报。

## 前置检查（sentinel）

`deno.json` 的 tasks 里有 `prod:desktop` → 已安装，只跑 Verify。
未安装先做 [`SKILL.md`](./SKILL.md) 的 Apply（需要 `start.ts`）。
另确认 `deno task build` 能产出 `dist/`；首次为目标平台打包会下载该平台的渲染
后端（CEF 数百 MB），需要网络与时间。

## 原理（决定写法，先读）

- **`desktop.output.{macos,windows,linux}` 是按宿主取值的**：用 `--target` 交叉
  打包时不会切到目标平台那一项，三个平台会互相覆盖。**每个任务显式 `--output`。**
- `--target <triple>` 无需本地工具链即可交叉编译；`--all-targets` 一次全打。
- 交叉打包会打印 `node_modules may be incompatible with the target system`：嵌入的
  是宿主的 `node_modules`。运行时依赖全是纯 JS 时无碍；有平台相关的原生包时改用
  「在目标平台构建」或把它们排除。
- macOS 上 `output`/`--output` 写**不带扩展名的基名**（`./dist-desktop/DenoSolid`
  → 实际 `DenoSolid.app`）；写成 `DenoSolid.app` 会得到 `DenoSolid.app.app`。
- 产物格式由路径扩展名决定：macOS `.app`/`.dmg`；Windows 目录（含 `.bat` 启动器）
  / `.msi`；Linux 目录 / `.AppImage` / `.deb` / `.rpm`。

## Apply

### 1. deno.json：四条打包任务

```jsonc
{
  "tasks": {
    "prod:desktop": "deno task build && deno desktop --output ./dist-desktop/DenoSolid --include dist --allow-net --allow-read --allow-write --allow-env --allow-sys --exclude-unused-npm start.ts",
    "prod:desktop:macos": "deno task build && deno desktop --target aarch64-apple-darwin --output ./dist-desktop/DenoSolid --include dist --allow-net --allow-read --allow-write --allow-env --allow-sys --exclude-unused-npm start.ts",
    "prod:desktop:windows": "deno task build && deno desktop --target x86_64-pc-windows-msvc --output ./dist-desktop/DenoSolid-windows --include dist --allow-net --allow-read --allow-write --allow-env --allow-sys --exclude-unused-npm start.ts",
    "prod:desktop:linux": "deno task build && deno desktop --target x86_64-unknown-linux-gnu --output ./dist-desktop/DenoSolid-linux --include dist --allow-net --allow-read --allow-write --allow-env --allow-sys --exclude-unused-npm start.ts"
  }
}
```

- `prod:desktop`：当前宿主平台（不加 `--target`）。
- 三个平台任务用不同 `--output`，产物可以共存，互不覆盖。
- `--include dist` 必需（非框架入口）；权限与 `start` 任务一致。

### 2. 渲染后端：webview ↔ cef

```jsonc
{ "desktop": { "backend": "cef" } }
```

- `webview`（默认）：用系统内核，体积最小；够用于常规 UI。
- `cef`：内嵌 Chromium，跨平台渲染一致、DevTools 统一，且是
  [`printing.md`](./printing.md) 的前提；体积大数百 MB。
- 切换后端后必须重跑一次打包验收（下载新后端）。

### 3. 体积策略

- `--exclude-unused-npm`：只嵌入模块图可达的 npm 包，先开着；运行时报模块缺失再去掉。
- 服务端依赖里的**可选原生包**（典型：pdf.js 的 `@napi-rs/canvas-*`、rolldown 的
  多平台 binding）会被整包嵌进产物，轻松多出上百 MB。用
  `--exclude node_modules/@napi-rs` 之类剔除，剔完跑一遍 Verify。
- 需要更小可以 `--compress`（xz 默认；zstd 更小但要求系统有 zstd）。

## Verify

```sh
deno task prod:desktop
./dist-desktop/DenoSolid.app/Contents/MacOS/laufey > /tmp/desktop.log 2>&1 &
PORT=$(grep -o "Listening on http://127.0.0.1:[0-9]*" /tmp/desktop.log | grep -o "[0-9]*$")
curl -s -o /dev/null -w "%{http_code}\n" localhost:$PORT/            # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:$PORT/posts       # 任一页面
pkill -f "dist-desktop/DenoSolid"                                    # 或从窗口退出
```

人工验收清单：窗口标题/尺寸/居中、Cmd+Q 与 Cmd+W 与红绿灯能退出、Edit 菜单复制粘贴
可用、页面导航与数据流正常。失败排查顺序：入口是否 `Deno.serve` → `--include dist`
是否传了 → `dist/` 是否最新构建 → 是否被 `--target` × `--output` 写错目录。

## 平台与分发（按需）

| 需求       | 做法                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| 跨平台构建 | `--target <triple>`（本技能拆成 `prod:desktop:macos/windows/linux`）或 `--all-targets` |
| 图标       | `desktop.app.icons.{macos,windows,linux}`（`.icns`/`.ico`/`.png`，相对 deno.json） |
| macOS 签名 | `desktop.macos.codesignIdentity`（`"-"` 为 ad-hoc；缺省也会 ad-hoc 签名）          |
| 深链       | `desktop.app.deepLinks: ["myapp"]`（注册到系统；回调处理后续版本提供）             |
| 自动更新   | `desktop.release.baseUrl` + `Deno.autoUpdate()`（bsdiff 补丁 + 回滚）              |
| 错误上报   | `desktop.errorReporting.url`（未设则只弹原生提示）                                 |
| 调试       | `--inspect*` 双端调试；统一 DevTools 目前仅 CEF 后端可用                           |

## 组合注意

- 依赖 [`SKILL.md`](./SKILL.md)（同一份 `start.ts` 与权限）；
  打印前先把 `backend` 设为 `cef`（见 printing 子技能）。
- 与 `skills/ci` 组合时**不要把桌面打包并入 CI 门禁**：它依赖各平台后端下载，建议
  本地或按平台矩阵单独跑。
- 产物目录 `dist-desktop/` 记得进 `.gitignore`（主技能已加）。

## 回滚

- 删除 `prod:desktop*` 四条任务与 `desktop` 配置块；`dist-desktop/` 直接删。
- 渲染后端缓存在 Deno 缓存目录（macOS `~/Library/Caches/deno/laufey/…`），可自行清理。

## 记录能力

本子文件属于 `deno-desktop` 技能集：能力登记在主技能那一行即可
（`- deno-desktop (<日期>)`），不必单开一行。
