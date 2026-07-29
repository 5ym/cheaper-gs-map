import { rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outdir = join(root, "dist");
const dataFile = join(root, "data", "stations.json");

/** GitHub Pages のプロジェクトページはサブパス配信なので相対パスで出力する */
async function build(): Promise<void> {
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(root, "src/web/index.html")],
    outdir,
    minify: true,
    sourcemap: "linked",
    publicPath: "./",
    naming: { chunk: "assets/[name]-[hash].[ext]", asset: "assets/[name]-[hash].[ext]" },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  // MapLibre はバンドルと同じ階層に置かれた maplibre-gl-worker.mjs を実行時に読む
  // (import.meta.url からの相対解決)。バンドラは追跡できないので手で配置する。
  // 置き忘れると GeoJSON がワーカーで処理されず、ラスタタイルだけが出てピンが出ない
  const mlDist = join(root, "node_modules/maplibre-gl/dist");
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const from = join(mlDist, file);
    if (!existsSync(from)) throw new Error(`${file} が見つかりません: ${from}`);
    await cp(from, join(outdir, "assets", file));
  }

  // 価格ラベル用のグリフ (半角数字のみ)
  await cp(join(root, "src/web/fonts"), join(outdir, "fonts"), { recursive: true });

  await mkdir(join(outdir, "data"), { recursive: true });
  if (existsSync(dataFile)) {
    await cp(dataFile, join(outdir, "data", "stations.json"));
  } else {
    console.warn("! data/stations.json がありません。先に `bun run scrape` を実行してください");
  }

  const bytes = result.outputs.reduce((sum, o) => sum + o.size, 0);
  console.log(`build: ${result.outputs.length} files / ${(bytes / 1024).toFixed(0)} KB → dist/`);
}

await build();

if (process.argv.includes("--serve")) {
  const port = Number(process.env.PORT ?? 5173);
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = Bun.file(join(outdir, path));
      return file.exists().then((ok) => (ok ? new Response(file) : new Response("Not Found", { status: 404 })));
    },
  });
  console.log(`dev server: http://localhost:${port}/`);
}
