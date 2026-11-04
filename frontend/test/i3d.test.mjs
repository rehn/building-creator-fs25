import { test } from "node:test";
import assert from "node:assert/strict";
import { tg, shape, writeScene, pathOf, mappingsFor, I3dDoc, boxMesh } from "../src/editor/i3d.mjs";

const tree = () => tg("house", [0, 0, 0], [
  tg("clearAreas", [0, 0, 0], [tg("clearAreaStart01", [1, 0, 2], [tg("clearAreaWidth01", [0, 0, 3])])]),
  tg("features", [0, 0, 0], [
    shape("door1", { translation: [1, 0, 0], shapeId: 4 }, [shape("door1Collision", { shapeId: 5, kinematic: true })]),
    tg("markerFood", [2, 0, 1]),
  ]),
]);

test("writeScene: node ids run top-down from 1, attributes in order, nothing undefined", () => {
  const xml = writeScene(tree());
  const ids = [...xml.matchAll(/name="([^"]+)"[^>]*nodeId="(\d+)"/g)].map(m => [m[1], +m[2]]);
  assert.deepEqual(ids, [["house", 1], ["clearAreas", 2], ["clearAreaStart01", 3], ["clearAreaWidth01", 4],
    ["features", 5], ["door1", 6], ["door1Collision", 7], ["markerFood", 8]]);
  assert.match(xml, /<Shape name="door1" translation="1 0 0" shapeId="4" nodeId="6">\s*<Shape name="door1Collision" shapeId="5" kinematic="true" nodeId="7"\/>\s*<\/Shape>/);
  assert.match(xml, /<TransformGroup name="markerFood" translation="2 0 1" nodeId="8"\/>/);
  assert.doesNotMatch(xml, /undefined/);
});

test("pathOf: the i3dMapping path of a named node", () => {
  const t = tree();
  assert.equal(pathOf(t, "clearAreaStart01"), "0>0|0");
  assert.equal(pathOf(t, "clearAreaWidth01"), "0>0|0|0");
  assert.equal(pathOf(t, "door1Collision"), "0>1|0|0");
  assert.equal(pathOf(t, "markerFood"), "0>1|1");
  assert.equal(pathOf(t, "nope"), null);
});

test("mappingsFor: one mapping per node the XML names, in the order it names them", () => {
  const xml = `<a startNode="clearAreaStart01" widthNode="clearAreaWidth01"/><b node="markerFood" linkNode="0>"/><c triggerNode="clearAreaStart01"/>`;
  assert.deepEqual(mappingsFor(tree(), xml), [["clearAreaStart01", "0>0|0"], ["clearAreaWidth01", "0>0|0|0"], ["markerFood", "0>1|1"]]);
  assert.throws(() => mappingsFor(tree(), `<a node="ghost"/>`), /ghost/);
});

test("I3dDoc: shapes and materials get ids in the order they are added", () => {
  const doc = new I3dDoc();
  const m1 = doc.material("walls_mat", { diffuseColor: "1 0 0 1" }), m2 = doc.material("glass_mat", { alphaBlending: true }, [["Texture", "textures/glass.png"]]);
  const s1 = doc.shape("box", boxMesh([1, 1, 1])), s2 = doc.shape("trigger", boxMesh([2, 2, 2]), { cpu: true });
  assert.deepEqual([m1, m2, s1, s2], [1, 2, 1, 2]);
  const xml = doc.write(tg("root", [0, 0, 0]));
  assert.match(xml, /<File fileId="1" filename="textures\/glass.png"\/>/);
  assert.match(xml, /<Material name="glass_mat" materialId="2" alphaBlending="true">\s*<Texture fileId="1"\/>\s*<\/Material>/);
  assert.match(xml, /<Material name="walls_mat" materialId="1" diffuseColor="1 0 0 1"\/>/);
  assert.match(xml, /<IndexedTriangleSet name="trigger" shapeId="2" meshUsage="256">/);
  assert.match(xml, /<TransformGroup name="root" translation="0 0 0" nodeId="1"\/>/);
});
