import fs from "fs";
let s = fs.readFileSync("src/editor/model.mjs", "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error(a.slice(0, 70)); s = s.replace(a, () => b); };
rep(`    WG.cut = WG.valley ? [WG.aC - eW, WG.aC + eW] : null;`, `    // (the valley line runs out from the house's slope at the same pitch (45°), but the slope only reaches the end of its overhang: a wing whose
    // ridge is just over the eaves meets it only there, and the rest of its roof runs on to the wall)
    if (WG.valley) {
      WG.xCap = WG.x0 + o;
      WG.cutHalf = Math.min(eW, Math.max(0, (WG.xCap - WG.k) / WG.r));
      WG.xE = Math.min(WG.k + eW * WG.r, WG.xCap);
    }
    WG.cut = WG.valley && WG.cutHalf > 0.01 ? [WG.aC - WG.cutHalf, WG.aC + WG.cutHalf] : null;`);
rep(`    const {valley, yR, k, r: slopeR, x0, eW, eaveW, Mw, Ml, local, tanW, cosW} = WG;
    const xWall = x0 + wing.wd, xF = xWall + Math.min(o, 0.5), xE = valley ? k + eW * slopeR : x0;`, `    const {valley, yR, k, r: slopeR, x0, eW, eaveW, Mw, Ml, local, tanW, cosW, xCap, cutHalf} = WG;
    const xWall = x0 + wing.wd, xF = xWall + Math.min(o, 0.5), xE = valley ? WG.xE : x0;`);
rep(`      const S = valley ? [[k, 0], [xF, 0], [xF, sg * eR], [xE, sg * eR]] : [[x0, 0], [xF, 0], [xF, sg * eR], [x0, sg * eR]];`, `      // (a valley reaching the end of the house's overhang before the wing's eave: along it, then the wing's roof as far in as the overhang)
      const zc = valley ? Math.min(eR, cutHalf) : 0;
      const S = valley ? (zc < eR - 1e-6 ? [[k, 0], [xF, 0], [xF, sg * eR], [xCap, sg * eR], [xCap, sg * zc]] : [[k, 0], [xF, 0], [xF, sg * eR], [xE, sg * eR]]) : [[x0, 0], [xF, 0], [xF, sg * eR], [x0, sg * eR]];`);
rep(`minS = (WG && WG.valley ? WG.k + WG.eW * WG.r - WG.x0 : 0) + 0.3;`, `minS = (WG && WG.valley ? WG.xE - WG.x0 : 0) + 0.3;`);
fs.writeFileSync("src/editor/model.mjs", s);
