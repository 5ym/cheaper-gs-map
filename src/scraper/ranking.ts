import * as cheerio from "cheerio";
import { ORIGIN, SPAN } from "./config.ts";
import { fetchHtml } from "./http.ts";
import type { PriceTypeKey } from "../shared/types.ts";

export interface RankingRow {
  id: string;
  name: string;
  address: string;
  brand: number;
  rank: number;
  price: number;
  priceType: PriceTypeKey;
  updated: number;
  tag?: string;
  memo?: string;
  user?: string;
}

/** 「2026/7/25 (土) 9時」→ UNIX 秒 (JST として解釈) */
function parseUpdated(text: string): number {
  const m = /(\d{4})\/(\d{1,2})\/(\d{1,2}).*?(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/.exec(text);
  if (!m) return 0;
  const [, y, mo, d, h, mi] = m;
  const iso = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}T${h!.padStart(2, "0")}:${(mi ?? "0").padStart(2, "0")}:00+09:00`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseRanking(html: string): RankingRow[] {
  const $ = cheerio.load(html);
  const rows: RankingRow[] = [];

  $("div.bg-white.border-line2").each((_, el) => {
    const entry = $(el);
    const link = entry.find('h1 a[href^="/shop/"]').first();
    if (link.length === 0) return;

    const id = link.attr("href")!.replace("/shop/", "").trim();
    const price = Number(entry.find("div.flex-col.items-center > p.number").first().text().trim());
    const rank = Number(entry.find("p.number.w-8").first().text().trim());
    if (!id || !Number.isFinite(price) || !Number.isFinite(rank)) return;

    // 会員価格の行には赤いバッジが付く
    const priceType: PriceTypeKey = entry.find(".bg-danger").length > 0 ? "member" : "normal";

    const iconSrc = entry.find("figure img").first().attr("src") ?? "";
    const brand = Number(/maker_(\d+)_/.exec(iconSrc)?.[1] ?? 99);

    const address = collapse(link.closest("h1").parent().find("p.text-txt2").first().text());
    const updated = parseUpdated(entry.find("span.text-xs").first().text());
    const user = entry.find('a[href^="/user/"]').first().text().trim() || undefined;

    // 「[給油時/店内表示] プリカ￥20,000」のような表示条件タグ + コメント
    const noteText = collapse(entry.find("div.flex-wrap").first().text());
    const noteMatch = /^\[([^\]]*)\]\s*(.*)$/.exec(noteText);
    const tag = noteMatch ? noteMatch[1] : undefined;
    const memo = (noteMatch ? noteMatch[2] : noteText) || undefined;

    rows.push({
      id,
      name: collapse(link.text()),
      address,
      brand: Number.isFinite(brand) ? brand : 99,
      rank,
      price,
      priceType,
      updated,
      tag,
      memo,
      user,
    });
  });

  return rows;
}

export function rankingUrl(pref: number, mode: number, page = 1): string {
  const params = new URLSearchParams({
    "members[0]": "0",
    "members[1]": "1",
    submit: "1",
    "prefs[0]": String(pref),
    span: String(SPAN),
    mode: String(mode),
  });
  if (page > 1) params.set("page", String(page));
  return `${ORIGIN}/ranking/${pref}?${params}`;
}

/** 指定都道府県・油種のランキングを topN 位まで取得する */
export async function fetchRanking(pref: number, mode: number, topN: number): Promise<RankingRow[]> {
  const rows: RankingRow[] = [];
  for (let page = 1; page <= 10; page++) {
    const parsed = parseRanking(await fetchHtml(rankingUrl(pref, mode, page)));
    if (parsed.length === 0) break;
    rows.push(...parsed.filter((r) => r.rank <= topN));
    // 1 ページ (20 件) で topN に届くのが普通。届かなければ次ページへ
    if (parsed.some((r) => r.rank >= topN)) break;
  }
  return rows.sort((a, b) => a.rank - b.rank);
}
