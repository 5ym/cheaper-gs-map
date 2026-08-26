/**
 * dist/ を実際のブラウザで開いて描画を確認するスモークテスト。
 *
 * 地図は WebGL とワーカーで動くので、型検査やスタイル検証では
 * 「タイルは出るがピンが出ない」類の壊れ方を検出できない。
 * (maplibre-gl-worker.mjs の配置漏れで実際に一度やらかしている)
 *
 * ブラウザ操作は Bun 1.4 の Bun.WebView を使う。Linux では CDP 経由で
 * 既存の Chrome / Chromium / chrome-headless-shell を動かす。
 */
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const outdir = join(root, "dist");
const port = Number(process.env.SMOKE_PORT ?? 4173);
const origin = `http://localhost:${port}`;

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

/**
 * 動かすブラウザを探す。Bun の自動検出は環境によっては当たらないので自分で辿る。
 * CI (ubuntu-latest) には Chrome が入っている。ローカルに無ければ
 * Playwright が入れた chrome-headless-shell を借りる。
 */
function findChrome(): string | null {
  const fromEnv = process.env.BUN_CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  for (const name of [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "brave-browser",
    "microsoft-edge",
    "chrome",
  ]) {
    const found = Bun.which(name);
    if (found) return found;
  }

  const cache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).sort().reverse()) {
      for (const rel of [
        "chrome-headless-shell-linux64/chrome-headless-shell",
        "chrome-linux/chrome",
      ]) {
        const candidate = join(cache, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error(
    "Chrome / Chromium が見つかりません。インストールするか BUN_CHROME_PATH を指定してください",
  );
  process.exit(1);
}
console.log("browser:", chrome);

const failures: string[] = [];
const describe = (v: unknown) =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);

const view = new Bun.WebView({
  width: 1280,
  height: 800,
  // ヘッドレスでも WebGL を使えるようにする (ソフトウェアラスタライザ)
  backend: {
    type: "chrome",
    path: chrome,
    argv: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"],
  },
  console: (type, ...args) => {
    const text = args.map(describe).join(" ");
    if (type === "error") failures.push(`console.error: ${text}`);
    // グリフやタイルの取得失敗は警告どまりなので個別に拾う
    if (/^warn/.test(type) && /Unable to load|not found/i.test(text)) {
      failures.push(`警告: ${text}`);
    }
  },
});

/**
 * 自分が配信しているファイルの取得失敗だけを見る
 * (外部タイル CDN は圏外 404 や移動時の中断が普通に起きる)。
 *
 * なお CDP のセッションはこのタブに閉じているので、MapLibre のワーカーが
 * 出すリクエスト (タイル・グリフ) はここには現れない。ワーカー自体が
 * 落ちる類の壊れ方は、描画されたスタンド数の方で検出している。
 */
const urls = new Map<string, string>();
const isOurs = (url = "") => url.startsWith(origin);

try {
  // CDP セッションは最初の navigate で張られる
  await view.navigate("about:blank");
  await view.cdp("Network.enable");
  await view.cdp("Runtime.enable");

  view.addEventListener("Network.requestWillBeSent", (e) => {
    const d = (e as { data?: any }).data;
    if (d?.requestId && d?.request?.url) urls.set(d.requestId, d.request.url);
  });
  view.addEventListener("Network.loadingFailed", (e) => {
    const d = (e as { data?: any }).data;
    const url = urls.get(d?.requestId) ?? "";
    if (isOurs(url)) failures.push(`リクエスト失敗: ${url} (${d?.errorText})`);
  });
  view.addEventListener("Network.responseReceived", (e) => {
    const d = (e as { data?: any }).data;
    const { url = "", status = 0 } = d?.response ?? {};
    if (isOurs(url) && status >= 400) failures.push(`HTTP ${status}: ${url}`);
  });
  view.addEventListener("Runtime.exceptionThrown", (e) => {
    const d = (e as { data?: any }).data;
    failures.push(`ページ内例外: ${d?.exceptionDetails?.exception?.description ?? d?.exceptionDetails?.text}`);
  });

  await view.navigate(`${origin}/`);

  const PROBE = `(() => {
    const map = window.__map;
    const toast = document.getElementById('toast');
    const menu = document.querySelector('.layers__menu');
    return {
      listItems: document.querySelectorAll('.list__item').length,
      count: (document.getElementById('count') || {}).textContent || '',
      toast: toast && !toast.hidden ? toast.textContent : null,
      dots: map ? map.queryRenderedFeatures({ layers: ['station-dots'] }).length : -1,
      labels: map ? map.queryRenderedFeatures({ layers: ['station-labels'] }).length : -1,
      menuHidden: menu ? menu.hasAttribute('hidden') : false,
    };
  })()`;

  // タイルとワーカーの都合で描画完了まで少しかかる。固定待ちにせず描けるまで待つ
  type Probe = {
    listItems: number;
    count: string;
    toast: string | null;
    dots: number;
    labels: number;
    menuHidden: boolean;
  };
  let result = (await view.evaluate(PROBE)) as Probe;
  for (let i = 0; i < 30 && result.dots <= 0; i++) {
    await Bun.sleep(500);
    result = (await view.evaluate(PROBE)) as Probe;
  }

  console.log("結果:", JSON.stringify(result));

  if (result.listItems === 0) failures.push("一覧が空");
  if (result.toast) failures.push(`トースト表示: ${result.toast}`);
  if (result.dots <= 0) failures.push("地図にスタンドの点が描かれていない");
  if (result.labels <= 0) failures.push("地図に価格ラベルが描かれていない");
  if (!result.menuHidden) failures.push("背景切替メニューが開いたままになっている");

  // 一覧をクリックしたらポップアップが出るか
  await view.click(".list__item");
  await Bun.sleep(1500);
  const popups = await view.evaluate("document.querySelectorAll('.maplibregl-popup').length");
  if (Number(popups) === 0) failures.push("一覧をクリックしてもポップアップが出ない");
} catch (e) {
  failures.push(`操作に失敗: ${(e as Error).message}`);
} finally {
  view.close();
  server.stop(true);
}

if (failures.length > 0) {
  console.error("\nスモークテスト失敗:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("スモークテスト OK");
