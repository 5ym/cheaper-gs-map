import type { Map as MapLibreMap } from "maplibre-gl";
import { PRICE_COLORS } from "./format.ts";

/**
 * 価格ピンは canvas で焼いてから MapLibre に画像として登録する。
 * 価格の種類は高々 100 通り程度なので、テキストを焼き込めばグリフサーバが要らない。
 */

const SCALE = 2;
const HEIGHT = 24;
const TAIL = 6;
const RADIUS = 6;

export interface PinSpec {
  price: number;
  step: number;
  member: boolean;
  best: boolean;
}

export function pinKey(spec: PinSpec): string {
  return `pin-${spec.price}-${spec.step}${spec.member ? "-m" : ""}${spec.best ? "-b" : ""}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(spec: PinSpec): ImageData {
  const label = String(spec.price);
  const width = Math.max(40, 16 + label.length * 9);
  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = (HEIGHT + TAIL) * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const color = PRICE_COLORS[spec.step] ?? PRICE_COLORS[0];
  const border = spec.best ? "#fde047" : "rgba(255,255,255,.92)";
  const cx = width / 2;

  // 下向きの尻尾
  ctx.fillStyle = border;
  ctx.beginPath();
  ctx.moveTo(cx - 5, HEIGHT - 1);
  ctx.lineTo(cx + 5, HEIGHT - 1);
  ctx.lineTo(cx, HEIGHT + TAIL);
  ctx.closePath();
  ctx.fill();

  // 本体
  ctx.fillStyle = color;
  ctx.strokeStyle = border;
  ctx.lineWidth = spec.best ? 2 : 1.5;
  roundedRect(ctx, 1, 1, width - 2, HEIGHT - 2, RADIUS);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = `700 13px system-ui, "Hiragino Kaku Gothic ProN", sans-serif`;
  ctx.fillText(label, cx, HEIGHT / 2 + 0.5);

  // 会員価格の印
  if (spec.member) {
    ctx.beginPath();
    ctx.arc(width - 4, 4, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 色の割り当てが変わったら全部作り直す必要があるので、パレットの世代を持つ */
let generation = "";
const registered = new Set<string>();

export function resetPins(map: MapLibreMap, palette: string): void {
  if (generation === palette) return;
  for (const key of registered) {
    if (map.hasImage(key)) map.removeImage(key);
  }
  registered.clear();
  generation = palette;
}

/** 必要なピン画像が登録済みであることを保証する */
export function ensurePin(map: MapLibreMap, spec: PinSpec): string {
  const key = pinKey(spec);
  if (!registered.has(key)) {
    const image = draw(spec);
    if (!map.hasImage(key)) {
      map.addImage(key, image, { pixelRatio: SCALE });
    }
    registered.add(key);
  }
  return key;
}
