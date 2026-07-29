import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type ControlPosition,
  type IControl,
} from "maplibre-gl";
import { BASES, LABELS_LAYER, buildStyle } from "./style.ts";
import { escapeHtml } from "./format.ts";

/** 背景の切替（MapLibre には標準のレイヤ切替が無いので自前） */
class LayerControl implements IControl {
  private root!: HTMLElement;

  onAdd(map: MapLibreMap): HTMLElement {
    this.root = document.createElement("div");
    this.root.className = "maplibregl-ctrl maplibregl-ctrl-group layers";
    this.root.innerHTML = `
      <button type="button" class="layers__toggle" aria-expanded="false" aria-label="背景を切り替え">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path d="M12 3 2 8l10 5 10-5-10-5Z" fill="currentColor" opacity=".9"/>
          <path d="M2 12.5 12 17.5l10-5M2 16.5 12 21.5l10-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="layers__menu" hidden>
        ${BASES.map(
          (base, i) => `
          <label class="layers__item">
            <input type="radio" name="base" value="${base.id}"${i === 0 ? " checked" : ""}>
            <span>${escapeHtml(base.label)}</span>
          </label>`,
        ).join("")}
        <hr class="layers__sep">
        <label class="layers__item">
          <input type="checkbox" name="labels" checked>
          <span>地名ラベル</span>
        </label>
      </div>`;

    const menu = this.root.querySelector<HTMLElement>(".layers__menu")!;
    const toggle = this.root.querySelector<HTMLButtonElement>(".layers__toggle")!;
    toggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
    });

    this.root.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === "base") {
        for (const base of BASES) {
          map.setLayoutProperty(base.id, "visibility", base.id === input.value ? "visible" : "none");
        }
      } else if (input.name === "labels") {
        map.setLayoutProperty(LABELS_LAYER, "visibility", input.checked ? "visible" : "none");
      }
    });

    return this.root;
  }

  onRemove(): void {
    this.root.remove();
  }
}

export interface MapBundle {
  map: MapLibreMap;
  geolocate: GeolocateControl;
  /** スタイルとソースが使えるようになったら解決する */
  ready: Promise<void>;
}

export function createMap(container: HTMLElement): MapBundle {
  const map = new MapLibreMap({
    container,
    style: buildStyle(),
    center: [138.2, 36.5],
    zoom: 4.2,
    attributionControl: false,
    // 傾き・回転はスタンドを探すのに要らないので切る
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate?.disableRotation();

  // load は一度しか発火しないので、生成直後のここで待ち受けを張っておく
  const ready = new Promise<void>((resolve) => map.once("load", () => resolve()));

  // 失敗を黙って握りつぶさない (タイル 404、グリフ取得失敗など)
  map.on("error", (e) => console.error("[map]", e.error?.message ?? e));

  const geolocate = new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showAccuracyCircle: true,
  });

  map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
  // bottom-right は後から足したものが上に積まれるので、出典 → 背景切替 → 現在地 → ズームの順で足す
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution:
        '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
    }),
    "bottom-right",
  );
  map.addControl(new LayerControl() as IControl, "bottom-right" as ControlPosition);
  map.addControl(geolocate, "bottom-right");
  map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

  return { map, geolocate, ready };
}

/** WebGL2 が使えるか。使えないときは白紙にせず理由を出す */
export function webglSupported(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
