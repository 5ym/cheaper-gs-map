/** 価格帯を表す 5 段階の色。安いほど緑、高いほど赤。数字はマーカーに常に表示されるので色は補助 */
export const PRICE_COLORS = ["#0b8a4b", "#5aa524", "#e0a106", "#e2681a", "#c62828"] as const;
export const PRICE_LABELS = ["とても安い", "安い", "ふつう", "やや高い", "高い"] as const;

/** 価格の順位 (0 = 最安) を 0..4 の色段階に割り当てる */
export function priceStep(price: number, sorted: number[]): number {
  if (sorted.length <= 1) return 0;
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  if (hi === lo) return 0;
  const ratio = (price - lo) / (hi - lo);
  return Math.min(PRICE_COLORS.length - 1, Math.floor(ratio * PRICE_COLORS.length));
}

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  weekday: "short",
});

export function formatUpdated(unixSec: number): string {
  if (!unixSec) return "不明";
  return dateFmt.format(new Date(unixSec * 1000));
}

const stampFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatStamp(unixSec: number): string {
  return stampFmt.format(new Date(unixSec * 1000));
}

export function relativeDays(unixSec: number): number {
  return (Date.now() / 1000 - unixSec) / 86400;
}

/** 2 点間の距離 (km)。簡易なハバサイン */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
