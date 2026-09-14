import { oc } from "@orpc/contract";
import { z } from "zod";

// The contract is the interface of the app's core logic — the only thing
// callers depend on. The server implements it (src/server/orpc.ts), while
// the frontend never sees it: it calls server functions (src/lib/api.ts),
// which delegate to a client wired to whatever implements the contract
// (src/server/client.ts).

const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.string(),
});

// The domain type is inferred from the schema, never hand-written: one
// source of truth for the shape (src/server/data.ts imports this type).
export type Post = z.output<typeof postSchema>;

export const contract = {
  greet: oc
    .input(z.object({ name: z.string().min(1) }))
    .output(z.object({ message: z.string() })),
  post: {
    list: oc
      .input(
        z.object({
          limit: z.number().int().min(1).max(20).default(10),
        }),
      )
      .output(z.array(postSchema)),
  },
};

export type AppContract = typeof contract;
