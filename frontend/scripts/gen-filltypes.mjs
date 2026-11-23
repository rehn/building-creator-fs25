// Makes src/editor/filltypes.mjs from the game's fill types: node scripts/gen-filltypes.mjs "/path/to/Farming Simulator 2025/data/maps/maps_fillTypes.xml"
// Each entry: [name, label, pricePerLiter, pallet, bale]. bale: sold as bales (isBaleType), which needs a BaleUnloadTrigger we do not make. pallet: a goods type that comes on pallets (isPalletType): what a warehouse can sell to the player.
// The labels are made from the names ("MILK_BOTTLED" -> "Milk bottled"): the game's own texts are in its archives. Run it again for a new game version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) { console.error("Say where the game's maps_fillTypes.xml is."); process.exit(1); }
const xml = fs.readFileSync(file, "utf8");
// The pallet buying station asks the store for each fill type's pallet and crashes in the game when there is none (MILK, BUFFALOMILK: "attempt to index nil with 'imageFilename'"),
// so only the goods the base game's own warehouse (data/placeables/mapAS/warehouseAS) sells, which are known to have a pallet in the store, count as buyable on pallets.
const whFile = path.join(path.dirname(file), "../placeables/mapAS/warehouseAS/warehouseAS.xml");
const inWarehouse = new Set([...fs.readFileSync(whFile, "utf8").matchAll(/<fillType name="([A-Z0-9_]+)"\s+priceScale/g)].map(m => m[1]));
const out = [];
for (const m of xml.matchAll(/<fillType\s+name="([A-Z0-9_]+)"([^>]*)>([\s\S]*?)<\/fillType>/g)) {
  const [, name, attrs, body] = m, price = +((/pricePerLiter="([^"]+)"/.exec(body) || [])[1] || 0);
  const label = name.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  out.push([name, label, price, /isPalletType="true"/.test(attrs) && /<pallet\s+filename/.test(body) && inWarehouse.has(name), /isBaleType="true"/.test(attrs)]);
}
out.sort((a, b) => a[1].localeCompare(b[1]));
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/editor/filltypes.mjs");
fs.writeFileSync(dest, "// Made by scripts/gen-filltypes.mjs from the game: [name, label, pricePerLiter, pallet].\nexport default " + JSON.stringify(out).replace(/\],\[/g, "],\n[") + ";\n");
console.log(out.length, "fill types,", out.filter(x => x[3]).length, "on pallets");
