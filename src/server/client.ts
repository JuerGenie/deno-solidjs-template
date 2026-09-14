// The server's connection to the contract implementation — the one seam to
// swap when the implementation moves. Server functions (src/lib/api.ts) only
// ever see this client, typed by the contract.
//
// Local (default): in-process direct calls, no HTTP hop.
// Remote service:  createORPCClient(new RPCLink({ url })) from
//                  @orpc/client/fetch.
// Worker / iframe: RPCLink from @orpc/client/message-port.
import { createRouterClient } from "@orpc/server";
import type { RouterContractClient } from "@orpc/contract";
import type { AppContract } from "../protocol/contract.ts";
import { router } from "./orpc.ts";

export const client: RouterContractClient<AppContract> = createRouterClient(
  router,
  { context: {} },
);
