# Deno Desktop：打印（子技能）

> `skills/deno-desktop/` 技能集的子文件，由 [`SKILL.md`](./SKILL.md) 按需加载。
> 用 CEF（Chromium）的打印能力输出 PDF / 标签。

## 何时使用

- 要"连打印机打印 PDF"（商品标签、面单、报表）。
- 要控制纸张尺寸、分页，或需要打印预览。

## 前置检查（sentinel）

`deno.json` 里 `desktop.backend === "cef"`（见 [`packaging.md`](./packaging.md) 第 2 步），
且项目里已有 print-only 容器（`grep -q "print-sheets" src/App.css`）→ 已安装，只跑 Verify。
未装先做 [`SKILL.md`](./SKILL.md) 的 Apply。

## 原理（决定写法，先读）

- **laufey 不暴露原生打印 API**（既没有打印对话框接口，也没有宿主侧屏幕 API），
  所以打印走 web 平台：`window.print()` 由 CEF/Chromium 接管，弹出系统打印对话框。
- **PDF 不能直接 `window.print()`**：`<iframe src="doc.pdf">` 里的内容由 PDF 插件
  渲染，不参与父页面的打印管线；要把待打印内容**先栅格化成图片**再排版成普通 HTML
  （pdf.js → canvas → PNG）。
- pdf.js 只在浏览器里跑：动态 import worker 模块即可启用主线程 fake worker
  （不需要 Vite 的 worker 配置）；**SSR 阶段要加挂载守卫**（`typeof document ===
  "undefined"` + `onSettled`），否则服务端渲染会炸。
- 打印容器与页面 UI 分离：`@media print` 只显示打印容器，UI 用 Tailwind 的
  `print:hidden` 隐藏；`@page` 决定纸张。

## Apply

### 1. 打印样式（src/App.css）

```css
/* The tool renders what should print into .print-sheets (PNG pages) and calls
   window.print(); the app UI is hidden via Tailwind's print: variants. */
.print-sheets {
  display: none;
}

@page {
  size: 50mm 30mm; /* 改成你的纸张；A4 用 size: A4; margin: 0 也一样 */
  margin: 0;
}

@media print {
  .print-sheets {
    display: block !important;
  }

  .print-sheet {
    break-after: page;
  }

  .print-sheet:last-child {
    break-after: auto;
  }

  .print-sheet img {
    display: block;
    width: 100%;
    height: auto;
  }
}
```

页面结构（JSX 片段）：

```tsx
<>
  <div class="print:hidden">{/* 正常界面 */}</div>

  <Show when={printQueue().length > 0}>
    <div class="print-sheets">
      <For each={printQueue()}>
        {(page) => (
          <div class="print-sheet" data-print-sheet>
            <img src={page.dataUrl} alt="" />
          </div>
        )}
      </For>
    </div>
  </Show>
</>
```

### 2. 栅格化（客户端 pdf.js 封装）

```ts
// Client-only PDF rasterization on top of pdf.js. Importing the worker build
// on the main thread registers `globalThis.pdfjsWorker`, so pdf.js uses its
// in-thread "fake worker" — no Vite worker plumbing needed.
export interface RenderedPdfPage {
  dataUrl: string;
  width: number;
  height: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | undefined;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      await import("pdfjs-dist/build/pdf.worker.mjs");
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function renderPdfPages(
  url: string,
  scale: number, // ~4 ≈ 300dpi；预览用 2 即可
): Promise<RenderedPdfPage[]> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ url });
  const pdf = await loadingTask.promise;
  try {
    const pages: RenderedPdfPage[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
```

> SSR 守卫：把渲染放进 `createMemo`（用挂载标记门控）或事件处理器里，
> 绝不要在 SSR 期间执行（`document` 不存在）。PDF 字段的缩略图同理。

### 3. 打印流程（等资源就绪再调 print）

```ts
async function printPages(urls: string[]) {
  setPrinting(true);
  try {
    const sheets: RenderedPdfPage[] = [];
    for (const url of urls) {
      sheets.push(...await renderPdfPages(url, 4));
    }
    setPrintQueue(sheets);
    flush(); // 让 print-only 容器进入 DOM
    await waitForPrintImages(sheets.length);
    globalThis.print(); // Chromium 接管：系统打印对话框
  } finally {
    setPrintQueue([]);
    setPrinting(false);
  }
}

async function waitForPrintImages(expected: number) {
  const deadline = Date.now() + 5000;
  let images: HTMLImageElement[] = [];
  while (Date.now() < deadline) {
    images = Array.from(
      document.querySelectorAll<HTMLImageElement>("[data-print-sheet] img"),
    );
    if (images.length >= expected) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      await image.decode().catch(() => undefined);
    }),
  );
}
```

依赖：`deno add npm:pdfjs-dist@<pin>`（版本锁在 `deno.json`，与 `pdf-lib` 之类
服务端 PDF 工具分开）。浏览器里 pdf.js 的 fake worker 对单页小 PDF 足够快，
不需要额外 worker 配置。

## Verify

自动化（headless Chromium / CDP）：把 `window.print` 换成记账函数，触发打印，
断言 ① 打印容器出现了预期数量的图片、② 图片 `naturalWidth > 0`、③ `print` 被调用：

```ts
await evaluate(`(async () => {
  let printed = false;
  globalThis.print = () => { printed = true; };
  // …点击打印按钮…
  const img = document.querySelector("[data-print-sheet] img");
  return { printed, loaded: !!img && img.naturalWidth > 0 };
})()`);
```

人工：点打印 → 系统打印对话框里纸张尺寸正确（`@page` 生效）、一页一张、
条码/文字未被裁切；对接标签打印机时确认打印机端纸张与 `@page` 一致。

## 组合注意

- 需要 `backend: "cef"`（`webview` 后端下 `window.print()` 行为不保证），
  所以先走一遍 [`packaging.md`](./packaging.md)。
- CEF 让安装包大数百 MB；打印能力是选它的主要理由之一。
- 非标准纸张（如 50×30mm 标签）在系统打印对话框里仍要选对纸张/缩放；
  `@page` 只表达页面尺寸，不能替用户选打印机。
- 多页 PDF 会按 `break-after: page` 一页一张；混合纸张尺寸不受支持。

## 回滚

- 删除打印容器/样式与栅格化模块，移除 `pdfjs-dist` 依赖；`backend` 可回退
  `webview`（如需沿用打包任务，见 [`packaging.md`](./packaging.md) 回滚）。

## 记录能力

本子文件属于 `deno-desktop` 技能集：能力登记在主技能那一行即可
（`- deno-desktop (<日期>)`），不必单开一行。
