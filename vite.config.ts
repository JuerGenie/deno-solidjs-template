import { fileRoutes } from "filesystem-routing/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    // Turnkey SSR: no index.html and no entry files — the plugin generates the
    // entries around src/App.tsx, wrapped in src/Document.tsx. `vite build`
    // emits client assets to dist/client and the request handler to
    // dist/server; `deno task start` serves both with server.js.
    solid({
      start: {
        // Fetch-style chain fronting every request: dispatches API routes
        // (src/routes/api), including the oRPC endpoint.
        middleware: "./src/middleware.ts",
      },
      ssr: true,
      // Compiles 'use server' functions into fetch calls on the client and
      // serves them from the /_server endpoint (src/lib/api.ts).
      serverFunctions: true,
    }),
    // Scans src/routes: pages feed the router (src/router.ts), GET/POST/...
    // exports become API routes served by the middleware above.
    fileRoutes({ httpMethods: true, types: true }),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
