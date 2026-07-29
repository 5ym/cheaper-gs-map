import type { FuelKey, PriceTypeKey } from "../shared/types.ts";

export const ORIGIN = "https://gogo.gs";

/** 各都道府県で何位まで取るか */
export const TOP_N = Number(process.env.TOP_N ?? 10);

/**
 * 価格の対象期間 (gogo.gs の span パラメータ)
 * 1=1ヶ月以内 / 2=14日以内 / 3=7日以内 / 4=4日以内 / 5=1日以内
 */
export const SPAN = Number(process.env.SPAN ?? 2);
export const SPAN_LABELS: Record<number, string> = {
  1: "1ヶ月以内",
  2: "14日以内",
  3: "7日以内",
  4: "4日以内",
  5: "1日以内",
};

/** gogo.gs の price_mode に対応する油種 */
export const FUELS: { key: FuelKey; mode: number; label: string; unit: string }[] = [
  { key: "regular", mode: 0, label: "レギュラー", unit: "円/L" },
  { key: "highoctane", mode: 1, label: "ハイオク", unit: "円/L" },
  { key: "diesel", mode: 2, label: "軽油", unit: "円/L" },
  { key: "kerosene", mode: 3, label: "灯油", unit: "円/18L" },
];

/** ランキングは会員価格と現金価格の両方を含めて取得し、行のバッジで判別する */
export const PRICE_TYPES: { key: PriceTypeKey; label: string }[] = [
  { key: "normal", label: "現金" },
  { key: "member", label: "会員" },
];

/** マーカーアイコン maker_{n}_48x48.png の n → ブランド名 */
export const BRANDS: Record<number, string> = {
  3: "ENEOS",
  4: "KYGNUS",
  6: "コスモ石油",
  8: "apollostation",
  11: "SOLATO",
  12: "JA-SS",
  14: "carenex",
  15: "三菱商事エネルギー",
  99: "独自・その他",
};

/**
 * 都道府県コード → 名前と、座標解決 API を叩くための中心座標・半径 (km)。
 * 半径は県全域が収まるよう粗めに取ってあり、密集地は自動で分割される。
 */
export interface Prefecture {
  code: number;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export const PREFECTURES: Prefecture[] = [
  { code: 1, name: "北海道", lat: 43.3, lon: 142.5, radiusKm: 380 },
  { code: 2, name: "青森県", lat: 40.75, lon: 140.7, radiusKm: 110 },
  { code: 3, name: "岩手県", lat: 39.6, lon: 141.3, radiusKm: 110 },
  { code: 4, name: "宮城県", lat: 38.4, lon: 140.9, radiusKm: 90 },
  { code: 5, name: "秋田県", lat: 39.75, lon: 140.4, radiusKm: 110 },
  { code: 6, name: "山形県", lat: 38.5, lon: 140.2, radiusKm: 90 },
  { code: 7, name: "福島県", lat: 37.4, lon: 140.3, radiusKm: 100 },
  { code: 8, name: "茨城県", lat: 36.3, lon: 140.3, radiusKm: 90 },
  { code: 9, name: "栃木県", lat: 36.7, lon: 139.8, radiusKm: 80 },
  { code: 10, name: "群馬県", lat: 36.5, lon: 138.95, radiusKm: 80 },
  { code: 11, name: "埼玉県", lat: 36.0, lon: 139.4, radiusKm: 80 },
  { code: 12, name: "千葉県", lat: 35.5, lon: 140.2, radiusKm: 90 },
  { code: 13, name: "東京都", lat: 35.7, lon: 139.4, radiusKm: 80 },
  { code: 14, name: "神奈川県", lat: 35.4, lon: 139.4, radiusKm: 60 },
  { code: 15, name: "新潟県", lat: 37.5, lon: 139.0, radiusKm: 140 },
  { code: 16, name: "富山県", lat: 36.65, lon: 137.2, radiusKm: 60 },
  { code: 17, name: "石川県", lat: 36.6, lon: 136.75, radiusKm: 90 },
  { code: 18, name: "福井県", lat: 35.85, lon: 136.3, radiusKm: 70 },
  { code: 19, name: "山梨県", lat: 35.6, lon: 138.6, radiusKm: 60 },
  { code: 20, name: "長野県", lat: 36.2, lon: 138.1, radiusKm: 120 },
  { code: 21, name: "岐阜県", lat: 35.8, lon: 137.0, radiusKm: 100 },
  { code: 22, name: "静岡県", lat: 35.0, lon: 138.4, radiusKm: 100 },
  { code: 23, name: "愛知県", lat: 35.0, lon: 137.1, radiusKm: 80 },
  { code: 24, name: "三重県", lat: 34.5, lon: 136.4, radiusKm: 100 },
  { code: 25, name: "滋賀県", lat: 35.2, lon: 136.1, radiusKm: 60 },
  { code: 26, name: "京都府", lat: 35.2, lon: 135.6, radiusKm: 80 },
  { code: 27, name: "大阪府", lat: 34.6, lon: 135.5, radiusKm: 55 },
  { code: 28, name: "兵庫県", lat: 35.0, lon: 134.9, radiusKm: 100 },
  { code: 29, name: "奈良県", lat: 34.3, lon: 135.9, radiusKm: 70 },
  { code: 30, name: "和歌山県", lat: 33.9, lon: 135.5, radiusKm: 80 },
  { code: 31, name: "鳥取県", lat: 35.4, lon: 133.9, radiusKm: 70 },
  { code: 32, name: "島根県", lat: 35.0, lon: 132.7, radiusKm: 110 },
  { code: 33, name: "岡山県", lat: 34.8, lon: 133.8, radiusKm: 70 },
  { code: 34, name: "広島県", lat: 34.5, lon: 132.8, radiusKm: 80 },
  { code: 35, name: "山口県", lat: 34.2, lon: 131.5, radiusKm: 80 },
  { code: 36, name: "徳島県", lat: 33.9, lon: 134.3, radiusKm: 60 },
  { code: 37, name: "香川県", lat: 34.2, lon: 134.0, radiusKm: 50 },
  { code: 38, name: "愛媛県", lat: 33.7, lon: 132.9, radiusKm: 90 },
  { code: 39, name: "高知県", lat: 33.5, lon: 133.4, radiusKm: 90 },
  { code: 40, name: "福岡県", lat: 33.5, lon: 130.6, radiusKm: 80 },
  { code: 41, name: "佐賀県", lat: 33.3, lon: 130.2, radiusKm: 55 },
  { code: 42, name: "長崎県", lat: 33.0, lon: 129.7, radiusKm: 120 },
  { code: 43, name: "熊本県", lat: 32.7, lon: 130.8, radiusKm: 90 },
  { code: 44, name: "大分県", lat: 33.2, lon: 131.5, radiusKm: 70 },
  { code: 45, name: "宮崎県", lat: 32.2, lon: 131.3, radiusKm: 90 },
  { code: 46, name: "鹿児島県", lat: 31.6, lon: 130.6, radiusKm: 200 },
  { code: 47, name: "沖縄県", lat: 26.0, lon: 127.0, radiusKm: 500 },
];
