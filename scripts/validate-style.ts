/** 地図スタイルを MapLibre 公式の検証器にかける (ブラウザ不要) */
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { buildStyle } from "../src/web/style.ts";

const style = buildStyle();
const errors = validateStyleMin(style);

console.log("sources:", Object.keys(style.sources).join(", "));
console.log("layers :", style.layers.map((l) => `${l.id}(${l.type})`).join(", "));

if (errors.length > 0) {
  for (const e of errors) console.error(`  ${e.message}`);
  process.exit(1);
}
console.log("style OK");
