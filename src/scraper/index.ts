import { mkdir } from "node:fs/promises";
import { BRANDS, FUELS, PREFECTURES, SPAN, SPAN_LABELS } from "./config.ts";
import { collectStations } from "./stations.ts";
import type { Dataset } from "../shared/types.ts";

const OUT_DIR = new URL("../../data/", import.meta.url).pathname;
const OUT_FILE = `${OUT_DIR}stations.json`;

async function main(): Promise<void> {
  const started = Date.now();

  // PREF_CODES=13,14 のように指定すると一部の県だけ取得できる (動作確認用)
  const only = process.env.PREF_CODES?.split(",").map(Number);
  const targets = only ? PREFECTURES.filter((p) => only.includes(p.code)) : PREFECTURES;

  const stations = await collectStations(targets);

  const dataset: Dataset = {
    generatedAt: Math.floor(Date.now() / 1000),
    span: SPAN_LABELS[SPAN] ?? String(SPAN),
    fuels: FUELS.map(({ key, label, unit }) => ({ key, label, unit })),
    brands: Object.fromEntries(Object.entries(BRANDS)),
    prefectures: PREFECTURES.map(({ code, name }) => ({ code, name })),
    stations,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await Bun.write(OUT_FILE, JSON.stringify(dataset));

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  const size = (Bun.file(OUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`\n完了: ${stations.length} 店舗 / ${elapsed}s / ${size}MB → ${OUT_FILE}`);
}

await main();
