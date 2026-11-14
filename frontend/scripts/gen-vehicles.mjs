// Makes src/editor/vehicles.mjs from the game's vehicles: node scripts/gen-vehicles.mjs "/path/to/Farming Simulator 2025/data/vehicles"
// Each entry: [path ($data/vehicles/...xml), name, brand, category, price]. Run it again when the game gets new vehicles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) { console.error("Say where the game's data/vehicles folder is."); process.exit(1); }
const tag = (s, t) => { const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(s); return m ? m[1].trim() : ""; };

const out = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { walk(f); continue; }
    if (!e.name.endsWith(".xml")) continue;
    const s = fs.readFileSync(f, "utf8");
    if (!/^\s*(<\?xml[^>]*>\s*)?<vehicle\b/.test(s)) continue;
    const store = /<storeData>([\s\S]*?)<\/storeData>/.exec(s);
    if (!store) continue;
    const category = tag(store[1], "category").split(/\s+/)[0], price = +tag(store[1], "price"), name = tag(store[1], "name");
    if (!category || !name || !(price > 0)) continue;
    out.push(["$data/vehicles/" + path.relative(root, f).split(path.sep).join("/"), name, tag(store[1], "brand"), category, price]);
  }
})(root);
out.sort((a, b) => a[3].localeCompare(b[3]) || a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/editor/vehicles.mjs");
fs.writeFileSync(file, "// Made by scripts/gen-vehicles.mjs from the game: [path, name, brand, category, price].\nexport default " + JSON.stringify(out).replace(/\],\[/g, "],\n[") + ";\n");
const counts = {};
for (const v of out) counts[v[3]] = (counts[v[3]] || 0) + 1;
console.log(out.length, "vehicles", counts);
