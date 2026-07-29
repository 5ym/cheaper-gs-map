import { mkdir } from "node:fs/promises";
import { BRANDS, FUELS, PREFECTURES, SPAN, SPAN_LABELS, TOP_N } from "./config.ts";
import { resolveCoords } from "./coords.ts";
import { fetchRanking, type RankingRow } from "./ranking.ts";
import type { Dataset, PriceTable, Station } from "../shared/types.ts";

const OUT_DIR = new URL("../../data/", import.meta.url).pathname;
const OUT_FILE = `${OUT_DIR}stations.json`;

interface Draft extends Omit<Station, "lat" | "lon"> {
  lat?: number;
  lon?: number;
}

function addPrice(prices: PriceTable, fuel: string, row: RankingRow): void {
  const key = fuel as keyof PriceTable;
  const slot = (prices[key] ??= {});
  const current = slot[row.priceType];
  // 同一店舗が複数行に出た場合は上位 (安い) 方を残す
  if (current && current.rank <= row.rank) return;
  slot[row.priceType] = {
    price: row.price,
    rank: row.rank,
    updated: row.updated,
    ...(row.tag ? { tag: row.tag } : {}),
    ...(row.memo ? { memo: row.memo } : {}),
    ...(row.user ? { user: row.user } : {}),
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  const stations: Station[] = [];
  let missingCoords = 0;

  // PREF_CODES=13,14 のように指定すると一部の県だけ取得できる (動作確認用)
  const only = process.env.PREF_CODES?.split(",").map(Number);
  const targets = only ? PREFECTURES.filter((p) => only.includes(p.code)) : PREFECTURES;

  for (const pref of targets) {
    const drafts = new Map<string, Draft>();

    for (const fuel of FUELS) {
      let rows: RankingRow[];
      try {
        rows = await fetchRanking(pref.code, fuel.mode, TOP_N);
      } catch (e) {
        console.warn(`  ! ${pref.name} ${fuel.label} の取得に失敗: ${(e as Error).message}`);
        continue;
      }
      for (const row of rows) {
        const draft = drafts.get(row.id) ?? {
          id: row.id,
          name: row.name,
          address: row.address,
          pref: pref.code,
          brand: row.brand,
          prices: {},
        };
        addPrice(draft.prices, fuel.key, row);
        drafts.set(row.id, draft);
      }
    }

    const coords = await resolveCoords(pref, new Set(drafts.keys()));
    let ok = 0;
    for (const draft of drafts.values()) {
      const c = coords.get(draft.id);
      if (!c) {
        missingCoords++;
        console.warn(`  ! 座標が見つからない: ${draft.name} (${draft.id})`);
        continue;
      }
      stations.push({ ...draft, lat: c.lat, lon: c.lon });
      ok++;
    }
    console.log(`${String(pref.code).padStart(2, "0")} ${pref.name}: ${ok} 店舗`);
  }

  const dataset: Dataset = {
    generatedAt: Math.floor(Date.now() / 1000),
    topN: TOP_N,
    span: SPAN_LABELS[SPAN] ?? String(SPAN),
    fuels: FUELS.map(({ key, label, unit }) => ({ key, label, unit })),
    brands: Object.fromEntries(Object.entries(BRANDS)),
    prefectures: PREFECTURES.map(({ code, name }) => ({ code, name })),
    stations: stations.sort((a, b) => a.pref - b.pref || a.id.localeCompare(b.id)),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await Bun.write(OUT_FILE, JSON.stringify(dataset));

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `\n完了: ${stations.length} 店舗 / 座標未解決 ${missingCoords} 件 / ${elapsed}s → ${OUT_FILE}`,
  );
}

await main();
