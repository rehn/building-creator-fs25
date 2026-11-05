import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, KIND, sanitize, buildGeometry, buildI3d, placeableXml, placementAreas } from "../src/editor/model.mjs";
import { roomOf, problems } from "../src/editor/layout.mjs";
import { cowYard, cowCap, MAX_COWS } from "../src/editor/kinds/cow.mjs";

// Scene tree of an i3d, enough to resolve "0>6|2|0" mapping paths.
function sceneTree(xml) {
  const scene = xml.slice(xml.indexOf("<Scene>"), xml.indexOf("</Scene>"));
  const root = { children: [] }, stack = [root];
  for (const m of scene.matchAll(/<(\/?)(TransformGroup|Shape|Camera)\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const attr = k => (m[3].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const node = { name: attr("name"), translation: (attr("translation") || "0 0 0").split(" ").map(Number), rotation: (attr("rotation") || "0 0 0").split(" ").map(Number), attrs: m[3], children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children;
}
function resolve(tree, path) {
  const [comp, rest] = path.split(">");
  let node = tree[+comp], pos = node.translation.slice();
  for (const i of rest.split("|").map(Number)) { node = node.children[i]; pos = pos.map((v, k) => v + node.translation[k]); }
  return { node, pos };
}
const mappings = xml => Object.fromEntries([...xml.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
const insidePoly = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const cow = (o = {}) => sanitize({ kind: "cow", width: 12, depth: 8, cows: 12, floors: 1, floorHeight: 3, ...o });
const cowPresets = () => PRESETS.filter(x => x.kind === "cow");
const OPP = { front: "back", back: "front", left: "right", right: "left" };

/* ---------- Settings and presets ---------- */
test("cow barn: a cow kind among the animal buildings, with Swedish presets", () => {
  assert.equal(KIND.cow.category, "animals");
  const ids = cowPresets().map(x => x.id);
  for (const id of ["ladugard", "fahus", "losdriftsstall"]) assert.ok(ids.includes(id), id);
  for (const x of cowPresets()) {
    const p = sanitize(x.settings);
    assert.equal(p.kind, "cow");
    assert.notEqual(p.pastureWall, firstDoorWall(p), x.id);
    assert.match(placeableXml(p, x.name), /<placeable type="cowHusbandryPasture">/, x.id);
    assert.match(buildI3d(p), /<\/i3D>/, x.id);
  }
});

test("cow barn: about one cow per 6 m² of floor, at most MAX_COWS", () => {
  assert.equal(cowCap({ width: 12, depth: 8 }), 16);
  assert.equal(cowCap({ width: 40, depth: 30 }), MAX_COWS);
  // at least 6 x 6 m (troughs fit both sides of the doorway), so 6 cows
  assert.equal(sanitize({ kind: "cow", width: 6, depth: 5, cows: 50 }).cows, 6);
  assert.equal(sanitize({ kind: "cow", doorWall: "back", pastureWall: "back" }).pastureWall, "front");
});

/* ---------- Placeable XML ---------- */
test("mod: a cow pasture in the shop's cow tab, with food, automatic water and the cow fence", () => {
  const p = cow({ cows: 12, modPrice: 30000 }), xml = placeableXml(p, "Ladugården");
  assert.match(xml, /<category>animalpens<\/category>/);
  assert.match(xml, /<tab>cows<\/tab>/);
  assert.match(xml, /<husbandry saveId="Animals_COW"/);
  assert.match(xml, /<animals type="COW" baseMaxNumAnimals="12" maxNumAnimals="12">/);
  assert.match(xml, /<food capacity="20400">/, "1700 l of food per cow, like the base game");
  assert.match(xml, /<foodPlane node="foodPlane" minY="[\d.]+" maxY="[\d.]+" changeVisibility="true" defaultFillType="FORAGE"\/>/);
  assert.match(xml, /<unloadTrigger exactFillRootNode="exactFillRootNodeFood"\/>/);
  assert.match(xml, /<baleTrigger triggerNode="baleTrigger"/);
  assert.match(xml, /<water automaticWaterSupply="true">/);
  assert.match(xml, /cowFence\/cowFence\.xml/);
  assert.match(xml, /<hotspot type="COW"/);
  for (const m of ["markerFood", "markerAnimals", "markerBales"]) assert.match(xml, new RegExp(`<triggerMarker node="${m}"`));
  assert.ok((xml.match(/<foodPlace node=/g) || []).length >= 2, "feeding places");
  assert.ok((xml.match(/<waterPlace node=/g) || []).length >= 1, "drinking places");
});

test("i3d: every node the cow XML names has a mapping that points at it", () => {
  for (const doorWall of ["front", "left"]) {
    const p = cow({ doorWall, pastureWall: OPP[doorWall] }), xml = placeableXml(p, "x"), map = mappings(xml), tree = sceneTree(buildI3d(p));
    for (const [id, path] of Object.entries(map)) assert.equal(resolve(tree, path).node.name, id, path);
    for (const m of xml.matchAll(/\b(?:node|startNode|endNode|widthNode|heightNode|triggerNode|teleportNode|rootNode|exactFillRootNode)="([^"0-9][^"]*)"/g))
      assert.ok(map[m[1]], `${m[1]} has no i3dMapping`);
  }
});

/* ---------- Troughs and the yard ---------- */
test("troughs: cows eat and drink inside the fence, in front of the troughs, and the fill planes are in the troughs", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) {
    const p = cow({ pastureWall, doorWall: OPP[pastureWall] }), geo = buildGeometry(p), y = cowYard(geo, p);
    const xml = placeableXml(p, "x"), map = mappings(xml), tree = sceneTree(buildI3d(p));
    const places = Object.keys(map).filter(id => /^(food|water)Place\d+$/.test(id));
    assert.ok(places.length >= 2, pastureWall); // a short wall has room for one feeding and one drinking spot
    for (const id of places) {
      const q = resolve(tree, map[id]).pos;
      assert.ok(insidePoly(y.fence, q[0], q[2]), `${pastureWall}: ${id} outside the fence`);
    }
    for (const [plane, trough] of [["foodPlane", y.feedTrough], ["waterPlane", y.waterTrough]]) {
      const q = resolve(tree, map[plane]).pos, r = trough.inner;
      assert.ok(q[0] > r.x0 && q[0] < r.x1 && q[2] > r.z0 && q[2] < r.z1, `${pastureWall}: ${plane} not over its trough`);
      const [, lo, hi] = xml.match(new RegExp(`<${plane} node="${plane}" minY="([\\d.]+)" maxY="([\\d.]+)"`)).map(Number);
      assert.ok(lo < hi && hi <= trough.top && lo >= trough.bottom - 1e-9, `${pastureWall}: ${plane} range ${lo}-${hi} outside the trough (${trough.bottom}-${trough.top})`);
    }
  }
});

test("yard: feed pad, bales and trailer spot are outside the pasture and not in front of the people door", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) for (const doorWall of ["front", "back", "left", "right"]) {
    if (pastureWall === doorWall) continue;
    const p = cow({ pastureWall, doorWall }), geo = buildGeometry(p), y = cowYard(geo, p), { w, ops } = geo.opsByWall[doorWall];
    const o = ops.find(x => x.kind === "door"), at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d];
    const a = at(o.s0 - 0.4, 0), b = at(o.s1 + 0.4, 4);
    const zone = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
    const rect = bx => ({ x0: bx.center[0] - bx.size[0] / 2, x1: bx.center[0] + bx.size[0] / 2, z0: bx.center[2] - bx.size[2] / 2, z1: bx.center[2] + bx.size[2] / 2 });
    const hit = (r, s) => r.x0 < s.x1 && s.x0 < r.x1 && r.z0 < s.z1 && s.z0 < r.z1;
    for (const [what, bx] of [["feed pad", y.food], ["bales", y.bales], ["trailer spot", y.loading]]) {
      assert.ok(!hit(rect(bx), zone), `pasture ${pastureWall}, door ${doorWall}: ${what} in front of the door`);
      assert.ok(!insidePoly(y.fence, bx.center[0], bx.center[2]), `pasture ${pastureWall}, door ${doorWall}: ${what} in the pasture`);
    }
  }
});

test("yard: the ground is leveled under the troughs and the feed pad", () => {
  const p = cow(), geo = buildGeometry(p), y = cowYard(geo, p), { level } = placementAreas(geo, y.areas);
  for (const r of [y.feedTrough.outer, y.waterTrough.outer]) assert.ok(r.x0 >= level.x0 && r.x1 <= level.x1 && r.z0 >= level.z0 && r.z1 <= level.z1);
});

/* ---------- The cow opening ---------- */
test("opening: a big open doorway in the pasture wall you can walk through", () => {
  const p = cow({ pastureWall: "back", doorWall: "front" }), geo = buildGeometry(p), { w, ops } = geo.opsByWall.back;
  const o = ops.find(x => x.kind === "hatch");
  assert.ok(o && o.s1 - o.s0 >= 1.4 && o.t1 >= 2, "cow-sized");
  // collision: walk from the pasture in through it
  const s = (o.s0 + o.s1) / 2, F = p.foundation, P = d => [w.o[0] + w.u[0] * s + w.n[0] * d, F + 1, w.o[2] + w.u[2] * s + w.n[2] * d];
  const g = geo.collision, a = P(1.5), b = P(-1.5), dvec = b.map((v, i) => v - a[i]);
  const sub = (x, y2) => x.map((v, i) => v - y2[i]), cross = (x, y2) => [x[1]*y2[2] - x[2]*y2[1], x[2]*y2[0] - x[0]*y2[2], x[0]*y2[1] - x[1]*y2[0]], dot = (x, y2) => x[0]*y2[0] + x[1]*y2[1] + x[2]*y2[2];
  let blocked = false;
  for (let t = 0; t < g.i.length && !blocked; t += 3) {
    const V = k => [g.p[k*3], g.p[k*3+1], g.p[k*3+2]], v0 = V(g.i[t]), e1 = sub(V(g.i[t+1]), v0), e2 = sub(V(g.i[t+2]), v0), h = cross(dvec, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s0 = sub(a, v0), u = dot(s0, h) / det; if (u < 0 || u > 1) continue;
    const q = cross(s0, e1), v = dot(dvec, q) / det; if (v < 0 || u + v > 1) continue;
    const k = dot(e2, q) / det; if (k > 0 && k < 1) blocked = true;
  }
  assert.ok(!blocked, "walled off");
});

/* ---------- Inside ---------- */
test("inside: filling automatically works for every door and pasture side, with a stall per cow if there's room", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) for (const doorWall of ["front", "back", "left", "right"]) {
    if (doorWall === pastureWall) continue;
    for (const [width, depth, cows] of [[8, 6, 6], [16, 9, 20], [30, 16, 70]]) {
      const p = sanitize({ kind: "cow", width, depth, cows, pastureWall, doorWall, floors: 1, floorHeight: 3 });
      const what = `${width}x${depth} ${cows} cows, pasture ${pastureWall}, door ${doorWall}`;
      const pr = problems(p.items, KIND.cow.catalog, roomOf(p, KIND.cow.openings(p)));
      assert.deepEqual([...pr].map(([i, m]) => `${p.items.find(x => x.id === i).type}: ${m}`), [], what);
      const stalls = p.items.filter(i => i.type === "stalls").reduce((s, i) => s + i.count, 0);
      assert.ok(stalls >= Math.min(p.cows, 4), `${what}: ${stalls} stalls`);
    }
  }
});

/* ---------- Roof ventilators (any building) ---------- */
test("roof: ventilators stand on the ridge, a Swedish barn's lantern", () => {
  const plain = buildGeometry(sanitize({ width: 12, depth: 8 }));
  const vent = buildGeometry(sanitize({ width: 12, depth: 8, ventilators: 2 }));
  const top = g => Math.max(...g.p.filter((_, i) => i % 3 === 1));
  assert.ok(top(vent.G.roof) > plain.dims.ridgeY + 0.6, "a little roof above the ridge");
  assert.ok(top(vent.G.walls) > plain.dims.ridgeY + 0.3, "louvred sides above the ridge");
  assert.equal(sanitize({}).ventilators, 0, "houses have none by default");
  assert.ok(sanitize(PRESETS.find(x => x.id === "ladugard").settings).ventilators >= 1, "the red barn has one");
});

/** The wall of the building's first door. */
function firstDoorWall(p) { return p.windows.find(w => w.type === "door" && w.floor === 0).wall; }

test("cows: a 60 m barn builds, fills and exports, and its places can move along the whole wall", async () => {
  const { PLACE_LIMITS } = await import("../src/editor/places.mjs");
  const p = sanitize({ ...PRESETS.find(x => x.id === "ladugard").settings, width: 60, depth: 14, cows: 100 });
  assert.equal(p.width, 60);
  const geo = buildGeometry(p);
  assert.equal(problems(p.items, KIND.cow.catalog, roomOf(p, KIND.cow.openings(p))).size, 0, "the inside fits");
  assert.ok(p.items.length > 0);
  // the troughs along a 60 m wall are long pieces; they stay within the room
  const room = roomOf(p);
  for (const it of p.items) assert.ok(it.x >= room.x0 - 0.01 && it.x <= room.x1 + 0.01 && it.z >= room.z0 - 0.01 && it.z <= room.z1 + 0.01, it.type);
  const troughs = p.items.filter(it => it.length);
  assert.ok(troughs.some(it => it.length > 20), "the troughs run along the long wall: " + troughs.map(t => t.type + " " + t.length).join(", "));
  const xml = buildI3d(p, {});
  assert.ok(xml.length > 1000);
  assert.ok(PLACE_LIMITS.along[1] >= 30, "a place can go to the end of a 60 m wall");
  assert.ok(PLACE_LIMITS.width[1] >= 64, "the info area can cover a 60 m barn");
  assert.ok(geo);
});
