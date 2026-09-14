import { Title } from "@solidjs/meta";
import type { RouteDefinition } from "@solidjs/router";
import { createMemo, For } from "solid-js";

import { getPosts } from "../lib/api.ts";

// Data on navigation: `preload` starts the query as navigation begins (and
// on link hover), the component reads the same cached value through a memo,
// and the root <Loading> boundary (src/App.tsx) shows its fallback until the
// promise settles. Reads are server functions (src/lib/api.ts) — direct
// calls during SSR, typed fetches in the browser.
export const route = {
  preload: () => void getPosts(),
} satisfies RouteDefinition;

export default function Posts() {
  const posts = createMemo(() => getPosts());

  return (
    <main class="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <div class="mx-auto max-w-2xl space-y-6">
        <Title>Posts - Solid + Deno + Tailwind</Title>
        <header class="flex items-baseline justify-between">
          <h1 class="text-3xl font-bold tracking-tight">Posts</h1>
          <a class="text-sky-400 hover:underline" href="/">← Home</a>
        </header>
        <ul class="space-y-4">
          <For each={posts()}>
            {(post) => (
              <li class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h2 class="font-semibold">{post.title}</h2>
                <p class="mt-1 text-sm text-slate-300">{post.summary}</p>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <For each={post.tags}>
                    {(tag) => (
                      <span class="rounded bg-slate-800 px-2 py-0.5">
                        {tag}
                      </span>
                    )}
                  </For>
                  <time class="ml-auto">{post.publishedAt}</time>
                </div>
              </li>
            )}
          </For>
        </ul>
      </div>
    </main>
  );
}
