import fs from "fs";
let s = fs.readFileSync("src/editor/openings.mjs", "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error(a.slice(0, 70)); s = s.replace(a, () => b); };
rep(`box("door", c - 0.015, c + 0.015, tm, tg, L.dIn - 0.008, L.dOut + 0.018);   // a bar through the glass`, `box("door", c - 0.015, c + 0.015, tm - 0.01, tg + 0.01, L.dIn - 0.008, L.dOut + 0.018);   // a bar through the glass (into the rails: not in their planes)`);
rep(`    box("door", cs - 0.012, cs + 0.012, tm, tg, L.dIn - 0.006, L.dOut + 0.016);                       // the bars through the glass
    for (const k of [1, 2]) box("door", st, W - st, tm + gH * k / 3 - 0.012, tm + gH * k / 3 + 0.012, L.dIn - 0.006, L.dOut + 0.016);`,
`    box("door", cs - 0.012, cs + 0.012, tm - 0.01, tg + 0.01, L.dIn - 0.006, L.dOut + 0.016);           // the bars through the glass (into the rails and stiles)
    for (const k of [1, 2]) box("door", st - 0.01, W - st + 0.01, tm + gH * k / 3 - 0.012, tm + gH * k / 3 + 0.012, L.dIn - 0.006, L.dOut + 0.016);`);
fs.writeFileSync("src/editor/openings.mjs", s);
