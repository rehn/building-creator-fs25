// Translates what a page shows: every text node, and the placeholder, title and aria-label of every element, whose whole text is
// one the language in use has (index.mjs translateText). Runs over what is there and keeps watching, so what the editor draws
// later is translated too. English (no translation) does nothing. Text a user wrote (a name) is left alone where it is marked translate="no".
import { translateText, getLang } from "./index.mjs";

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "CANVAS", "SVG"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const skipped = el => {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || (e.getAttribute && (e.getAttribute("translate") === "no" || e.hasAttribute("data-notranslate")))) return true;
  }
  return false;
};

function translateNode(node) {
  if (node.nodeType === 3) {
    const own = translateText(node.data);
    if (own === null || skipped(node.parentElement)) return;
    const m = /^(\s*)[\s\S]*?(\s*)$/.exec(node.data);
    const next = m[1] + own + m[2];
    if (next !== node.data) node.data = next;
  } else if (node.nodeType === 1) {
    if (skipped(node)) return;
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (!v) continue;
      const own = translateText(v);
      if (own !== null && own !== v) node.setAttribute(a, own);
    }
    for (let c = node.firstChild; c; c = c.nextSibling) translateNode(c);
  }
}

/** Translates `root` and keeps it translated; returns the function that stops it. */
export function startTranslating(root = document.body) {
  if (getLang() === "en") return () => {};
  document.documentElement.lang = getLang();
  translateNode(root);
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(translateNode);
      else if (m.type === "characterData") translateNode(m.target);
      else if (m.type === "attributes") translateNode(m.target);
    }
  });
  obs.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}
