// The app's data layer: server functions the UI calls directly. On the
// server they are plain function calls; in the browser the compiler turns
// each into a typed fetch against the /_server endpoint. Each one delegates
// to the contract client (src/server/client.ts), so the frontend depends on
// neither oRPC nor the implementation.
//
// Reads are wrapped in the router's `query()` — it dedupes calls on the
// server, shares one fetch between hover preloads and route entry in the
// browser, and revalidates by key after an action settles. Writes use
// `action()` (see docs/development.md) so the router can revalidate reads
// for you.
import { query } from "@solidjs/router";

import { client } from "../server/client.ts";

export async function greet(name: string) {
  "use server";
  return await client.greet({ name });
}

export const getPosts = query(async () => {
  "use server";
  return await client.post.list({ limit: 10 });
}, "posts");
