/** スクレイパとフロントエンドで共有する型定義 */

export type FuelKey = "regular" | "highoctane" | "diesel" | "kerosene";
export type PriceTypeKey = "normal" | "member";

/** 油種 → 価格種別 → 価格 (円/L、灯油は 円/18L) */
export type PriceTable = Partial<Record<FuelKey, Partial<Record<PriceTypeKey, number>>>>;

export interface Station {
  /** gogo.gs の店舗 ID (ss_id)。先頭 2 桁が都道府県コード */
  id: string;
  name: string;
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
  /** 価格の対象期間 (gogo.gs の span パラメータの説明) */
  span: string;
  fuels: { key: FuelKey; label: string; unit: string }[];
  brands: Record<string, string>;
  prefectures: { code: number; name: string }[];
  stations: Station[];
}
