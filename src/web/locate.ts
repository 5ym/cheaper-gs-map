import L from "leaflet";

export interface LocateHandlers {
  /** 現在地が更新された / 解除された */
  onChange: (latlng: L.LatLng | null) => void;
  onError: (message: string) => void;
}

const ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 1.5v3.6M12 18.9v3.6M1.5 12h3.6M18.9 12h3.6"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * 現在地ボタンを地図に追加する。
 * 押すたびに追従の開始 / 停止を切り替える。
 */
export function setupLocate(map: L.Map, handlers: LocateHandlers): void {
  let watching = false;
  let marker: L.Marker | null = null;
  let accuracy: L.Circle | null = null;
  let centered = false;
  let button: HTMLAnchorElement;

  const clear = (): void => {
    marker?.remove();
    accuracy?.remove();
    marker = null;
    accuracy = null;
  };

  const setBusy = (busy: boolean): void => {
    button.classList.toggle("locate__btn--busy", busy);
  };

  const stop = (): void => {
    watching = false;
    map.stopLocate();
    clear();
    setBusy(false);
    button.classList.remove("locate__btn--active");
    button.setAttribute("aria-pressed", "false");
    handlers.onChange(null);
  };

  const start = (): void => {
    watching = true;
    centered = false;
    setBusy(true);
    button.setAttribute("aria-pressed", "true");
    map.locate({ watch: true, enableHighAccuracy: true, setView: false });
  };

  map.on("locationfound", (e: L.LocationEvent) => {
    if (!watching) return;
    setBusy(false);
    button.classList.add("locate__btn--active");

    if (!marker) {
      marker = L.marker(e.latlng, {
        icon: L.divIcon({
          className: "user-dot-wrap",
          html: '<div class="user-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      accuracy = L.circle(e.latlng, {
        radius: e.accuracy,
        color: "#38bdf8",
        weight: 1,
        fillColor: "#38bdf8",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    } else {
      marker.setLatLng(e.latlng);
      accuracy?.setLatLng(e.latlng).setRadius(e.accuracy);
    }

    // 初回だけ画面を移動させる。以降は地図操作の邪魔をしない
    if (!centered) {
      centered = true;
      map.setView(e.latlng, Math.max(map.getZoom(), 14));
    }
    handlers.onChange(e.latlng);
  });

  map.on("locationerror", (e: L.ErrorEvent) => {
    if (!watching) return;
    // code 1 = PERMISSION_DENIED
    const denied = (e as L.ErrorEvent & { code?: number }).code === 1;
    handlers.onError(
      denied ? "位置情報の利用が許可されていません" : `現在地を取得できません (${e.message})`,
    );
    stop();
  });

  const Control = L.Control.extend({
    options: { position: "bottomright" as L.ControlPosition },
    onAdd(): HTMLElement {
      const container = L.DomUtil.create("div", "leaflet-bar locate");
      button = L.DomUtil.create("a", "locate__btn", container) as HTMLAnchorElement;
      button.href = "#";
      button.title = "現在地を表示";
      button.setAttribute("role", "button");
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = ICON;
      L.DomEvent.on(button, "click", (ev) => {
        L.DomEvent.stop(ev);
        if (watching) stop();
        else start();
      });
      L.DomEvent.disableClickPropagation(container);
      return container;
    },
  });

  if (!navigator.geolocation) return;
  new Control().addTo(map);
}

/** 2 点間の距離 (km)。ヒュベニではなく簡易なハバサイン */
export function distanceKm(a: L.LatLngLiteral, b: L.LatLngLiteral): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`;
}
