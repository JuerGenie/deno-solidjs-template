// Server-only data access. Handlers (src/server/orpc.ts) stay thin and
// delegate here, so this module - and everything it imports — never has to
// exist in the client graph. Replace this in-memory list with a database or
// service call; the contract (src/protocol/contract.ts) does not change.
import type { Post } from "../protocol/contract.ts";

const posts: Post[] = [
  {
    id: "hello-solid",
    title: "Hello, Solid 2.0",
    summary: "Why fine-grained reactivity changes how you write UI code.",
    tags: ["solid", "reactivity"],
    publishedAt: "2026-09-01",
  },
  {
    id: "contract-first",
    title: "Contract-first with oRPC",
    summary: "One schema file, runtime validation, and end-to-end types.",
    tags: ["orpc", "zod"],
    publishedAt: "2026-09-05",
  },
  {
    id: "deno-tasks",
    title: "Deno tasks instead of package.json",
    summary: "Dependencies, lockfile, and scripts live in deno.json.",
    tags: ["deno"],
    publishedAt: "2026-09-10",
  },
];

export function listPosts(limit: number): Post[] {
  return posts.slice(0, limit);
}
