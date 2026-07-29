import { ORIGIN, type Prefecture } from "./config.ts";
import { fetchJson } from "./http.ts";

/** gogo.gs のマップが使う店舗検索 API のレスポンス */
interface AroundResponse {
  status: string;
  result: {
    shops: { ss_id: string; lat: number; lon: number; marker_view: string }[];
    average: number | null;
  };
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** 1 リクエストで返る最大件数。これに達したら取りこぼしがあるとみなして分割する */
const LIMIT = 5000;
const MAX_DEPTH = 5;

async function fetchAround(lat: number, lon: number, radiusKm: number) {
  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    zoom: "10",
    limit: String(LIMIT),
    dist: String(Math.max(1, Math.round(radiusKm))),
    dist_unit: "km",
  });
  const res = await fetchJson<AroundResponse>(`${ORIGIN}/api/shop/around?${params}`);
  return res.result?.shops ?? [];
}

/**
 * 中心座標と半径で店舗座標を集める。上限に達した場合は 4 分割して取りこぼしを防ぐ。
 * 必要な店舗 ID がすべて見つかった時点で打ち切る。
 */
async function sweep(
  lat: number,
  lon: number,
  radiusKm: number,
  out: Map<string, LatLon>,
  needed: Set<string>,
  depth = 0,
): Promise<void> {
  const shops = await fetchAround(lat, lon, radiusKm);
  for (const s of shops) {
    if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      out.set(s.ss_id, { lat: s.lat, lon: s.lon });
    }
  }
  if (needed.size > 0 && [...needed].every((id) => out.has(id))) return;
  // 上限ちょうどなら圏内に未取得の店舗が残っている
  if (shops.length < LIMIT || depth >= MAX_DEPTH || radiusKm < 3) return;

  const offset = radiusKm / 2;
  const dLat = offset / 111;
  const dLon = offset / (111 * Math.cos((lat * Math.PI) / 180));
  for (const [sy, sx] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    await sweep(lat + sy * dLat, lon + sx * dLon, radiusKm * 0.75, out, needed, depth + 1);
  }
}

/**
 * 都道府県ごとに座標解決を行う。
 * ランキングに載った店舗 ID (needed) が全部埋まれば早期終了する。
 */
export async function resolveCoords(
  pref: Prefecture,
  needed: Set<string>,
): Promise<Map<string, LatLon>> {
  const found = new Map<string, LatLon>();
  if (needed.size === 0) return found;

  await sweep(pref.lat, pref.lon, pref.radiusKm, found, needed);

  // 県の中心から遠い離島などは半径を広げてもう一度だけ試す
  if ([...needed].some((id) => !found.has(id))) {
    await sweep(pref.lat, pref.lon, pref.radiusKm * 2, found, needed);
  }
  return found;
}
