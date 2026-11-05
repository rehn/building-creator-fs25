// A building's age: how its paint fades and its surfaces weather. Pure, no DOM.
//   agedColor(hex, years, mat)    the colour a part has after so many years
//   weather({S, H, Mk, N}, kind, years)   a surface texture's shade (S), height (H) and marks (Mk) after so
//     many years: dirt, rain streaks, peeling paint, moss, rust ... Marks are pixels of their own colour
//     (MASK_RGB), not shades of the part's colour: peeled paint shows grey wood whatever the paint.
// Everything tiles (the textures repeat over the walls), so nothing here knows where on the building it is.
import { noise, fbm, hash } from "./surfaces.mjs";

/** Colours of texture marks (Mk values): 1 brick mortar, then what age brings. */
export const MASK_RGB = {1: [184, 178, 168], 2: [128, 123, 112], 3: [70, 82, 44], 4: [98, 60, 38], 5: [150, 152, 124], 6: [204, 204, 194]};
const BARE_WOOD = 2, MOSS = 3, RUST = 4, LICHEN = 5, WHITE_RUST = 6, MORTAR = 1;

/** How far along weathering is: 0 new, 1 at 40 years, up to 1.5 at 60. */
const amount = years => Math.max(0, Math.min(1.5, years / 40));

/* ---------- Colours ---------- */
const toHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const toHex = ([h, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0")).join("");
};
// per material: [saturation lost, lightness moved towards 0.5 (paint chalking), lightness lost (dirt)]
const FADE = {walls: [0.4, 0.18, 0.04], trim: [0.3, 0, 0.12], door: [0.35, 0.12, 0.06], roof: [0.25, 0, 0.12],
  foundation: [0.2, 0, 0.16], chimney: [0.2, 0, 0.1], gutter: [0.25, 0.1, 0.05]};
/** The colour a part (material mat) has after years: paint fades and chalks, roofs and plinths darken with dirt. */
export function agedColor(hex, years, mat) {
  const t = amount(years), f = FADE[mat], c = String(hex).toLowerCase();
  if (!t || !f) return hex;
  let [h, s, l] = toHsl([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  s *= 1 - f[0] * Math.min(1, t);
  l += (0.5 - l) * f[1] * Math.min(1, t);
  l *= 1 - f[2] * t;
  return toHex([h, s, l]);
}

/* ---------- Surfaces ---------- */
/** The surface kinds weathering knows: the outside ones (surfaceSpec) and the inside ones (surfaces.mjs). */
export const AGED_KINDS = ["lockpanel", "horizontal", "paintedwood", "plaster", "tiles", "felt", "metal", "brick", "concrete",
  "whitewash", "grime", "timber", "boards", "wood", "galv", "steel", "plastic", "rubber", "straw", "litter"];

/**
 * A surface texture {S, H, Mk, N} (shade, height, marks or null; N x N) after years. Returns new maps.
 * outdoor: a concrete surface out in the weather (the plinth) grows moss; a barn floor doesn't.
 */
export function weather({S, H, Mk, N}, kind, years, {outdoor = false} = {}) {
  const t = amount(years);
  const S2 = Float32Array.from(S), H2 = Float32Array.from(H);
  if (!t) return {S: S2, H: H2, Mk: Mk ? Uint8Array.from(Mk) : null, N};
  const M2 = Mk ? Uint8Array.from(Mk) : new Uint8Array(N * N);
  const mark = (i, code) => { if (!M2[i] || M2[i] === MORTAR && code === MOSS) M2[i] = code; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const dirt = fbm(x, y, N, 4, 501), streak = noise(x, y, N, 40, 3, 502), grit = hash(x, y, 503);
    let s = 1;
    // grime everywhere, in clouds and in streaks where the rain runs down
    s *= 1 - 0.1 * t * Math.max(0, dirt - 0.3) - 0.07 * t * streak;
    if (kind === "lockpanel" || kind === "horizontal" || kind === "paintedwood") {
      // paint chalks unevenly; where it has worn through, the grey wood shows (more along the grain)
      s *= 1 + 0.05 * t * (fbm(x, y, N, 8, 504) - 0.5);
      const peel = kind === "horizontal" ? noise(x, y, N, 6, 48, 505) * 0.6 + fbm(x, y, N, 32, 506) * 0.4 : noise(x, y, N, 48, 6, 505) * 0.6 + fbm(x, y, N, 32, 506) * 0.4;
      if (peel > 0.87 - 0.09 * t) { mark(i, BARE_WOOD); H2[i] -= 0.4; }
    } else if (kind === "plaster") {
      if (Math.abs(noise(x, y, N, 6, 6, 507) - 0.5) < 0.004 * t) s *= 0.6;                     // hairline cracks
      if (fbm(x, y, N, 16, 508) > 0.86 - 0.1 * t) { mark(i, MORTAR); H2[i] -= 0.4; }          // spalled render
    } else if (kind === "tiles" || kind === "felt") {
      s *= 1 - 0.1 * t;
      // moss gathers along the lower edge of each row of tiles (where water lies), in patches
      const P = N / 4, lip = kind === "tiles" ? Math.exp(-(y % P) / (P * 0.18)) : 0.3, moss = fbm(x, y, N, 12, 509) * 0.75 + lip * 0.35;
      if (moss > 0.86 - 0.1 * t) { mark(i, MOSS); s *= 0.8 + 0.4 * grit; }
      else if (grit > 0.998 - 0.002 * t) mark(i, LICHEN);
    } else if (kind === "metal") {
      if (fbm(x, y, N, 16, 510) > 0.88 - 0.08 * t) { mark(i, RUST); s *= 0.75 + 0.35 * grit; }
      s *= 1 - 0.1 * t * noise(x, y, N, 24, 2, 511);                                         // run-off streaks
    } else if (kind === "brick" || kind === "concrete") {
      s *= 1 - 0.08 * t * dirt;
      if ((outdoor || kind === "brick") && fbm(x, y, N, 12, 512) > 0.8 - 0.1 * t) mark(i, MOSS);
      if (kind === "concrete" && fbm(x, y, N, 6, 513) > 0.6) s *= 1 - 0.18 * t;              // dark stains
    } else if (kind === "whitewash" || kind === "grime") {
      s *= 1 - 0.12 * t * Math.max(0, fbm(x, y, N, 8, 514) - 0.35);
    } else if (kind === "timber" || kind === "boards" || kind === "wood") {
      s *= 1 - 0.1 * t;
    } else if (kind === "galv") {
      S2[i] = 1 + (S2[i] - 1) * (1 - 0.4 * Math.min(1, t));                                  // the spangle dulls
      if (fbm(x, y, N, 16, 515) > 0.84 - 0.08 * t) mark(i, WHITE_RUST);
    } else if (kind === "steel") {
      if (fbm(x, y, N, 16, 516) > 0.78 - 0.12 * t) mark(i, RUST);
    }
    S2[i] = Math.max(0.35, S2[i] * s);
  }
  return {S: S2, H: H2, Mk: M2, N};
}
