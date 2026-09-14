// The router instance, in its own module so both graphs share one source of
// truth: src/App.tsx renders it, and its routes come from the file system
// (src/routes, scanned by the fileRoutes plugin in vite.config.ts).
import { pageRoutes } from "virtual:file-routes";
import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";

export const Router = createRouter({ routes: fileRoutes(pageRoutes) });

export const { paths } = Router;
