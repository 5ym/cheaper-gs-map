/** スクレイパとフロントエンドで共有する型定義 */

export type FuelKey = "regular" | "highoctane" | "diesel" | "kerosene";
export type PriceTypeKey = "normal" | "member";

/** 1 油種 1 価格種別ぶんの価格情報 */
export interface PriceInfo {
  /** 円/L (灯油は 円/18L のことがある。gogo.gs の表示そのまま) */
  price: number;
  /** 都道府県内順位 */
  rank: number;
  /** 更新日時 (UNIX 秒, JST 表示用) */
  updated: number;
  /** 「[給油時/店内表示]」などの表示条件タグ */
  tag?: string;
  /** 投稿者コメント */
  memo?: string;
  /** 投稿者 ID */
  user?: string;
}

export type PriceTable = Partial<Record<FuelKey, Partial<Record<PriceTypeKey, PriceInfo>>>>;

export interface Station {
  /** gogo.gs の店舗 ID (ss_id) */
  id: string;
  name: string;
  address: string;
  /** 都道府県コード (1-47) */
  pref: number;
  /** ブランドコード。BRANDS のキー */
  brand: number;
  lat: number;
  lon: number;
  prices: PriceTable;
}

export interface Dataset {
  /** 生成時刻 (UNIX 秒) */
  generatedAt: number;
  /** 各都道府県で何位まで収集したか */
  topN: number;
  /** 価格の対象期間 (gogo.gs の span パラメータの説明) */
  span: string;
  fuels: { key: FuelKey; label: string; unit: string }[];
  brands: Record<string, string>;
  prefectures: { code: number; name: string }[];
  stations: Station[];
}
