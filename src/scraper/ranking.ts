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

/** 1 件ぶんの収集途中の状態。テキストは分割して届くので継ぎ足していく */
interface Draft {
  href: string;
  icon: string;
  member: boolean;
  rank: string;
  price: string;
  name: string;
  address: string;
  date: string;
  user: string;
  note: string;
}

const blank = (): Draft => ({
  href: "",
  icon: "",
  member: false,
  rank: "",
  price: "",
  name: "",
  address: "",
  date: "",
  user: "",
  note: "",
});

/** ランキング 1 件を包む要素。各項目はここからの子孫として拾う */
const ENTRY = "div.bg-white.border-line2";

/**
 * ランキングページを解析する。
 *
 * Bun 内蔵の HTMLRewriter (ストリーミング) を使うので DOM ライブラリは要らない。
 * 木を持たない分だけ「兄弟をたどる」「親に上る」ができないため、
 * 住所などは h1 の隣ではなく `div.flex-1 > p.text-txt2` のように位置で指定している。
 */
export function parseRanking(html: string): RankingRow[] {
  const rows: RankingRow[] = [];
  let cur: Draft | null = null;

  const flush = (): void => {
    const d = cur;
    cur = null;
    if (!d) return;

    const id = d.href.replace("/shop/", "").trim();
    const price = Number(collapse(d.price));
    const rank = Number(collapse(d.rank));
    if (!id || !Number.isFinite(price) || !Number.isFinite(rank)) return;

    // 系列アイコン (maker_N) と独自ブランドのロゴ (ext_maker_N) は別系統の番号。
    // ext_maker を素朴に拾うと ext_maker_3 が ENEOS になってしまうので区別する。
    // 独自ブランドは gogo.gs の系列区分でも「独自・その他」なので 99 に寄せる
    const icon = /(ext_)?maker_(\d+)_/.exec(d.icon);

    // 「[給油時/店内表示] プリカ￥20,000」のような表示条件タグ + コメント
    const note = collapse(d.note);
    const noteMatch = /^\[([^\]]*)\]\s*(.*)$/.exec(note);

    rows.push({
      id,
      name: collapse(d.name),
      address: collapse(d.address),
      brand: icon && !icon[1] ? Number(icon[2]) : 99,
      rank,
      price,
      // 会員価格の行には赤いバッジが付く
      priceType: d.member ? "member" : "normal",
      updated: parseUpdated(d.date),
      tag: noteMatch ? noteMatch[1] : undefined,
      memo: (noteMatch ? noteMatch[2] : note) || undefined,
      user: collapse(d.user) || undefined,
    });
  };

  const collect = (key: keyof Draft) => ({
    text(chunk: { text: string }) {
      if (cur) (cur[key] as string) += chunk.text;
    },
  });

  new HTMLRewriter()
    .on(ENTRY, {
      element(el) {
        flush(); // 閉じタグを取りこぼした場合の保険
        cur = blank();
        el.onEndTag(() => flush());
      },
    })
    .on(`${ENTRY} p.number.w-8`, collect("rank"))
    .on(`${ENTRY} div.flex-col > p.number`, collect("price"))
    .on(`${ENTRY} .bg-danger`, {
      element() {
        if (cur) cur.member = true;
      },
    })
    .on(`${ENTRY} figure img`, {
      element(el) {
        if (cur && !cur.icon) cur.icon = el.getAttribute("src") ?? "";
      },
    })
    .on(`${ENTRY} h1 a`, {
      element(el) {
        if (cur && !cur.href) cur.href = el.getAttribute("href") ?? "";
      },
      text(chunk) {
        if (cur) cur.name += chunk.text;
      },
    })
    .on(`${ENTRY} div.flex-1 > p.text-txt2`, collect("address"))
    .on(`${ENTRY} span.text-xs`, collect("date"))
    .on(`${ENTRY} a[href^="/user/"]`, collect("user"))
    .on(`${ENTRY} div.flex-wrap`, collect("note"))
    .transform(html);

  flush();
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
