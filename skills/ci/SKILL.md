---
name: ci
description: Use when a derived project needs continuous integration — adding a GitHub Actions workflow that installs Deno dependencies and runs verify/test/build on push and pull requests. Triggers include GitHub Actions, CI, workflow, pull request checks.
---

# CI：GitHub Actions

在 push / pull request 上跑与本地一致的闭环：`deno install` → `deno task verify`
→ `deno task test:run`。

## 何时使用

- 仓库需要 PR 门禁。
- 准备把本地验证闭环交给远端执行。

## 前置检查（sentinel 与硬前置）

1. `.github/workflows/ci.yml` 已存在 → 已安装，跳过 Apply。
2. 当前目录是 git 仓库（`git rev-parse --is-inside-work-tree`）；不是则先
   `git init` 并提交。
3. `deno.json` 的 tasks 必须同时有 `verify`（来自 `skills/project-hygiene`）与
   `test:run`（来自 `skills/testing`）。 缺哪个先装哪个技能；**不要**在 workflow
   里内联手写格式检查/测试命令，否则本地与 CI 会漂移。

## Apply

### 1. .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          # 固定到实际开发版本（deno --version），避免 CI 与本地漂移；
          # 想跟随次要版本可用 v2.x
          deno-version: v2.9.6

      # CI 环境下 install 默认冻结 lockfile；锁文件不在就无法通过
      - run: deno install

      - run: deno task verify
      - run: deno task test:run
```

### 2. 快速失败顺序

顺序即本地验证顺序：`check` → `lint` → `fmt:check` → `build` → `test`。 `verify`
已包含前四项，`test:run` 放最后（最慢）。

## Verify

本地等价：

```sh
deno task verify && deno task test:run
```

远端：push 后在 Actions 页看到 `verify` job 全绿；故意改坏一个类型或格式应能让
PR 变红。

## 记录能力

在 `AGENTS.md` 的 `## Enabled capabilities` 追加：`- ci (<日期>)`。

## 组合注意

- 只装了 hygiene 时：先装 testing 再加测试步骤，或临时删除 `test:run` 一行并在
  PR 描述里注明欠账。
- 部署（Deno Deploy / 容器 /
  `deno desktop`）是独立事项，不在本技能内；需要时新增 `deploy` 技能，复用这里的
  `verify`。
- 若仓库默认分支不是 `main`，改 `push.branches`
  或不限分支（`on: [push, pull_request]`）。
