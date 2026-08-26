import { BRANDS, ORIGIN, PREFECTURES, SPAN, FUELS, PRICE_TYPES, type Prefecture } from "./config.ts";
import { fetchJson } from "./http.ts";
import type { FuelKey, PriceTypeKey, Station } from "../shared/types.ts";

/** gogo.gs のマップが使う店舗検索 API のレスポンス */
interface AroundResponse {
  status: string;
  result: {
    shops: { ss_id: string; lat: number; lon: number; marker_view: string }[];
    average: number | null;
  };
}

/** 1 リクエストで返る最大件数。これに達したら取りこぼしがあるとみなして分割する */
const LIMIT = 5000;
const MAX_DEPTH = 5;

interface Marker {
  name: string;
  price: number;
  brand: number;
}

/**
 * ピンの HTML から店名・価格・ブランドを取り出す。
 *
 * 系列は pin_N、独自ブランドは ext_pin_N という別系統の番号で、
 * さらに pin_s2 (コストコ) のような数字でない特殊ピンもある。
 * gogo.gs の系列区分に無いものはすべて「独自・その他」に寄せる。
 */
function parseMarker(html: string): Marker | null {
  const name = /alt="([^"]*)"/.exec(html)?.[1]?.trim();
  const price = Number(/class="number[^"]*">\s*(\d+)\s*</.exec(html)?.[1]);
  if (!name || !Number.isFinite(price)) return null;

  const pin = /\/(ext_)?pin_(\w+?)_\d+x\d+\./.exec(html);
  const code = pin && !pin[1] ? Number(pin[2]) : Number.NaN;
  return { name, price, brand: Number.isFinite(code) && code in BRANDS ? code : 99 };
}

async function fetchAround(
  lat: number,
  lon: number,
  radiusKm: number,
  fuelMode: number,
  memberType: number,
) {
  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    zoom: "10",
    limit: String(LIMIT),
    dist: String(Math.max(1, Math.round(radiusKm))),
    dist_unit: "km",
    price_mode: String(fuelMode),
    // span を渡すと、その期間内に価格が投稿された店舗だけが返る
    span: String(SPAN),
    "member_types[]": String(memberType),
  });
  const res = await fetchJson<AroundResponse>(`${ORIGIN}/api/shop/around?${params}`);
  return res.result?.shops ?? [];
}

/**
 * 中心座標と半径で店舗を集める。上限に達した場合は 4 分割して取りこぼしを防ぐ。
 */
async function sweep(
  lat: number,
  lon: number,
  radiusKm: number,
  fuel: { key: FuelKey; mode: number },
  priceType: { key: PriceTypeKey; member: number },
  out: Map<string, Station>,
  depth = 0,
): Promise<void> {
  const shops = await fetchAround(lat, lon, radiusKm, fuel.mode, priceType.member);

  for (const shop of shops) {
    if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lon)) continue;
    const marker = parseMarker(shop.marker_view);
    if (!marker) continue;

    let station = out.get(shop.ss_id);
    if (!station) {
      const pref = Number(shop.ss_id.slice(0, 2));
      station = {
        id: shop.ss_id,
        name: marker.name,
        pref: pref >= 1 && pref <= 47 ? pref : 0,
        brand: marker.brand,
        // 1e-5 度 ≒ 1m。これ以上の桁は配信するデータを膨らませるだけ
        lat: Number(shop.lat.toFixed(5)),
        lon: Number(shop.lon.toFixed(5)),
        prices: {},
      };
      out.set(shop.ss_id, station);
    }
    // 系列が分かるピンの方を優先する
    if (station.brand === 99 && marker.brand !== 99) station.brand = marker.brand;

    (station.prices[fuel.key] ??= {})[priceType.key] = marker.price;
  }

  // 上限ちょうどなら圏内に未取得の店舗が残っている
  if (shops.length < LIMIT || depth >= MAX_DEPTH || radiusKm < 5) return;

  const offset = radiusKm / 2;
  const dLat = offset / 111;
  const dLon = offset / (111 * Math.cos((lat * Math.PI) / 180));
  for (const [sy, sx] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    await sweep(lat + sy * dLat, lon + sx * dLon, radiusKm * 0.75, fuel, priceType, out, depth + 1);
  }
}

/** 全国のスタンドを油種 × 価格種別ぶん集める */
export async function collectStations(prefectures: Prefecture[] = PREFECTURES): Promise<Station[]> {
  const out = new Map<string, Station>();

  for (const fuel of FUELS) {
    for (const priceType of PRICE_TYPES) {
      const before = out.size;
      let priced = 0;
      for (const pref of prefectures) {
        await sweep(pref.lat, pref.lon, pref.radiusKm, fuel, priceType, out);
      }
      for (const station of out.values()) {
        if (station.prices[fuel.key]?.[priceType.key] !== undefined) priced++;
      }
      console.log(
        `${fuel.label} ${priceType.label}: ${priced} 店舗 (新規 ${out.size - before})`,
      );
    }
  }

  return [...out.values()].sort((a, b) => a.pref - b.pref || a.id.localeCompare(b.id));
}
