// Language support. The English text is the key: t("Walk around") is "Walk around" in English and whatever
// src/i18n/locales/<lang>.json says for it in another language (English is the default and needs no file; en.json is
// only the list of every text, made by `npm run i18n`). A {value} in a text is filled in from the values given:
// t("{n} parts", {n: 3}). A text a language doesn't have yet is shown in English. Pure; no DOM.
//
// Static text on the pages is translated where it is shown (dom.mjs): a text node, or a placeholder/title/aria-label, whose
// whole text is a key is replaced; a key with {values} in it ("{n} m long") matches any text of that shape. So most of the
// text needs no t() at all; t() is for text that is put together in code and for what isn't shown on a page (a confirm box).
import sv from "./locales/sv.json" with { type: "json" };

/** The languages on offer: [code, its own name]. */
export const LANGS = [["en", "English"], ["sv", "Svenska"]];
const TEXTS = { en: null, sv };
let lang = "en", patterns = [];

/** Use a language (a code of LANGS; any other is English). */
export function setLang(code) {
  lang = Object.hasOwn(TEXTS, code) ? code : "en";
  patterns = [];
  const own = TEXTS[lang];
  if (own) for (const [key, text] of Object.entries(own)) {
    if (!/\{\w+\}/.test(key)) continue;
    // a key with {values} matches any text of that shape: the values are what stands in their places
    const names = [], source = key.split(/(\{\w+\})/).map(part => { const m = /^\{(\w+)\}$/.exec(part); if (m) { names.push(m[1]); return "([\\s\\S]+?)"; } return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("");
    patterns.push({ re: new RegExp("^" + source + "$"), names, text, weight: key.replace(/\{\w+\}/g, "").length });
  }
  patterns.sort((a, b) => b.weight - a.weight);
}
export const getLang = () => lang;

/** The names of the {values} in a text. */
export const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

const fill = (s, values) => (values ? s.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : s);

/** The text in the language in use, with {values} filled in. */
export function t(text, values) {
  const own = TEXTS[lang];
  return fill((own && own[text]) || text, values);
}

/** A text as shown (whitespace as the page has it) in the language in use: its translation, or null where there is none (or English is in use). */
export function translateText(text) {
  const own = TEXTS[lang];
  if (!own) return null;
  const key = text.replace(/\s+/g, " ").trim();
  if (!key) return null;
  if (Object.hasOwn(own, key) && !/\{\w+\}/.test(key)) return own[key];
  for (const p of patterns) {
    const m = p.re.exec(key);
    if (m) {
      const values = {};
      p.names.forEach((n, i) => { values[n] = translateText(m[i + 1]) || m[i + 1]; });   // (a value can be a text of its own: a wall's name, a floor)
      return fill(p.text, values);
    }
  }
  return null;
}
