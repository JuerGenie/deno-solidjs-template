import { implement, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { contract } from "../protocol/contract.ts";
import { listPosts } from "./data.ts";

const os = implement(contract);

// The service's implementation of the contract: core logic goes in these
// handlers. Nothing here knows how it is reached.
export const router = os.router({
  greet: os.greet.handler(({ input }) => ({
    message: `Hello, ${input.name}!`,
  })),
  post: {
    list: os.post.list.handler(({ input }) => listPosts(input.limit)),
  },
});

// The HTTP surface over the same router, served by the API route at
// src/routes/api/rpc/[...rest].ts — for external clients that cannot call
// server functions.
export const orpcHandler = new RPCHandler(router, {
  interceptors: [onError((error) => console.error(error))],
});
