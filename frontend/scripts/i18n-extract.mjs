// Collects every text the app shows (string literals that read as English and the text of JSX) into src/i18n/locales/en.json,
// keeping what sv.json (and any other language) already has: `npm run i18n`. `npm run i18n -- --missing` lists the texts
// a language has no translation for yet.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src"), LOC = join(SRC, "i18n", "locales");

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) { if (n !== "i18n") yield* files(f); }
    else if (/\.(mjs|tsx?)$/.test(n) && n !== "vehicles.mjs") yield f;   // (vehicles.mjs: the game's own vehicle names, not ours to translate)
  }
}

/** Does a literal read as text for a person? */
export function looksLikeText(s) {
  if (s.length < 2 || s.length > 400) return false;
  if (!/^[A-Z]/.test(s)) return false;
  if (!/[a-z]/.test(s)) return false;                         // (ALL CAPS: a code)
  if (/[<>=;\\]|=>|\$\{|https?:|\.(mjs|png|json|xml|i3d)\b/.test(s)) return false;
  if (/\w\.\w|\w\(|_|^M[\d. -]+/.test(s) && !/\.\s/.test(s) && !/ /.test(s)) return false;   // code: Math.abs(x), Animals_CHICKEN, an SVG path
  if (/\w\.[a-z]+\(|^M[\d.]+ [\d.]/.test(s)) return false;
  if (/^[A-Z][a-z]+-[A-Z][a-z]+$/.test(s)) return false;       // HTTP header names
  if (/^[A-Z][A-Za-z0-9]*([A-Z][a-z0-9]+)+$/.test(s)) return false;   // CamelCaseIdentifier
  if (/^[A-Z][a-z]+$/.test(s) && s.length < 3) return false;
  return true;
}

export function extract(source) {
  const out = new Set();
  const add = s => { s = s.replace(/\s+/g, " ").trim(); if (looksLikeText(s)) out.add(s); };
  const unescape = s => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, "$1");
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) add(unescape(m[1]));
  for (const m of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) add(unescape(m[1]));
  for (const m of source.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    // a template with ${x} becomes a text with {x}
    add(m[1].replace(/\$\{\s*(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)\s*\}/g, "{$1}").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, "$1"));
  }
  for (const m of source.matchAll(/>([^<>{}\n][^<>{}]*)</g)) add(m[1]);   // JSX text
  return out;
}

export function collect() {
  const all = new Set();
  for (const f of files(SRC)) for (const s of extract(readFileSync(f, "utf8"))) all.add(s);
  for (const s of JSON.parse(readFileSync(join(root, "scripts", "i18n-extra.json"), "utf8"))) all.add(s);   // (texts the pages put together, found by the crawl)
  return [...all].sort((a, b) => a.localeCompare(b));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const keys = collect();
  writeFileSync(join(LOC, "en.json"), JSON.stringify(Object.fromEntries(keys.map(k => [k, k])), null, 2) + "\n");
  console.log(`${keys.length} texts -> en.json`);
  if (process.argv.includes("--missing")) {
    const sv = JSON.parse(readFileSync(join(LOC, "sv.json"), "utf8"));
    const missing = keys.filter(k => !(k in sv));
    console.log(`${missing.length} without Swedish:`);
    for (const k of missing) console.log(JSON.stringify(k));
  }
}
