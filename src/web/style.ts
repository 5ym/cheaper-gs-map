import type { FeatureCollection } from "geojson";
import type { StyleSpecification } from "maplibre-gl";

/**
 * 地図のスタイル定義。
 * maplibre-gl の実行時コードに依存しないので、ブラウザ無しでも検証できる。
 */

const GSI_ATTR =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const ESRI_ATTR = "Esri, Maxar, Earthstar Geographics";
/** 価格の数字に使うフォント。ラスタタイルには文字が焼き込まれているので、これだけ */
const GLYPHS = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";

export const STATIONS_SOURCE = "stations";
export const DOT_LAYER = "station-dots";
export const BEST_LAYER = "station-best";
export const LABEL_LAYER = "station-labels";
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

  // 式を多用するので、型は個々に付けずスタイル検証 (bun run validate:style) で担保する
  const layers = [
    ...BASES.map((base, i) => ({
      id: base.id,
      type: "raster",
      source: base.id,
      layout: { visibility: i === 0 ? "visible" : "none" },
    })),
    { id: LABELS_LAYER, type: "raster", source: LABELS_LAYER, paint: { "raster-opacity": 0.9 } },
    {
      // 最安店を囲む金色のリング。点より先に描いて外側に見せる
      id: BEST_LAYER,
      type: "circle",
      source: STATIONS_SOURCE,
      filter: ["==", ["get", "best"], true],
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 8, 10, 11, 16, 15],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#fde047",
      },
    },
    {
      id: DOT_LAYER,
      type: "circle",
      source: STATIONS_SOURCE,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6, 16, 9],
        "circle-stroke-width": 2,
        // 会員価格は赤い縁で区別する
        "circle-stroke-color": [
          "case",
          ["get", "member"],
          "#e11d48",
          "rgba(255,255,255,0.92)",
        ],
      },
    },
    {
      id: LABEL_LAYER,
      type: "symbol",
      source: STATIONS_SOURCE,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 12, 13],
        "text-anchor": "bottom",
        "text-offset": [0, -0.85],
        "text-allow-overlap": false,
        // 重なったときは安い方を残す
        "symbol-sort-key": ["get", "price"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": ["get", "color"],
        "text-halo-width": 2,
      },
    },
  ] as unknown as StyleSpecification["layers"];

  return { version: 8, glyphs: GLYPHS, sources, layers };
}
