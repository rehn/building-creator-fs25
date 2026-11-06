// A small calculator for the number fields: "10+100" is 110. Only numbers and + - * / ( ), with a comma or a dot as the
// decimal mark, x or × for times and a unit (m, cm, °) left off after the end; anything else is not a number (null).
// A hand-written parser: nothing is evaluated as code. Pure.

/** The value of an expression, or null when it isn't one (or divides by zero, or is not finite). */
export function evalNumber(text) {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (typeof text !== "string" || text.length > 200) return null;
  const s = text.replace(/,/g, ".").replace(/[x×]/gi, "*").replace(/\s+/g, "").replace(/[a-z°"']+$/i, "");
  if (!s || /[^0-9.+\-*/()]/.test(s)) return null;
  let i = 0, bad = false;
  const peek = () => s[i];
  const number = () => {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) { bad = true; return 0; }
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = () => {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") {
      i++; const v = sum();
      if (peek() !== ")") { bad = true; return 0; }
      i++; return v;
    }
    return number();
  };
  const product = () => {
    let v = factor();
    while (!bad && (peek() === "*" || peek() === "/")) {
      const op = s[i++], r = factor();
      if (op === "/" && r === 0) { bad = true; return 0; }
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (!bad && (peek() === "+" || peek() === "-")) { const op = s[i++], r = product(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = sum();
  if (bad || i !== s.length || !Number.isFinite(v)) return null;
  return +v.toFixed(10);
}
