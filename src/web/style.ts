import type { FeatureCollection } from "geojson";
import type { StyleSpecification } from "maplibre-gl";

/**
 * 地図のスタイル定義。
 * maplibre-gl の実行時コードに依存しないので、ブラウザ無しでも検証できる。
 */

const GSI_ATTR =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const ESRI_ATTR = "Esri, Maxar, Earthstar Geographics";

export const STATIONS_SOURCE = "stations";
export const PIN_LAYER = "pins";
export const LABELS_LAYER = "labels";

/** 背景に使えるラスタタイル。先頭が既定 */
export const BASES = [
  {
    id: "esri-photo",
    label: "衛星写真 (Esri)",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    maxzoom: 19,
    attribution: `衛星写真: ${ESRI_ATTR}`,
  },
  {
    id: "gsi-photo",
    label: "衛星写真 (地理院)",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
    maxzoom: 18,
    attribution: `衛星写真: ${GSI_ATTR}`,
  },
  {
    id: "gsi-pale",
    label: "淡色地図",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
    maxzoom: 18,
    attribution: `地図: ${GSI_ATTR}`,
  },
];

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function buildStyle(): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    // 衛星写真だけでは地名が分からないので、ラベルだけの層を重ねる
    [LABELS_LAYER]: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: `地名: ${ESRI_ATTR}`,
    },
    [STATIONS_SOURCE]: {
      type: "geojson",
      data: EMPTY,
      attribution: '価格: <a href="https://gogo.gs/" target="_blank" rel="noopener">gogo.gs</a>',
    },
  };

  for (const base of BASES) {
    sources[base.id] = {
      type: "raster",
      tiles: base.tiles,
      tileSize: 256,
      maxzoom: base.maxzoom,
      attribution: base.attribution,
    };
  }

  return {
    version: 8,
    // 価格の文字はピン画像に焼き込んでいるのでグリフサーバは要らない
    sources,
    layers: [
      ...BASES.map((base, i) => ({
        id: base.id,
        type: "raster" as const,
        source: base.id,
        layout: { visibility: (i === 0 ? "visible" : "none") as "visible" | "none" },
      })),
      {
        id: LABELS_LAYER,
        type: "raster" as const,
        source: LABELS_LAYER,
        paint: { "raster-opacity": 0.9 },
      },
      {
        id: PIN_LAYER,
        type: "symbol" as const,
        source: STATIONS_SOURCE,
        layout: {
          "icon-image": ["get", "img"] as unknown as string,
          "icon-anchor": "bottom" as const,
          "icon-allow-overlap": false,
          // 安い順に配置されるので、重なったときは安い方が残る
          "symbol-sort-key": ["get", "price"] as unknown as number,
        },
      },
    ],
  };
}
