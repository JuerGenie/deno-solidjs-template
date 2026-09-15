// Unified host — every mode serves through this file:
//
//   browser dev   deno run -A start.ts --dev
//                 starts Vite programmatically (HMR + SSR).
//   desktop dev   DESKTOP_DEV=1 deno desktop start.ts ...
//                 Vite takes the port the desktop runtime allocated
//                 (DENO_SERVE_ADDRESS) so the embedded webview gets HMR.
//   production    deno run ... start.ts  /  deno desktop start.ts ...
//                 serves dist/client statics plus the built dist/server
//                 handleRequest.
import { serveDir } from "@std/http/file-server";
import { fileURLToPath } from "node:url";

const APP_NAME = "Deno Solid App";
const IS_DEV = Deno.args.includes("--dev") ||
  Deno.env.get("DESKTOP_DEV") === "1";

const BUILT_SERVER = "./dist/server/server.js";
const CLIENT_DIR = fileURLToPath(new URL("./dist/client/", import.meta.url));
const WINDOW_SIZE = { width: 1280, height: 800 };
const WINDOW_MIN_SIZE = { width: 960, height: 640 };

interface RequestHandler {
  (
    request: Request,
    options?: { event?: { nativeEvent?: unknown } },
  ): Promise<Response>;
}

// --- `deno desktop` runtime APIs (not in the standard Deno types) ------------
type MenuEntry =
  | {
    item: {
      label: string;
      id?: string;
      accelerator?: string;
      enabled: boolean;
    };
  }
  | { submenu: { label: string; items: MenuEntry[] } }
  | { role: { role: string } }
  | "separator";

interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesktopWindow {
  getSize(): [number, number];
  setSize(width: number, height: number): void;
  setPosition(x: number, y: number): void;
  executeJs(code: string): Promise<{ value?: ScreenBounds }>;
  setApplicationMenu(items: MenuEntry[]): void;
  addEventListener(type: "close" | "resize", listener: () => void): void;
}

interface DesktopDeno {
  BrowserWindow?: new (
    options?: { title?: string; width?: number; height?: number },
  ) => DesktopWindow;
}

// Roles give the platform-native label, accelerator and behavior; the first
// submenu becomes the macOS application menu. Without this the window has no
// Cmd+Q / Cmd+W handling (and the Edit roles provide clipboard shortcuts).
const APPLICATION_MENU: MenuEntry[] = [
  {
    submenu: { label: APP_NAME, items: [{ role: { role: "quit" } }] },
  },
  {
    submenu: {
      label: "Edit",
      items: [
        { role: { role: "undo" } },
        { role: { role: "redo" } },
        "separator",
        { role: { role: "cut" } },
        { role: { role: "copy" } },
        { role: { role: "paste" } },
        { role: { role: "selectAll" } },
      ],
    },
  },
  {
    submenu: {
      label: "Window",
      items: [
        { role: { role: "minimize" } },
        { role: { role: "close" } },
      ],
    },
  },
];

// There is no minimum-size option, so a size below the floor is snapped back
// on every resize (the follow-up setSize settles immediately).
function clampToMinSize(window: DesktopWindow): void {
  const [width, height] = window.getSize();
  const clampedWidth = Math.max(width, WINDOW_MIN_SIZE.width);
  const clampedHeight = Math.max(height, WINDOW_MIN_SIZE.height);
  if (clampedWidth !== width || clampedHeight !== height) {
    window.setSize(clampedWidth, clampedHeight);
  }
}

// Centering needs the renderer's screen work area (no host-side screen API),
// and the webview is not ready right away — retry until executeJs answers.
async function centerWindow(window: DesktopWindow, attempt = 0): Promise<void> {
  try {
    const result = await window.executeJs(
      "({ x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight })",
    );
    const bounds = result?.value;
    if (!bounds) throw new Error("no screen bounds");
    const [width, height] = window.getSize();
    window.setPosition(
      Math.round(bounds.x + (bounds.width - width) / 2),
      Math.round(bounds.y + (bounds.height - height) / 2),
    );
  } catch {
    if (attempt < 40) {
      setTimeout(() => void centerWindow(window, attempt + 1), 250);
    }
  }
}

// The first BrowserWindow constructed adopts the startup window. Closing it
// does not stop the runtime while Deno.serve is alive, so exit explicitly —
// that is what makes the traffic light, Cmd+W and Cmd+Q actually quit.
function setupDesktopWindow(): void {
  const api = Deno as unknown as DesktopDeno;
  if (typeof api.BrowserWindow !== "function") return;
  const window = new api.BrowserWindow({ title: APP_NAME, ...WINDOW_SIZE });
  window.setApplicationMenu(APPLICATION_MENU);
  window.addEventListener("resize", () => clampToMinSize(window));
  window.addEventListener("close", () => {
    Deno.exit(0);
  });
  void centerWindow(window);
}

// The desktop runtime writes `tcp:127.0.0.1:<port>` for the webview to load.
function desktopPort(): number | undefined {
  const address = Deno.env.get("DENO_SERVE_ADDRESS");
  const port = address?.match(/:(\d+)$/)?.[1];
  return port ? Number(port) : undefined;
}

async function startDevServer(): Promise<void> {
  const { createServer } = await import("vite");
  const allocated = desktopPort();
  // In desktop mode the webview is already pointed at the allocated address,
  // so silently hopping to another port would strand it.
  const server = await createServer({
    plugins: [
      {
        name: "dev-readiness",
        // The desktop runtime polls `GET /` with no Accept header until the
        // address answers; Vite's HTML fallback ignores those (404), which
        // parks the webview for its full 15s probe budget. Answer the probe
        // before internal middlewares.
        configureServer(devServer) {
          devServer.middlewares.use((request, response, next) => {
            if (
              request.method === "GET" && request.url === "/" &&
              !request.headers.accept
            ) {
              response.statusCode = 200;
              response.setHeader("content-type", "text/plain; charset=utf-8");
              response.end(
                "dev server is running. Request with `Accept: text/html` for the app.\n",
              );
              return;
            }
            next();
          });
        },
      },
    ],
    server: {
      port: allocated ?? Number(Deno.env.get("PORT") ?? 3000),
      strictPort: allocated !== undefined,
      host: "127.0.0.1",
    },
  });
  // Document requests only — the quickest way to confirm the embedded webview
  // actually reached the dev server.
  server.httpServer?.on("request", (request) => {
    if (request.headers.accept?.includes("text/html")) {
      console.log(`[dev] ${request.method ?? "GET"} ${request.url ?? "/"}`);
    }
  });
  await server.listen();
  server.printUrls();
}

async function startProductionServer(): Promise<void> {
  const { handleRequest } = (await import(BUILT_SERVER)) as {
    handleRequest: RequestHandler;
  };
  const port = desktopPort() ?? Number(Deno.env.get("PORT") ?? 3000);
  const hostname = Deno.env.get("HOST") ?? "127.0.0.1";

  Deno.serve({ port, hostname }, async (request, info) => {
    if (request.method === "GET" || request.method === "HEAD") {
      // Built assets live in dist/client; anything not found there (app
      // routes, /_server, /api/rpc) falls through to the SSR handler.
      const asset = await serveDir(request, {
        fsRoot: CLIENT_DIR,
        quiet: true,
      });
      if (asset.status !== 404) return asset;
    }
    return await handleRequest(request, { event: { nativeEvent: info } });
  });
}

if (desktopPort() !== undefined) {
  setupDesktopWindow();
}

if (IS_DEV) {
  await startDevServer();
} else {
  await startProductionServer();
}
