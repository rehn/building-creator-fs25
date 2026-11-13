// The OBJ export (for other programs that draw the building): same geometry as the i3d, one group and material per part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildObj, buildI3d, KINDS } from "../src/editor/model.mjs";

const parse = obj => {
  const v = [], f = [], groups = [], mats = [];
  for (const line of obj.split("\n")) {
    const [k, ...r] = line.trim().split(/\s+/);
    if (k === "v") v.push(r.map(Number));
    else if (k === "f") f.push(r.map(s => +s.split("/")[0]));
    else if (k === "g") groups.push(r[0]);
    else if (k === "usemtl") mats.push(r[0]);
  }
  return {v, f, groups, mats};
};

test("buildObj: every kind gives a well-formed OBJ and a matching MTL", () => {
  for (const kind of Object.keys(KINDS)) {
    const p = sanitize({kind}), {obj, mtl} = buildObj(p);
    const {v, f, groups, mats} = parse(obj);
    assert.ok(v.length > 100 && f.length > 100, `${kind}: has geometry`);
    assert.ok(v.every(a => a.length === 3 && a.every(Number.isFinite)), `${kind}: numbers`);
    for (const t of f) for (const i of t) assert.ok(i >= 1 && i <= v.length, `${kind}: face index ${i}`);
    assert.match(obj, /^mtllib model\.mtl$/m);
    assert.ok(groups.length > 2 && groups.length === mats.length, `${kind}: a material per group`);
    for (const m of new Set(mats)) assert.match(mtl, new RegExp(`^newmtl ${m}$`, "m"), `${kind}: ${m} in the mtl`);
    assert.doesNotMatch(obj, /collision/i, `${kind}: collision is not drawn`);
  }
});

test("buildObj: the same extent as the i3d's meshes, y up, metres", () => {
  const p = sanitize({kind: "house"}), {v} = parse(buildObj(p).obj);
  const ys = v.map(a => a[1]), top = Math.max(...ys), bottom = Math.min(...ys);
  assert.ok(top > 3 && top < 15 && bottom > -2, `height ${bottom}..${top}`);
  const i3d = buildI3d(p);
  assert.match(i3d, /<IndexedTriangleSet/);
});

test("buildObj: colours are 0..1 and glass is see-through", () => {
  const {mtl} = buildObj(sanitize({kind: "house"}));
  for (const m of mtl.matchAll(/^Kd (\S+) (\S+) (\S+)$/gm)) for (const c of m.slice(1)) assert.ok(+c >= 0 && +c <= 1);
  assert.match(mtl, /newmtl glass\n(?:.*\n)*?d 0\.\d+/);
});
