---
name: project-hygiene
description: Use when a Deno project needs formatting/lint gates, a single verification command, or editor/format consistency — setting up deno fmt with generated-file excludes, fmt/verify tasks, editorconfig, or dependency supply-chain guards. Triggers include deno fmt, deno task verify, format check, CI prerequisites.
---

# 工程卫生：格式化门禁与一键验证

给项目装上一套"可被 Agent 和 CI
依赖"的验证闭环：格式化检查、类型检查、lint、构建四合一。

## 何时使用

- 需要 `deno fmt` 能稳定通过（当前 `server.js` 与生成的 `file-routes.d.ts`
  会失败）。
- 需要一条命令代表"改完了，验一遍"：`deno task verify`。
- 准备启用 `skills/ci`（它依赖本技能提供的 `verify` 任务）。

## 前置检查（sentinel）

deno.json 的 `tasks` 里已有 `verify` → 已安装，跳过 Apply，直接跑 Verify。

## Apply

### 1. deno.json：fmt 配置 + 任务

在 `deno.json` 顶层加入（保留现有字段）：

```jsonc
{
  // 生成的类型文件不参与格式化；需要时把这里当白名单维护
  "fmt": {
    "exclude": ["file-routes.d.ts", "solid-env.d.ts"]
  },
  "tasks": {
    // 已有的保持不变 …
    "fmt": "deno fmt",
    "fmt:check": "deno fmt --check",
    "check": "deno check src vite.config.ts",
    "verify": "deno task check && deno task lint && deno task fmt:check && deno task build"
  }
}
```

说明：`deno fmt` 会把 `server.js` 的引号统一为双引号（Deno
默认风格），这是一次性归一化，不要为此加 `singleQuote` 配置。 `solid-env.d.ts`
只在启用 `typed-env` 后存在，预先排除无害。

### 2. 归一化现有文件

```sh
deno fmt
```

### 3. .editorconfig

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

`deno fmt` 会读取它；保持与 Deno 默认一致，避免两套格式互相打架。

### 4. .vscode/settings.json

```json
{
  "deno.enable": true,
  "deno.lint": true,
  "editor.formatOnSave": true,
  "[typescript]": { "editor.defaultFormatter": "deno.deno" },
  "[typescriptreact]": { "editor.defaultFormatter": "deno.deno" },
  "[json]": { "editor.defaultFormatter": "deno.deno" },
  "[jsonc]": { "editor.defaultFormatter": "deno.deno" }
}
```

### 5.（可选）依赖发布年龄防线

对付"发布即投毒"的 npm 供应链攻击，在 `deno.json` 顶层加：

```jsonc
"minimumDependencyAge": {
  "age": "P1D",
  "exclude": [
    "npm:solid-js",
    "npm:@solidjs/web",
    "npm:@solidjs/router",
    "npm:@solidjs/meta",
    "npm:@solidjs/vite-plugin",
    "npm:@orpc/contract",
    "npm:@orpc/server"
  ]
}
```

含义：非排除的依赖必须发布满 1 天才可安装；Solid/oRPC 处于 RC/beta
且固定版本、由我们主动升级，因此豁免。 正常 `deno install`
若报年龄错误，等一天或（临时）把包加进 exclude。

## Verify

```sh
deno task fmt         # 应该零 diff
deno task verify      # check + lint + fmt:check + build 全绿
```

## 记录能力

在仓库根 `AGENTS.md` 的 `## Enabled capabilities`
追加：`- project-hygiene (<日期>)`。

## 组合注意

- `skills/ci` 直接调用 `deno task verify`，必须先装本技能。
- `skills/testing` 会把 `check` 扩为包含
  `vitest-setup.ts`；先后顺序无影响，后装者合并任务即可。
- 不要在 `verify` 里塞测试：测试任务由 `testing` 提供，CI 负责串联。
