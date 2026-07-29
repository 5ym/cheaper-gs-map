import L from "leaflet";
import { createMap } from "./map.ts";
import {
  PRICE_COLORS,
  PRICE_LABELS,
  escapeHtml,
  formatStamp,
  formatUpdated,
  priceStep,
  relativeDays,
} from "./format.ts";
import type { Dataset, FuelKey, PriceInfo, PriceTypeKey, Station } from "../shared/types.ts";

type PriceTypeFilter = "best" | PriceTypeKey;

interface Entry {
  station: Station;
  info: PriceInfo;
  type: PriceTypeKey;
  price: number;
}

interface State {
  fuel: FuelKey;
  priceType: PriceTypeFilter;
  pref: number;
  freshness: number;
  search: string;
  brands: Set<number>;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const map = createMap($("map"));
const markerLayer = L.layerGroup().addTo(map);

let data: Dataset;
let state: State;
const markers = new Map<string, L.Marker>();

/** 店舗から現在の油種・価格種別に合う 1 件を取り出す */
function pickPrice(station: Station, fuel: FuelKey, type: PriceTypeFilter): Entry | null {
  const slot = station.prices[fuel];
  if (!slot) return null;
  const candidates: [PriceTypeKey, PriceInfo][] =
    type === "best"
      ? (Object.entries(slot) as [PriceTypeKey, PriceInfo][])
      : slot[type]
        ? [[type, slot[type]!]]
        : [];
  let best: Entry | null = null;
  for (const [key, info] of candidates) {
    if (!best || info.price < best.price) best = { station, info, type: key, price: info.price };
  }
  return best;
}

function filtered(): Entry[] {
  const q = state.search.trim().toLowerCase();
  const entries: Entry[] = [];
  for (const station of data.stations) {
    if (state.pref && station.pref !== state.pref) continue;
    if (state.brands.size && !state.brands.has(station.brand)) continue;
    if (q && !`${station.name} ${station.address}`.toLowerCase().includes(q)) continue;
    const entry = pickPrice(station, state.fuel, state.priceType);
    if (!entry) continue;
    if (state.freshness && relativeDays(entry.info.updated) > state.freshness) continue;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.price - b.price || a.info.rank - b.info.rank);
}

function popupHtml(station: Station): string {
  const brand = data.brands[String(station.brand)] ?? "その他";
  const rows = data.fuels
    .map((fuel) => {
      const slot = station.prices[fuel.key];
      if (!slot) return "";
      const cells = (["normal", "member"] as const)
        .map((t) => {
          const info = slot[t];
          if (!info) return `<td class="pop__na">-</td>`;
          const cls = t === "member" ? "pop__price pop__price--member" : "pop__price";
          return `<td class="${cls}">${info.price}<small>${fuel.unit.replace("円", "")}</small></td>`;
        })
        .join("");
      const info = slot.member ?? slot.normal!;
      return `<tr><th>${escapeHtml(fuel.label)}</th>${cells}<td class="pop__date">${formatUpdated(info.updated)}</td></tr>`;
    })
    .join("");

  const note = data.fuels
    .map((f) => station.prices[f.key])
    .flatMap((slot) => (slot ? [slot.member, slot.normal] : []))
    .find((i) => i?.memo);

  return `
    <div class="pop">
      <h3 class="pop__name">${escapeHtml(station.name)}</h3>
      <p class="pop__sub"><span class="pop__brand">${escapeHtml(brand)}</span>${escapeHtml(station.address)}</p>
      <table class="pop__table">
        <thead><tr><th></th><th>現金</th><th>会員</th><th>更新</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${note?.memo ? `<p class="pop__memo">${note.tag ? `<span class="pop__tag">${escapeHtml(note.tag)}</span>` : ""}${escapeHtml(note.memo)}</p>` : ""}
      <div class="pop__links">
        <a href="https://gogo.gs/shop/${encodeURIComponent(station.id)}" target="_blank" rel="noopener">gogo.gs で見る</a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}" target="_blank" rel="noopener">経路</a>
      </div>
    </div>`;
}

function render(): void {
  const entries = filtered();
  const sortedPrices = entries.map((e) => e.price);

  markerLayer.clearLayers();
  markers.clear();

  entries.forEach((entry, index) => {
    const step = priceStep(entry.price, sortedPrices);
    const classes = ["pin", `pin--${step}`];
    if (index === 0) classes.push("pin--best");
    if (entry.type === "member") classes.push("pin--member");
    const icon = L.divIcon({
      className: "pin-wrap",
      html: `<div class="${classes.join(" ")}" style="--pin:${PRICE_COLORS[step]}"><span>${entry.price}</span></div>`,
      iconSize: [46, 30],
      iconAnchor: [23, 30],
      popupAnchor: [0, -28],
    });
    const marker = L.marker([entry.station.lat, entry.station.lon], {
      icon,
      title: `${entry.station.name} ${entry.price}`,
      riseOnHover: true,
    }).bindPopup(() => popupHtml(entry.station), { maxWidth: 320, minWidth: 260 });
    marker.addTo(markerLayer);
    markers.set(entry.station.id, marker);
  });

  renderList(entries, sortedPrices);
  renderLegend(sortedPrices);
  $("count").textContent = `${entries.length} 件`;
}

function renderList(entries: Entry[], sortedPrices: number[]): void {
  const list = $<HTMLOListElement>("list");
  const prefName = (code: number) => data.prefectures.find((p) => p.code === code)?.name ?? "";
  list.innerHTML = entries
    .slice(0, 100)
    .map(
      (e, i) => `
      <li class="list__item" data-id="${e.station.id}">
        <span class="list__rank">${i + 1}</span>
        <span class="list__price" style="--pin:${PRICE_COLORS[priceStep(e.price, sortedPrices)]}">${e.price}</span>
        <span class="list__body">
          <span class="list__name">${escapeHtml(e.station.name)}</span>
          <span class="list__meta">${escapeHtml(prefName(e.station.pref))}・${e.type === "member" ? "会員" : "現金"}・${formatUpdated(e.info.updated)}</span>
        </span>
      </li>`,
    )
    .join("");
  if (entries.length === 0) {
    list.innerHTML = `<li class="list__empty">条件に合うスタンドがありません</li>`;
  }
}

function renderLegend(sorted: number[]): void {
  const legend = $("legend");
  if (sorted.length === 0) {
    legend.innerHTML = "";
    return;
  }
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  legend.innerHTML = `
    <div class="legend__bar">${PRICE_COLORS.map(
      (c, i) => `<span style="background:${c}" title="${PRICE_LABELS[i]}"></span>`,
    ).join("")}</div>
    <div class="legend__scale"><span>${lo}</span><span>${hi}</span></div>`;
}

function focusStation(id: string): void {
  const station = data.stations.find((s) => s.id === id);
  const marker = markers.get(id);
  if (!station || !marker) return;
  map.setView([station.lat, station.lon], Math.max(map.getZoom(), 16), { animate: true });
  marker.openPopup();
}

function fitToSelection(): void {
  const entries = filtered();
  if (entries.length === 0) return;
  const bounds = L.latLngBounds(entries.map((e) => [e.station.lat, e.station.lon] as [number, number]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
}

/* ---------- 状態の URL 同期 ---------- */

function readState(): State {
  const p = new URLSearchParams(location.hash.slice(1));
  const fuel = p.get("fuel") as FuelKey | null;
  const brands = p.get("brands");
  return {
    fuel: data.fuels.some((f) => f.key === fuel) ? fuel! : "regular",
    priceType: (["best", "normal", "member"].includes(p.get("type") ?? "")
      ? p.get("type")
      : "best") as PriceTypeFilter,
    pref: Number(p.get("pref") ?? 0) || 0,
    freshness: Number(p.get("fresh") ?? 0) || 0,
    search: p.get("q") ?? "",
    brands: new Set(brands ? brands.split(",").map(Number).filter(Boolean) : []),
  };
}

function writeState(): void {
  const p = new URLSearchParams();
  if (state.fuel !== "regular") p.set("fuel", state.fuel);
  if (state.priceType !== "best") p.set("type", state.priceType);
  if (state.pref) p.set("pref", String(state.pref));
  if (state.freshness) p.set("fresh", String(state.freshness));
  if (state.search) p.set("q", state.search);
  if (state.brands.size) p.set("brands", [...state.brands].join(","));
  const hash = p.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
}

function update(): void {
  writeState();
  render();
}

/* ---------- UI 構築 ---------- */

function buildControls(): void {
  const fuelBox = $("fuel");
  fuelBox.innerHTML = data.fuels
    .map(
      (f) =>
        `<button type="button" role="radio" data-value="${f.key}" aria-checked="${f.key === state.fuel}">${escapeHtml(f.label)}</button>`,
    )
    .join("");

  const prefSelect = $<HTMLSelectElement>("pref");
  prefSelect.innerHTML =
    `<option value="0">全国</option>` +
    data.prefectures
      .map((p) => `<option value="${p.code}">${escapeHtml(p.name)}</option>`)
      .join("");
  prefSelect.value = String(state.pref);

  const brandBox = $("brands");
  const used = new Set(data.stations.map((s) => s.brand));
  brandBox.innerHTML = Object.entries(data.brands)
    .filter(([code]) => used.has(Number(code)))
    .map(
      ([code, name]) =>
        `<button type="button" class="chip" data-value="${code}" aria-pressed="${state.brands.has(Number(code))}">${escapeHtml(name)}</button>`,
    )
    .join("");

  $<HTMLSelectElement>("freshness").value = String(state.freshness);
  $<HTMLInputElement>("search").value = state.search;
  $("topn").textContent = String(data.topN);
  $("meta").innerHTML =
    `${data.stations.length} 店舗・${escapeHtml(data.span)}の価格<br>更新 ${formatStamp(data.generatedAt)}`;
}

function setSegmented(box: HTMLElement, value: string): void {
  for (const b of box.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-checked", String(b.dataset.value === value));
  }
}

function wireEvents(): void {
  $("fuel").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
    if (!btn) return;
    state.fuel = btn.dataset.value as FuelKey;
    setSegmented($("fuel"), state.fuel);
    update();
  });

  $("price-type").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
    if (!btn) return;
    state.priceType = btn.dataset.value as PriceTypeFilter;
    setSegmented($("price-type"), state.priceType);
    update();
  });

  $<HTMLSelectElement>("pref").addEventListener("change", (e) => {
    state.pref = Number((e.target as HTMLSelectElement).value);
    update();
    fitToSelection();
  });

  $<HTMLSelectElement>("freshness").addEventListener("change", (e) => {
    state.freshness = Number((e.target as HTMLSelectElement).value);
    update();
  });

  let searchTimer: ReturnType<typeof setTimeout>;
  $<HTMLInputElement>("search").addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = value;
      update();
    }, 200);
  });

  $("brands").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
    if (!btn) return;
    const code = Number(btn.dataset.value);
    if (state.brands.has(code)) state.brands.delete(code);
    else state.brands.add(code);
    btn.setAttribute("aria-pressed", String(state.brands.has(code)));
    update();
  });

  $("brand-reset").addEventListener("click", () => {
    state.brands.clear();
    for (const b of $("brands").querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    update();
  });

  $("list").addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".list__item");
    if (item?.dataset.id) focusStation(item.dataset.id);
  });

  const setPanel = (hidden: boolean) => document.body.classList.toggle("panel-hidden", hidden);
  $("panel-close").addEventListener("click", () => setPanel(true));
  $("panel-toggle").addEventListener("click", () => setPanel(false));
}

function toast(message: string): void {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
}

async function boot(): Promise<void> {
  try {
    const res = await fetch("./data/stations.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as Dataset;
  } catch (e) {
    toast(`価格データを読み込めませんでした (${(e as Error).message})`);
    return;
  }
  state = readState();
  buildControls();
  setSegmented($("fuel"), state.fuel);
  setSegmented($("price-type"), state.priceType);
  wireEvents();
  render();
  if (state.pref) fitToSelection();
}

void boot();
