// Paints the texture atlas for the rooms behind the windows, to the layout in model.mjs (ATLAS).
// Canvas only, no three.js. 1024 x 1024: the top half holds four back walls (256 x 512 each),
// then a row of matching side walls, then floors and the ceiling.
import { ATLAS_FLOORS, GLASS_ALPHA } from "./model.mjs";

const S = 1024, CW = 256;

function rnd(seed) {
  let h = seed | 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9 | 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
}
function rr(x, X, Y, W, H, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); x.fill();
}
function shade(x, w, h, k = 0.35) {
  const g = x.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${k})`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function wallpaper(x, w, h, base, stripe, seed, base0 = 20) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  x.fillStyle = stripe;
  if (seed % 2) for (let X = 6; X < w; X += 22) x.fillRect(X, 0, 5, h);
  else { const r = rnd(seed); for (let Y = 10; Y < h; Y += 26) for (let X = (Y / 26 % 2) * 13 + 6; X < w; X += 26) { x.beginPath(); x.arc(X, Y, 2.5 + r(), 0, 7); x.fill(); } }
  x.fillStyle = "#EDE8DD"; x.fillRect(0, h - base0, w, base0);
  x.fillStyle = "rgba(0,0,0,0.15)"; x.fillRect(0, h - base0, w, 2);
}
function picture(x, X, Y, W, H) {
  x.fillStyle = "#9C7A3C"; x.fillRect(X, Y, W, H);
  const i = 7, g = x.createLinearGradient(0, Y, 0, Y + H);
  g.addColorStop(0, "#9FC3DD"); g.addColorStop(0.55, "#D9E6EC"); g.addColorStop(0.56, "#6E9A55"); g.addColorStop(1, "#4E7A3C");
  x.fillStyle = g; x.fillRect(X + i, Y + i, W - 2 * i, H - 2 * i);
  x.fillStyle = "#9B2E22"; x.fillRect(X + W * 0.55, Y + H * 0.42, W * 0.22, H * 0.18);
  x.fillStyle = "#3A2A22"; x.beginPath(); x.moveTo(X + W * 0.53, Y + H * 0.43); x.lineTo(X + W * 0.66, Y + H * 0.3); x.lineTo(X + W * 0.79, Y + H * 0.43); x.fill();
}

// Back walls: 256 wide, 512 high, floor at the bottom (about 200 px per metre up, 128 across).
const BACKS = [
  function living(x, w, h) {
    wallpaper(x, w, h, "#E6D6B4", "rgba(150,110,60,0.10)", 1);
    picture(x, 70, h - 340, 116, 92);
    x.fillStyle = "#555"; x.fillRect(226, h - 330, 4, 310);
    x.fillStyle = "#F1E2B9"; x.beginPath(); x.moveTo(212, h - 330); x.lineTo(244, h - 330); x.lineTo(236, h - 370); x.lineTo(220, h - 370); x.fill();
    x.fillStyle = "#4E6B4F"; rr(x, 22, h - 175, 190, 85, 12);
    x.fillStyle = "#5B7B5B"; rr(x, 28, h - 100, 178, 50, 8);
    x.fillStyle = "#43603F"; rr(x, 12, h - 130, 28, 95, 8); rr(x, 194, h - 130, 28, 95, 8);
    x.fillStyle = "#D9A441"; rr(x, 60, h - 160, 40, 40, 8);
    x.fillStyle = "#2E2A26"; x.fillRect(30, h - 40, 6, 20); x.fillRect(198, h - 40, 6, 20);
  },
  function bedroom(x, w, h) {
    wallpaper(x, w, h, "#C9D6E0", "rgba(255,255,255,0.55)", 2);
    picture(x, 88, h - 360, 80, 60);
    x.fillStyle = "#8A6A4A"; rr(x, 34, h - 230, 188, 210, 10);
    x.fillStyle = "#F4F2EC"; rr(x, 48, h - 150, 70, 34, 10); rr(x, 138, h - 150, 70, 34, 10);
    x.fillStyle = "#C46B5A"; x.fillRect(34, h - 110, 188, 90);
    x.fillStyle = "rgba(255,255,255,0.25)"; for (let X = 40; X < 222; X += 18) x.fillRect(X, h - 110, 6, 90);
    x.fillStyle = "#6E5238"; x.fillRect(0, h - 90, 30, 70); x.fillRect(226, h - 90, 30, 70);
    x.fillStyle = "#E9D9A6"; x.beginPath(); x.moveTo(4, h - 130); x.lineTo(26, h - 130); x.lineTo(21, h - 152); x.lineTo(9, h - 152); x.fill();
    x.fillStyle = "#444"; x.fillRect(13, h - 130, 4, 40);
  },
  function kitchen(x, w, h) {
    wallpaper(x, w, h, "#EFE6C4", "rgba(180,150,60,0.10)", 3);
    x.fillStyle = "#F6F6F2"; x.fillRect(0, h - 300, w, 118);
    x.strokeStyle = "rgba(120,130,140,0.45)"; x.lineWidth = 1.5;
    for (let Y = h - 300; Y < h - 182; Y += 20) { x.beginPath(); x.moveTo(0, Y); x.lineTo(w, Y); x.stroke(); }
    for (let X = 0; X < w; X += 20) { x.beginPath(); x.moveTo(X, h - 300); x.lineTo(X, h - 182); x.stroke(); }
    x.fillStyle = "#DDE3D6"; x.fillRect(0, h - 465, w, 160);
    x.fillStyle = "#C9D0C2"; for (let X = 4; X < w; X += 64) x.fillRect(X, h - 460, 58, 150);
    x.fillStyle = "#7A6A55"; x.fillRect(0, h - 186, w, 14);
    x.fillStyle = "#DDE3D6"; x.fillRect(0, h - 172, w, 152);
    x.fillStyle = "#C9D0C2"; for (let X = 4; X < w; X += 64) x.fillRect(X, h - 166, 58, 140);
    x.fillStyle = "#8A8F93"; for (let X = 26; X < w; X += 64) { x.fillRect(X, h - 150, 14, 4); x.fillRect(X, h - 440, 14, 4); }
    x.fillStyle = "#B8BEC2"; x.fillRect(150, h - 192, 60, 8);
    x.fillStyle = "#3C3C3C"; rr(x, 40, h - 222, 50, 36, 6);
    x.fillStyle = "#9B2E22"; rr(x, 100, h - 214, 30, 28, 6);
  },
  function study(x, w, h) {
    wallpaper(x, w, h, "#BFCDB4", "rgba(60,90,50,0.10)", 4);
    const r = rnd(7), cols = ["#7B2E2E", "#2E4B7B", "#C9A23A", "#3D6B4A", "#5A3E6E", "#B8653A", "#E3DCCB"];
    x.fillStyle = "#6E5238"; x.fillRect(16, h - 450, 132, 430);
    for (let Y = h - 440; Y < h - 40; Y += 82) {
      x.fillStyle = "#4A3524"; x.fillRect(22, Y, 120, 74);
      let X = 24;
      while (X < 138) {
        const bw = 7 + Math.floor(r() * 9), bh = 48 + Math.floor(r() * 24);
        if (X + bw > 140) break;
        x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(X, Y + 74 - bh, bw - 1, bh);
        X += bw;
      }
      x.fillStyle = "#6E5238"; x.fillRect(16, Y + 74, 132, 8);
    }
    x.fillStyle = "#7A5A3A"; x.fillRect(160, h - 160, 96, 12); x.fillRect(164, h - 148, 8, 128); x.fillRect(246, h - 148, 8, 128);
    x.fillStyle = "#2E2A26"; rr(x, 186, h - 196, 44, 34, 3);
    x.fillStyle = "#E9D9A6"; x.fillRect(240, h - 186, 12, 26);
    picture(x, 176, h - 350, 64, 84);
  },
];
const SIDES = [["#E6D6B4", "rgba(150,110,60,0.10)", 1], ["#C9D6E0", "rgba(255,255,255,0.55)", 2], ["#EFE6C4", "rgba(180,150,60,0.10)", 3], ["#BFCDB4", "rgba(60,90,50,0.10)", 4]];
const FLOORS = {
  wood(x, w, h) {
    const r = rnd(11);
    for (let Y = 0; Y < h; Y += 32) {
      let X = -Math.floor(r() * 120);
      while (X < w) {
        const len = 90 + Math.floor(r() * 110), t = r();
        x.fillStyle = `rgb(${150 + t * 30 | 0},${104 + t * 22 | 0},${64 + t * 14 | 0})`; x.fillRect(X, Y, len, 31);
        x.fillStyle = "rgba(60,35,15,0.5)"; x.fillRect(X + len - 1, Y, 1, 31);
        X += len;
      }
      x.fillStyle = "rgba(60,35,15,0.45)"; x.fillRect(0, Y + 31, w, 1);
    }
  },
  ceiling(x, w, h) { x.fillStyle = "#EEEBE4"; x.fillRect(0, 0, w, h); },
  carpet(x, w, h) {
    x.fillStyle = "#8C6A55"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#8C3E34"; x.fillRect(24, 24, w - 48, h - 48);
    x.strokeStyle = "#D9B77A"; x.lineWidth = 4; x.strokeRect(36, 36, w - 72, h - 72);
    x.fillStyle = "#D9B77A"; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(w / 2, h / 2, 18 + k * 18, 0, 7); x.lineWidth = 3; x.stroke(); }
  },
  tiles(x, w, h) {
    for (let Y = 0; Y < h; Y += 32) for (let X = 0; X < w; X += 32) { x.fillStyle = (X + Y) / 32 % 2 ? "#E8E2D4" : "#57524A"; x.fillRect(X, Y, 32, 32); }
  },
};

/** The room atlas as a 1024 x 1024 canvas (doc is the document to make it in). */
export function paintInterior(doc = document) {
  const c = doc.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  const at = (X, Y, w, h, draw, k) => { x.save(); x.translate(X, Y); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, w, h); shade(x, w, h, k); x.restore(); };
  BACKS.forEach((draw, k) => at(k * CW, 0, CW, 512, draw, 0.3));
  SIDES.forEach(([b, s, seed], k) => at(k * CW, 512, CW, 256, (x, w, h) => wallpaper(x, w, h, b, s, seed, 10), 0.35));
  ATLAS_FLOORS.forEach((name, k) => at(k * CW, 768, CW, 256, FLOORS[name], name === "ceiling" ? 0.25 : 0.35));
  return c;
}

/** Small tinted glass texture whose alpha the game uses for see-through windows. */
export function paintGlass(doc = document) {
  const c = doc.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = `rgba(115,150,171,${GLASS_ALPHA})`; x.fillRect(0, 0, 64, 64);
  const g = x.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0.35, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(0.65, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}
