import { Title } from "@solidjs/meta";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";

// The catch-all route. httpStatus() sets the response status during SSR
// (a no-op in the browser); it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => httpStatus(404),
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <main class="grid min-h-dvh place-items-center bg-slate-950 p-6 text-slate-100">
      <div class="space-y-3 text-center">
        <Title>Not Found - Solid + Deno + Tailwind</Title>
        <h1 class="text-3xl font-bold tracking-tight">Page Not Found</h1>
        <p class="text-slate-400">
          Visit{" "}
          <a
            class="text-sky-400 hover:underline"
            href="https://docs.solidjs.com"
            target="_blank"
            rel="noreferrer"
          >
            docs.solidjs.com
          </a>{" "}
          to learn how to build Solid apps.
        </p>
      </div>
    </main>
  );
}
