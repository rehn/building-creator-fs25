// A cow or sheep barn with its doorway to the pasture lets the animals walk inside: one walking mesh (like the base game's big barns) of the yard, the building's floor and a ramp in between.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml } from "../src/editor/model.mjs";

const wing = (o = {}) => ({id: 1, wall: "left", pos: 0.5, width: 5, depth: 4, floors: 0, ...o});
const trisOfMesh = xml => { const m = /<IndexedTriangleSet name="navigationMeshShape"[\s\S]*?<\/IndexedTriangleSet>/.exec(xml); return m ? (m[0].match(/<t /g) || []).length || (/<Triangles count="(\d+)"/.exec(m[0]) || [0, 0])[1] * 1 : 0; };

for (const kind of ["cow", "sheep"]) {
  test(`${kind} barn: a walking mesh through the doorway, by default`, () => {
    const p = sanitize({kind}), xml = buildI3d(p), px = placeableXml(p, "x");
    assert.equal(p.animalsInside, true);
    assert.ok(xml.includes('name="navigationMeshShape"'), "the mesh shape");
    assert.ok(!xml.includes('name="navmeshBlocker"'), "no blockers: the mesh is the area");
    assert.ok(px.includes('<navigation shape="navigationMeshShape"/>'), "the husbandry names it");
    assert.ok(xml.includes('name="navigationRootNode"'), "under the navigation node");
  });
  test(`${kind} barn: switched off, the area is the fence's less the building (as before)`, () => {
    const p = sanitize({kind, animalsInside: false}), xml = buildI3d(p);
    assert.ok(!xml.includes("navigationMeshShape"));
    assert.ok(xml.includes('name="navmeshBlocker"'));
    assert.ok(placeableXml(p, "x").includes('<navigation rootNode="navigationRootNode"/>'));
  });
}

test("no doorway, no way in: the old area", () => {
  const base = sanitize({kind: "cow"}), p = sanitize({...base, objects: base.objects.map(o => o.type === "pasture" ? {...o, noGap: true} : o)});
  assert.ok(!buildI3d(p).includes("navigationMeshShape"));
});

test("hens keep to the yard", () => {
  assert.ok(!buildI3d(sanitize({kind: "chicken"})).includes("navigationMeshShape"));
});
