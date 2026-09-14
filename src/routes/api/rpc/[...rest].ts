// The oRPC endpoint as an API route: createAPIHandler (src/middleware.ts)
// dispatches GET/POST here, and the RPCHandler owns procedure matching under
// the mount point. No default export, so no page — and as a handler-only
// module this file and its imports (the router) never enter the client
// bundle.
import type { APIEvent, APIHandler } from "filesystem-routing/api";

import { rpcPath } from "../../../protocol/transport.ts";
import { orpcHandler } from "../../../server/orpc.ts";

async function serve(event: APIEvent): Promise<Response> {
  const { matched, response } = await orpcHandler.handle(event.request, {
    prefix: rpcPath,
    context: {},
  });
  return matched ? response : new Response(null, { status: 404 });
}

export const GET: APIHandler = serve;
export const POST: APIHandler = serve;
