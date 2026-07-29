/**
 * dist/ を実際のブラウザで開いて描画を確認するスモークテスト。
 *
 * 地図は WebGL とワーカーで動くので、型検査やスタイル検証では
 * 「タイルは出るがピンが出ない」類の壊れ方を検出できない。
 * (maplibre-gl-worker.mjs の配置漏れで実際に一度やらかしている)
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import type { Map as MapLibreMap } from "maplibre-gl";

const root = new URL("..", import.meta.url).pathname;
const outdir = join(root, "dist");
const port = Number(process.env.SMOKE_PORT ?? 4173);

if (!existsSync(join(outdir, "index.html"))) {
  console.error("dist/index.html がありません。先に `bun run build` を実行してください");
  process.exit(1);
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(join(outdir, path === "/" ? "/index.html" : decodeURIComponent(path)));
    return (await file.exists()) ? new Response(file) : new Response("Not Found", { status: 404 });
  },
});

const failures: string[] = [];
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on("pageerror", (e) => failures.push(`ページ内例外: ${e.message}`));
page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error") failures.push(`console.error: ${text}`);
  // グリフやタイルの取得失敗は警告どまりなので個別に拾う
  if (m.type() === "warning" && /Unable to load|not found/i.test(text)) {
    failures.push(`警告: ${text}`);
  }
});
// 外部のタイル CDN は圏外タイルの 404 や移動時の中断で普通に失敗するので、
// 自分が配信しているファイル (ワーカー・グリフ・データ) の失敗だけを見る
const origin = `http://localhost:${port}`;
const isOurs = (url: string) => url.startsWith(origin);

page.on("requestfailed", (r) => {
  if (isOurs(r.url())) failures.push(`リクエスト失敗: ${r.url()}`);
});
page.on("response", (r) => {
  if (isOurs(r.url()) && r.status() >= 400) failures.push(`HTTP ${r.status()}: ${r.url()}`);
});

try {
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(6000);

  const result = await page.evaluate(() => {
    const map = (window as unknown as { __map?: MapLibreMap }).__map;
    return {
      listItems: document.querySelectorAll(".list__item").length,
      count: document.getElementById("count")?.textContent ?? "",
      toast: document.getElementById("toast")?.hidden
        ? null
        : (document.getElementById("toast")?.textContent ?? null),
      dots: map?.queryRenderedFeatures({ layers: ["station-dots"] }).length ?? -1,
      labels: map?.queryRenderedFeatures({ layers: ["station-labels"] }).length ?? -1,
      menuHidden: document.querySelector(".layers__menu")?.hasAttribute("hidden") ?? false,
    };
  });

  console.log("結果:", JSON.stringify(result));

  if (result.listItems === 0) failures.push("一覧が空");
  if (result.toast) failures.push(`トースト表示: ${result.toast}`);
  if (result.dots <= 0) failures.push("地図にスタンドの点が描かれていない");
  if (result.labels <= 0) failures.push("地図に価格ラベルが描かれていない");
  if (!result.menuHidden) failures.push("背景切替メニューが開いたままになっている");

  // 一覧をクリックしたらポップアップが出るか
  await page.locator(".list__item").first().click();
  await page.waitForTimeout(2000);
  if ((await page.locator(".maplibregl-popup").count()) === 0) {
    failures.push("一覧をクリックしてもポップアップが出ない");
  }
} catch (e) {
  failures.push(`操作に失敗: ${(e as Error).message}`);
} finally {
  await browser.close();
  server.stop(true);
}

if (failures.length > 0) {
  console.error("\nスモークテスト失敗:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("スモークテスト OK");
