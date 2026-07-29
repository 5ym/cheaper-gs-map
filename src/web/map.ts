import L from "leaflet";

const GSI_ATTR =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const ESRI_ATTR = "Esri, Maxar, Earthstar Geographics";

export function createMap(container: HTMLElement): L.Map {
  // 衛星写真をデフォルトに。国土地理院のシームレス空中写真は日本国内が高精細
  const gsiPhoto = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    { maxZoom: 19, maxNativeZoom: 18, attribution: `衛星写真: ${GSI_ATTR}` },
  );
  const esriPhoto = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, maxNativeZoom: 19, attribution: `衛星写真: ${ESRI_ATTR}` },
  );
  const gsiPale = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    maxZoom: 19,
    maxNativeZoom: 18,
    attribution: `地図: ${GSI_ATTR}`,
  });

  // 衛星写真だけだと地名が分からないのでラベルを重ねられるようにする
  const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, maxNativeZoom: 19, attribution: ESRI_ATTR, opacity: 0.9 },
  );

  const map = L.map(container, {
    center: [36.5, 138.2],
    zoom: 5,
    layers: [gsiPhoto, labels],
    zoomControl: false,
    worldCopyJump: true,
    preferCanvas: true,
  });

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control
    .layers(
      { "衛星写真 (地理院)": gsiPhoto, "衛星写真 (Esri)": esriPhoto, "淡色地図": gsiPale },
      { "地名ラベル": labels },
      { position: "bottomright", collapsed: true },
    )
    .addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>',
  );
  map.attributionControl.addAttribution(
    '価格: <a href="https://gogo.gs/" target="_blank" rel="noopener">gogo.gs</a>',
  );

  return map;
}
