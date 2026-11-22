// Number fields of the modeller: the field keeps what is typed until it is left, so typing over a number never fights the clamping
// (typing 3 over 6 in a field that must be at least 6 used to give 6, and then 62). Pure, no DOM.

/** The number a draft text stands for, or null while it is not one yet (empty, "-", "1e"): then nothing is saved and the text stays. A comma works as the decimal point. */
export function draftValue(text) {
  const t = String(text).trim().replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? +t : null;
}

/** A number as the field shows it: at most 3 decimals, no "-0". */
export function shownValue(v) {
  const r = Math.round(+v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}
