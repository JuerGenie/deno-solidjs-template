import { Title } from "@solidjs/meta";
import { createSignal } from "solid-js";

import { greet } from "../lib/api.ts";

// The frontend calls the server function — never a browser oRPC client.
// The compiler turns the call into a typed fetch; the server-side body
// delegates to the contract client (src/lib/api.ts → src/server/client.ts).
// The /posts page (src/routes/posts.tsx) shows the read path: a router
// `query()` warmed by `route.preload` (src/lib/api.ts).
export default function Home() {
  const [name, setName] = createSignal("world");
  const [message, setMessage] = createSignal("");
  const [pending, setPending] = createSignal(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setPending(true);
    try {
      setMessage((await greet(name())).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main class="grid min-h-dvh place-items-center bg-slate-950 p-6 text-slate-100">
      <div class="w-full max-w-md space-y-6">
        <Title>Home - Solid + Deno + Tailwind</Title>
        <h1 class="text-3xl font-bold tracking-tight">
          Solid + Deno + Tailwind
        </h1>
        <form class="flex gap-2" onSubmit={onSubmit}>
          <input
            class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-sky-500"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button
            type="submit"
            class="rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
            disabled={pending()}
          >
            {pending() ? "…" : "Greet"}
          </button>
        </form>
        <p class="min-h-6 text-slate-300">{message()}</p>
        <a class="text-sky-400 hover:underline" href="/posts">
          Read posts →
        </a>
      </div>
    </main>
  );
}
