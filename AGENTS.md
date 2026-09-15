# Agent Guide

This is a **Deno + SolidJS 2.0 full-stack template**: Vite 8 turnkey SSR,
file-system routing (`filesystem-routing` + `@solidjs/router` 2), contract-first
RPC (oRPC 2 + Zod 4), Tailwind 4, server functions (`"use server"`). Solid is
**not React** and 2.0 is **not 1.x** — components run once, reactivity is
fine-grained, and several 1.x/React patterns are hard errors here. Do not port
React patterns.

## Commands

Deno owns dependencies and tasks — there is no `package.json`. `deno install`
materializes `node_modules` from the `imports` map in `deno.json` (locked by
`deno.lock`).

```sh
deno task dev          # programmatic Vite dev server (SSR + HMR), port 3000
deno task build        # dist/client + dist/server/server.js
deno task start        # production host: start.ts (static + handleRequest)
deno task dev:desktop  # desktop app served by the Vite dev server (client HMR)
deno task serve        # vite preview (no host file)
deno task check        # deno check src start.ts
deno task lint
```

Infrastructure beyond this baseline is **opt-in via skills** — do not assume
`fmt`, `verify`, `test`, `env.ts`, or CI exist until the matching skill has been
applied.

## Repo map

| Path                        | What it is                                                                      |
| --------------------------- | ------------------------------------------------------------------------------- |
| `src/protocol/contract.ts`  | The contract (`oc` + zod). Every API change starts here.                        |
| `src/protocol/transport.ts` | `rpcPath` shared by the client, the API route, and external clients.            |
| `src/server/orpc.ts`        | `implement(contract)` implementation + `RPCHandler` (HTTP surface).             |
| `src/server/client.ts`      | Server-side access seam (`createRouterClient`, in-process).                     |
| `src/server/data.ts`        | Data access; swap for a database without touching the contract.                 |
| `src/lib/api.ts`            | App data layer: server functions wrapped in router `query()` / `action()`.      |
| `src/routes/**`             | File-system routes: default export = page, `GET`/`POST`/… exports = API routes. |
| `src/middleware.ts`         | Fetch-style middleware chain fronting every request.                            |
| `src/App.tsx`               | App root: `Router` + global `<Loading>` / `<Errored>` boundaries.               |
| `src/Document.tsx`          | The document shell (`<html>`/`<head>`/`<HydrationScript>`).                     |
| `start.ts`                  | Unified host: dev (Vite programmatic) + production (static + `handleRequest`).  |
| `docs/`                     | `architecture.md` (layers/data flow) · `development.md` (dev spec).             |
| `skills/`                   | Opt-in capability modules. Index: `skills/README.md`.                           |

## Hard rules

1. **Contract first**: change `src/protocol/contract.ts`, then implementation,
   then `src/lib/api.ts`, then UI. The contract is the only source of truth for
   input/output types.
2. **UI never imports `src/server/*`** and never creates a browser-side oRPC
   client — it calls server functions from `src/lib/api.ts`.
3. **Server functions** (`"use server"`) must return serializable values (JSON
   by default); their body and static imports stay server-side. Reads go through
   `query()`, writes through `action()`.
4. **Solid 2.0**: pass props by value and never destructure them;
   `createEffect(compute, apply)`; no signal writes in owned scopes; async
   derived state is a `createMemo` + `<Loading>` — there is no
   `createResource`/`Suspense`/`batch`.
5. **Tailwind classes must appear literally**; never build class names
   dynamically.
6. **Dependencies** only via `deno.json` imports (`deno add npm:pkg@version`),
   lockfile committed. oRPC/Solid are beta/RC — exact pins, upgrade both sides
   together.
7. Do not introduce new architectural layers; keep data access in
   `src/server/*`.

Full rules and pitfalls: `docs/development.md` (Chinese, authoritative).

## Skills (opt-in capabilities)

Skill modules live in `skills/`. **Read a skill's `SKILL.md` before doing that
class of work; do not enable capabilities the task did not ask for.** Applying a
skill = follow its Apply steps, run its Verify commands, then append a line to
`## Enabled capabilities` below.

| Skill                              | Read when                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `skills/skills-index/SKILL.md`     | Unsure where to start / which skill or doc to read — navigation hub.                  |
| `skills/deno-solidjs-app/SKILL.md` | Any work in this project: running tasks, adding routes/procedures/queries, debugging. |
| `skills/project-hygiene/SKILL.md`  | Adding formatting gates / a single `deno task verify`.                                |
| `skills/testing/SKILL.md`          | Adding Vitest infrastructure or writing tests.                                        |
| `skills/typed-env/SKILL.md`        | Needing env vars (typed, validated, leak-protected).                                  |
| `skills/deno-desktop/`             | Desktop dev mode set: one `start.ts` host (`SKILL.md`) + `packaging.md` / `printing.md`. |
| `skills/ci/SKILL.md`               | Adding GitHub Actions CI (requires hygiene + testing).                                |

Composition rules and the apply protocol live in `skills/README.md`.

## Enabled capabilities

- deno-desktop (2026-09-15)

## Versioned skills (in node_modules — read on demand)

Installed packages ship agent skills matching their exact versions:

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` — maps every
  Solid dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`,
  `STRICT_READ_UNTRACKED`) to its repair. Read it whenever a diagnostic code
  shows up in test output or the browser console.

## Verification loop

Baseline after any change:

```sh
deno task check && deno task lint && deno task build
```

Smoke the production artifact when touching routes/server code:

```sh
PORT=3105 deno task start &
curl -s localhost:3105/posts | grep -o "<h1[^>]*>Posts"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3105/nope          # expect 404
curl -s -X POST localhost:3105/api/rpc/greet -H 'content-type: application/json' \
  -d '{"json":{"name":"world"}}'                                      # expect {"json":{"message":"Hello, world!"}}
```

After `skills/project-hygiene`: `deno task verify`. After `skills/testing`:
`deno task test:run`.

## Docs

- `docs/architecture.md` — layers, request journey, boundaries, the `/posts`
  end-to-end example.
- `docs/development.md` — the development spec: Solid 2.0, router data APIs,
  server functions, oRPC + Zod 4, Tailwind 4, Deno conventions, review
  checklist.
