import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, SCHEMA, FIELD, PRESETS, sanitize, buildGeometry, buildI3d, placeableXml, placeableSnippet,
  placementAreas, henCap, henYard, defaultModDescription, HENS_PER_M2, MAX_HENS
  , KIND } from "../src/editor/model.mjs";
import { roomOf, problems, snapItem } from "../src/editor/layout.mjs";

// Scene tree of an i3d, enough to resolve "0>6|2|0" mapping paths (same as model.test.mjs).
function sceneTree(xml) {
  const scene = xml.slice(xml.indexOf("<Scene>"), xml.indexOf("</Scene>"));
  const root = { children: [] }, stack = [root];
  for (const m of scene.matchAll(/<(\/?)(TransformGroup|Shape|Camera)\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const attr = k => (m[3].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const node = { name: attr("name"), translation: (attr("translation") || "0 0 0").split(" ").map(Number), attrs: m[3], children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children;
}
function resolve(tree, path) {
  const [comp, rest] = path.split(">");
  let node = tree[+comp], pos = node.translation.slice();
  for (const i of rest.split("|").map(Number)) {
    node = node.children[i];
    assert.ok(node, `no node at ${path}`);
    pos = pos.map((v, k) => v + node.translation[k]);
  }
  return { node, pos };
}
const mappings = xml => Object.fromEntries([...xml.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
const near = (a, b, what, eps = 1e-3) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${what}: ${a} vs ${b}`));
const hen = (o = {}) => sanitize({ kind: "chicken", width: 8, depth: 5, hens: 60, ...o });

/* ---------- Settings ---------- */
test("sanitize: old saves without a kind are houses", () => {
  assert.equal(sanitize({}).kind, "house");
  assert.equal(sanitize({ kind: "spaceship" }).kind, "house");
  assert.equal(sanitize({ kind: "chicken" }).kind, "chicken");
});

test("sanitize: a chicken barn has no sleep point, rooms or dormers", () => {
  const p = sanitize({ kind: "chicken", sleepPoint: true, interior: true, dormers: [{ type: "gable", side: 1, pos: 0.5 }] });
  assert.equal(p.sleepPoint, false);
  assert.equal(p.interior, false);
  assert.deepEqual(p.dormers, []);
});

test("henCap: room for 2.5 hens per square metre, at most 360", () => {
  assert.equal(HENS_PER_M2, 2.5);
  assert.equal(MAX_HENS, 360);
  assert.equal(henCap({ width: 4, depth: 3 }), 30);
  assert.equal(henCap({ width: 30, depth: 25 }), 360);
});

test("sanitize: hens are limited by the floor area", () => {
  assert.equal(sanitize({ kind: "chicken", width: 4, depth: 3, hens: 200 }).hens, 30);
  assert.equal(sanitize({ kind: "chicken", width: 20, depth: 8, hens: 360 }).hens, 360);
});

test("schema: chicken barns hide the house-only sections and show the chicken one", () => {
  const byTitle = Object.fromEntries(SCHEMA.map(g => [g.title, g]));
  const shows = (g, kind) => !g.kinds || g.kinds.includes(kind);
  for (const t of ["Interior", "Farmhouse", "Kupor (dormers)"]) {
    assert.ok(shows(byTitle[t], "house"), t);
    assert.ok(!shows(byTitle[t], "chicken"), t);
  }
  const chickens = SCHEMA.find(g => g.fields.some(f => f.k === "hens"));
  assert.ok(chickens && shows(chickens, "chicken") && !shows(chickens, "house"));
  // The kind is picked when the project is made ("New") and can't be changed in the editor.
  assert.ok(!SCHEMA.some(g => g.fields.some(f => f.k === "kind")), "no kind switch in the editor");
});

/* ---------- Presets ---------- */
test("presets: a farmhouse and chicken barns, the biggest for 360 hens", () => {
  assert.equal(PRESETS[0].id, "farmhouse");
  const ids = PRESETS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const x of PRESETS) {
    assert.ok(x.name && x.blurb, x.id);
    const p = sanitize(x.settings);
    // every preset setting survives sanitize, so the preset is what the user gets
    for (const [k, v] of Object.entries(x.settings)) if (FIELD[k]) assert.deepEqual(p[k], v, `${x.id}.${k}`);
    // window counts (winFront ...) only seed the window list
    for (const wall of ["Front", "Back", "Left", "Right"]) {
      const n = x.settings["win" + wall];
      if (n !== undefined) assert.equal(p.windows.filter(w => w.wall === wall.toLowerCase() && w.floor === 0).length, n, `${x.id} win${wall}`);
    }
  }
  const hens = PRESETS.filter(x => x.settings.kind === "chicken").map(x => sanitize(x.settings).hens);
  assert.ok(hens.length >= 3);
  assert.equal(Math.max(...hens), 360);
});

test("presets: every chicken barn builds and exports", () => {
  for (const x of PRESETS.filter(x => x.settings.kind === "chicken")) {
    const p = sanitize(x.settings);
    assert.ok(buildGeometry(p).G.walls.i.length > 0, x.id);
    assert.match(buildI3d(p), /<\/i3D>/, x.id);
    assert.match(placeableXml(p, x.name), /type="chickenHusbandryPasture"/, x.id);
  }
});

/* ---------- Yard layout ---------- */
const OPP = { front: "back", back: "front", left: "right", right: "left" };
test("henYard: the fence starts at the pasture wall and runs out into the pasture", () => {
  for (const doorWall of ["front", "back", "left", "right"]) {
    // (doorWall here is the pasture side; the people door is on the opposite wall)
    const p = hen({ pastureWall: doorWall, doorWall: OPP[doorWall], fenceDepth: 10 });
    const geo = buildGeometry(p), y = henYard(geo, p);
    const n = { front: [0, 1], back: [0, -1], right: [1, 0], left: [-1, 0] }[doorWall];
    const out = q => q[0] * n[0] + q[2] * n[1];
    const wallAt = (n[0] ? geo.dims.W : geo.dims.D) / 2;
    for (const q of y.fence) assert.equal(q[1], 0);
    // every post is either at the wall line or fenceDepth out, and the far side is fenceDepth out
    for (const q of y.fence) assert.ok(Math.abs(out(q) - wallAt) < 0.3 || Math.abs(out(q) - wallAt - 10) < 1e-6, `${doorWall}: post ${q}`);
    assert.ok(y.fence.filter(q => Math.abs(out(q) - wallAt - 10) < 1e-6).length === 2, doorWall);
    // first and last post at the barn's corners, so the fence joins the barn
    const along = q => q[0] * -n[1] + q[2] * n[0], halfWall = (n[0] ? geo.dims.D : geo.dims.W) / 2;
    for (const q of [y.fence[0], y.fence[y.fence.length - 1]]) {
      assert.ok(Math.abs(out(q) - wallAt) < 0.3, `${doorWall}: end post not at the wall`);
      assert.ok(Math.abs(Math.abs(along(q)) - halfWall) < 1e-6, `${doorWall}: end post ${q} not at a corner`);
    }
  }
});

test("henYard: a fence wider than the barn runs back along the wall line to the barn's corners", () => {
  const p = hen({ width: 4, depth: 3, pastureWall: "front", doorWall: "back", fenceDepth: 8 });
  const geo = buildGeometry(p), y = henYard(geo, p), wz = geo.dims.D / 2 + 0.15;
  const xz = y.fence.map(q => [+q[0].toFixed(3), +q[2].toFixed(3)]);
  assert.deepEqual(xz, [[2, wz], [6, wz], [6, wz + 7.85], [-6, wz + 7.85], [-6, wz], [-2, wz]].map(([x, z]) => [x, +z.toFixed(3)]));
  // a barn as wide as the pasture needs no extra posts
  assert.equal(henYard(buildGeometry(hen({ width: 20 })), hen({ width: 20 })).fence.length, 4);
});

test("mod: the XML lists one fence node per post", () => {
  for (const width of [4, 20]) {
    const p = hen({ width, depth: 5 }), posts = henYard(buildGeometry(p), p).fence.length;
    const section = placeableXml(p, "x").match(/<section segmentId="SEGMENT" customizable="true">([\s\S]*?)<\/section>/)[1];
    assert.deepEqual([...section.matchAll(/node="([^"]+)"/g)].map(m => m[1]), Array.from({ length: posts }, (_, i) => `fence1Node${i + 1}`));
  }
});

test("henYard: pallets and the trailer spot keep clear of the fence along the wall line", () => {
  for (const [width, depth, doorWall, door] of [[4, 3, "front", "back"], [9, 5, "left", "front"], [20, 8, "right", "back"], [6, 2.5, "back", "left"]]) {
    const p = hen({ width, depth, pastureWall: doorWall, doorWall: door });
    const geo = buildGeometry(p), y = henYard(geo, p), w = geo.opsByWall[doorWall].w;
    const ahead = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2]; // metres in front of the door wall
    const corners = b => [-1, 1].flatMap(i => [-1, 1].map(k => [b.center[0] + i * b.size[0] / 2, 0, b.center[2] + k * b.size[2] / 2]));
    for (const q of [...y.pallet.lines.flat(), ...corners(y.pallet.trigger), ...corners(y.loading)])
      assert.ok(ahead(q) <= -1 + 1e-6, `${width}x${depth} ${doorWall}: ${q} is ${ahead(q).toFixed(2)} m from the fence line`);
  }
});

// The game failed to build the walking area for a 6 x 4.4 m pasture (buildNavMeshFromShapesAndContour
// failed). Its own pastures are at least about 12 m along the barn and 6 m deep.
test("henYard: the starting pasture is at least 12 m wide and 6 m deep, centred on the pasture wall", () => {
  assert.equal(sanitize({ kind: "chicken", fenceDepth: 3 }).fenceDepth, 6);
  for (const [width, want] of [[4, 12], [6.1, 12], [20, 20]]) {
    const p = hen({ width, depth: 3, pastureWall: "front", doorWall: "back" });
    const y = henYard(buildGeometry(p), p), xs = y.fence.map(q => q[0]);
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - want) < 1e-6, `width ${width}: fence ${xs}`);
    assert.ok(Math.abs(Math.max(...xs) + Math.min(...xs)) < 1e-6, "centred on the wall");
  }
});

test("henYard: food, pallets and loading are outside the barn and outside the pasture", () => {
  const p = hen({ pastureWall: "front", doorWall: "back" });
  const geo = buildGeometry(p), y = henYard(geo, p), { W, D } = geo.dims;
  const inBarn = ([x, , z]) => Math.abs(x) < W / 2 && Math.abs(z) < D / 2;
  const inPasture = ([, , z]) => z > D / 2;
  for (const [what, q] of [["food", y.food.center], ["loading", y.loading.center], ["pallet trigger", y.pallet.trigger.center],
    ...y.pallet.lines.flatMap((l, i) => [[`pallet line ${i} start`, l[0]], [`pallet line ${i} end`, l[1]]])]) {
    assert.ok(!inBarn(q), `${what} inside the barn`);
    assert.ok(!inPasture(q), `${what} inside the pasture`);
  }
  assert.ok(y.pallet.lines.length === 2);
});

test("henYard: the feed place is a low pad on the ground, so a tipping trailer's raycast starts above it", () => {
  const p = hen();
  const { food } = henYard(buildGeometry(p), p);
  assert.ok(Math.abs(food.center[1] - food.size[1] / 2) < 1e-9, "bottom on the ground");
  assert.ok(food.size[1] <= 0.5, `pad is ${food.size[1]} m high`);
  assert.ok(Math.min(food.size[0], food.size[2]) >= 2.5, "big enough to hit when backing up");
});

test("areas: a chicken barn clears and levels the ground around its food and pallet places", () => {
  const p = hen();
  const geo = buildGeometry(p), y = henYard(geo, p), { clear, level } = placementAreas(geo, y.areas);
  for (const q of [y.food.center, y.pallet.trigger.center, ...y.pallet.lines.flat()]) {
    assert.ok(q[0] >= clear.x0 && q[0] <= clear.x1 && q[2] >= clear.z0 && q[2] <= clear.z1, `${q} not cleared`);
    assert.ok(q[0] >= level.x0 && q[0] <= level.x1 && q[2] >= level.z0 && q[2] <= level.z1, `${q} not leveled`);
  }
});

/* ---------- Placeable XML ---------- */
test("mod: a chicken barn is a chicken pasture in the animal pens shop", () => {
  const p = hen({ hens: 60, modPrice: 12000 });
  const xml = placeableXml(p, "Hönshuset");
  assert.match(xml, /<placeable type="chickenHusbandryPasture">/);
  assert.match(xml, /<category>animalpens<\/category>/);
  assert.match(xml, /<type>husbandry<\/type>\s*<category>animals<\/category>\s*<tab>chickens<\/tab>/);
  assert.match(xml, /\$l10n_function_animalPenChicken/);
  assert.match(xml, /<price>12000<\/price>/);
  assert.match(xml, /<husbandry saveId="Animals_CHICKEN"/);
  assert.match(xml, /<animals type="CHICKEN" baseMaxNumAnimals="60" maxNumAnimals="60">/);
  assert.match(xml, /<food capacity="1500">/, "25 l of feed per hen, like the base game");
  assert.match(xml, /<palletSpawner fillTypes="EGG"/);
  assert.match(xml, /chickenNetFence\/chickenNetFence\.xml/);
  assert.match(xml, /<section segmentId="SEGMENT" customizable="true">/);
  assert.match(xml, /<hotspot type="CHICKEN" teleportNode="teleportNode"\/>/);
  assert.match(xml, /<meadow>/);
  assert.doesNotMatch(xml, /farmhouse|sleeping/i);
});

test("mod: the hen count is capped by floor area even if the editor set more", () => {
  const p = { ...hen({ width: 8, depth: 5 }), width: 4, depth: 3, hens: 200 };
  assert.match(placeableXml(p, "x"), /maxNumAnimals="30"/);
});

test("mod: a house switched to a chicken barn in the editor exports without a sleep point", () => {
  const p = { ...sanitize({ sleepPoint: true }), kind: "chicken" };
  const xml = placeableXml(p, "x");
  assert.match(xml, /chickenHusbandryPasture/);
  assert.doesNotMatch(xml, /sleeping|farmhouse/);
  assert.doesNotMatch(buildI3d(p), /sleepingTrigger/);
});

test("defaultModDescription: says how many hens", () => {
  assert.match(defaultModDescription(hen({ hens: 60 })), /chicken barn for 60 hens/);
});

/* ---------- i3d nodes ---------- */
test("i3d: every node the chicken XML names has a mapping that points at it", () => {
  for (const doorWall of ["front", "left"]) {
    const p = hen({ doorWall });
    const xml = placeableXml(p, "x"), map = mappings(xml), tree = sceneTree(buildI3d(p));
    for (const [id, path] of Object.entries(map)) assert.equal(resolve(tree, path).node.name, id, path);
    for (const m of xml.matchAll(/\b(?:node|startNode|endNode|widthNode|heightNode|triggerNode|teleportNode|rootNode|exactFillRootNode)="([^"0-9][^"]*)"/g))
      assert.ok(map[m[1]], `${m[1]} has no i3dMapping`);
    assert.deepEqual(placeableSnippet(p).match(/<i3dMapping[^>]*>/g), xml.match(/<i3dMapping[^>]*>/g), "snippet and mod agree");
  }
});

test("i3d: chicken nodes sit where henYard puts them", () => {
  const p = hen({ doorWall: "right" });
  const y = henYard(buildGeometry(p), p), map = mappings(placeableXml(p, "x")), tree = sceneTree(buildI3d(p));
  const at = id => resolve(tree, map[id]).pos;
  near(at("exactFillRootNodeFood"), y.food.center, "food trigger");
  near(at("loadingTrigger"), y.loading.center, "loading trigger");
  near(at("palletTrigger"), y.pallet.trigger.center, "pallet trigger");
  near(at("palletAreaStart01"), y.pallet.lines[0][0], "pallet line 1 start");
  near(at("palletAreaEnd01"), y.pallet.lines[0][1], "pallet line 1 end");
  near(at("palletAreaEnd02"), y.pallet.lines[1][1], "pallet line 2 end");
  y.fence.forEach((q, i) => near(at(`fence1Node${i + 1}`), q, `fence post ${i + 1}`));
});

test("i3d: triggers use the base game's collision filters", () => {
  const p = hen(), map = mappings(placeableXml(p, "x")), tree = sceneTree(buildI3d(p));
  const attrs = id => resolve(tree, map[id]).node.attrs;
  // Feed is tipped onto a solid (non-trigger) shape that trailers and augers find with a raycast,
  // as in most of the base game's barns; a trigger let nothing be unloaded. It only collides with
  // triggers, so players and vehicles go through it.
  const food = attrs("exactFillRootNodeFood");
  assert.doesNotMatch(food, /trigger="true"/);
  assert.match(food, /static="true"/);
  assert.match(food, /collisionFilterGroup="0x40000000"/);
  assert.match(food, /collisionFilterMask="0x20000000"/);
  assert.match(food, /nonRenderable="true"/);
  const filters = {
    loadingTrigger: ["0x20000000", "0x110000"],
    infoTrigger: ["0x20000000", "0x110000"],
    palletTrigger: ["0x20000000", "0x10000"],
  };
  for (const [id, [group, mask]] of Object.entries(filters)) {
    const a = attrs(id);
    assert.match(a, /trigger="true"/, id);
    assert.match(a, new RegExp(`collisionFilterGroup="${group}"`), id);
    assert.match(a, new RegExp(`collisionFilterMask="${mask}"`), id);
    assert.match(a, /nonRenderable="true"/, id);
  }
  // The barn's footprint blocks the generated walking area, like the base game's horse barn.
  const nav = resolve(tree, map.navigationRootNode).node;
  assert.equal(nav.children.length, 1);
  assert.match(nav.children[0].attrs, /buildNavMeshMask="0xfe"/);
  assert.match(nav.children[0].attrs, /nonRenderable="true"/);
});

/* ---------- Warning stripes ---------- */
// Like the base game's chicken barns: yellow-black corner marks on the ground around the egg pallet
// place, a terrain decal that the game shows or hides with its "trigger markers" setting.
test("henYard: warning stripes mark the four corners of the egg pallet place", () => {
  const p = hen({ doorWall: "left" });
  const { pallet } = henYard(buildGeometry(p), p), g = pallet.stripes, t = pallet.trigger;
  const x0 = t.center[0] - t.size[0] / 2, x1 = t.center[0] + t.size[0] / 2, z0 = t.center[2] - t.size[2] / 2, z1 = t.center[2] + t.size[2] / 2;
  const pts = [];
  for (let i = 0; i < g.p.length; i += 3) pts.push([g.p[i], g.p[i + 1], g.p[i + 2]]);
  assert.equal(g.i.length / 6, 8, "two arms per corner");
  for (const [x, y, z] of pts) {
    assert.equal(y, 0, "flat on the ground");
    assert.ok(x >= x0 - 1e-9 && x <= x1 + 1e-9 && z >= z0 - 1e-9 && z <= z1 + 1e-9, `${x},${z} outside the pallet place`);
  }
  for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]])
    assert.ok(pts.some(([x, , z]) => Math.abs(x - cx) < 1e-9 && Math.abs(z - cz) < 1e-9), `corner ${cx},${cz} not marked`);
  for (let i = 0; i < g.n.length; i += 3) assert.deepEqual(g.n.slice(i, i + 3), [0, 1, 0]);
  // every triangle faces up
  for (let k = 0; k < g.i.length; k += 3) {
    const [a, b, c] = [g.i[k], g.i[k + 1], g.i[k + 2]].map(v => pts[v]);
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    assert.ok(up > 0, `triangle ${k / 3} faces down`);
  }
});

test("mod: the warning stripes are a trigger marker the game can turn off", () => {
  const p = hen(), xml = placeableXml(p, "x"), i3d = buildI3d(p);
  assert.match(xml, /<triggerMarker node="warningStripes01"\/>/);
  const node = resolve(sceneTree(i3d), mappings(xml).warningStripes01).node;
  assert.equal(node.name, "warningStripes01");
  assert.match(node.attrs, /terrainDecal="true"/);
  assert.match(node.attrs, /nonRenderable="true"/);
  // the base game's stripe texture, so nothing extra ships in the mod
  const mat = node.attrs.match(/materialIds="(\d+)"/)[1];
  const block = i3d.match(new RegExp(`<Material name="warningStripes_mat" materialId="${mat}">([\\s\\S]*?)</Material>`));
  assert.ok(block, "stripes material");
  for (const kind of ["diffuse", "normal", "specular"]) assert.match(i3d, new RegExp(`filename="\\$data/shared/warningStripes_${kind}\\.png"`));
  assert.doesNotMatch(buildI3d(sanitize({})), /warningStripes/, "houses have none");
});

/* ---------- Walk-in shell and door ---------- */
// Does the segment a-b cross any triangle of mesh g? (Möller–Trumbore.)
function hits(g, a, b) {
  const d = b.map((v, i) => v - a[i]);
  const sub = (x, y) => x.map((v, i) => v - y[i]), cross = (x, y) => [x[1]*y[2] - x[2]*y[1], x[2]*y[0] - x[0]*y[2], x[0]*y[1] - x[1]*y[0]];
  const dot = (x, y) => x[0]*y[0] + x[1]*y[1] + x[2]*y[2], P = k => [g.p[k*3], g.p[k*3+1], g.p[k*3+2]];
  for (let t = 0; t < g.i.length; t += 3) {
    const v0 = P(g.i[t]), e1 = sub(P(g.i[t+1]), v0), e2 = sub(P(g.i[t+2]), v0), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(a, v0), u = dot(s, h) / det; if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue;
    const k = dot(e2, q) / det; if (k > 0 && k < 1) return true;
  }
  return false;
}
const chickenPresets = () => PRESETS.filter(x => x.settings.kind === "chicken").map(x => [x.id, sanitize(x.settings)]);
const doorMid = (geo, p) => { const { w, ops } = geo.opsByWall[p.doorWall], o = ops.find(q => q.kind === "door"); return { w, o, s: (o.s0 + o.s1) / 2 }; };
const wp = (w, s, y, d) => [w.o[0] + w.u[0]*s + w.n[0]*d, y, w.o[2] + w.u[2]*s + w.n[2]*d];

test("shell: a chicken barn's walls have an inside face; a house's don't", () => {
  const inside = p => {
    // inside faces are whitewashed fittings in a chicken barn; a house could only have them as walls
    const geo = buildGeometry(p), g = p.kind === "chicken" ? geo.G.fittings : geo.G.walls, z = geo.dims.D / 2 - 0.15;
    let n = 0;
    for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k+2] - z) < 1e-6 && g.n[k+2] < -0.99) n++;
    return n;
  };
  assert.ok(inside(hen({ doorWall: "front" })) > 0, "chicken barn");
  assert.equal(inside(sanitize({ doorWall: "front" })), 0, "house");
});

test("shell: you can walk from the middle of a chicken barn out through the door, but not through a wall", () => {
  for (const [id, p] of chickenPresets()) {
    const geo = buildGeometry(p), F = p.foundation, { w, s } = doorMid(geo, p);
    const centre = [0, F + 1, 0], inside = wp(w, s, F + 1, -1);
    assert.ok(!hits(geo.collision, centre, inside), `${id}: blocked on the way to the door`);
    assert.ok(!hits(geo.collision, inside, wp(w, s, F + 1, 2)), `${id}: blocked in the doorway`);
    assert.ok(!hits(geo.collision, [0, F + 0.2, 0], [0, F + 1.9, 0]), `${id}: no headroom`);
    const back = geo.opsByWall[{ front: "back", back: "front", left: "right", right: "left" }[p.doorWall]].w;
    assert.ok(hits(geo.collision, centre, wp(back, back.L / 2, F + 1, 1)), `${id}: walked through the back wall`);
  }
  // houses stay solid
  const p = sanitize({}), geo = buildGeometry(p), { w, s } = doorMid(geo, p);
  assert.ok(hits(geo.collision, [0, p.foundation + 1, 0], wp(w, s, p.foundation + 1, 2)));
});

// i3d "0 a 0" rotation about the hinge (right-handed about +y).
const turn = (q, h, deg) => {
  const r = deg * Math.PI / 180, x = q[0] - h[0], z = q[2] - h[2];
  return [h[0] + x * Math.cos(r) + z * Math.sin(r), q[1], h[2] - x * Math.sin(r) + z * Math.cos(r)];
};
test("door: a chicken barn's door leaf swings outward about its hinge", () => {
  for (const doorWall of ["front", "back", "left", "right"]) {
    const p = hen({ doorWall, doorW: 1.2 }), geo = buildGeometry(p), leaf = geo.doorLeaf, { w } = doorMid(geo, p);
    assert.ok(leaf, doorWall);
    const out = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
    const pts = []; for (let k = 0; k < geo.G.door.p.length; k += 3) pts.push(geo.G.door.p.slice(k, k + 3));
    const open = pts.map(q => turn(q, leaf.hinge, leaf.openAngle));
    const mid = a => a.reduce((s, q) => s + out(q), 0) / a.length;
    assert.ok(mid(open) > 0.4, `${doorWall}: leaf only ${mid(open).toFixed(2)} m out when open`);
    assert.ok(Math.min(...open.map(out)) >= Math.min(...pts.map(out)) - 1e-6, `${doorWall}: swings into the barn`);
  }
});

test("mod: the door opens and closes with the game's door prompt", () => {
  const p = hen(), xml = placeableXml(p, "x"), i3d = buildI3d(p), geo = buildGeometry(p);
  assert.match(xml, /<animatedObject saveId="door1">/);
  assert.match(xml, /<part node="door1">\s*<keyFrame time="0" rotation="0 0 0"\/>\s*<keyFrame time="1" rotation="0 -100 0"\/>/);
  assert.match(xml, /<controls triggerNode="door1Trigger" posAction="ACTIVATE_HANDTOOL" posText="action_openDoor" negText="action_closeDoor"\/>/);
  assert.match(xml, /template="woodDoorOpen"/);
  const map = mappings(xml), tree = sceneTree(i3d);
  const door = resolve(tree, map.door1);
  near(door.pos, geo.doorLeaf.hinge, "door at its hinge");
  assert.equal(door.node.children.length, 1);
  assert.match(door.node.children[0].attrs, /kinematic="true"/);
  assert.match(door.node.children[0].attrs, /collisionFilterGroup="0x1034"/);
  const trig = resolve(tree, map.door1Trigger).node.attrs;
  assert.match(trig, /trigger="true"/);
  assert.match(trig, /collisionFilterMask="0x110000"/);
  // the leaf is not also in the static visuals
  const visuals = tree[0].children.find(n => n.name === "visuals");
  assert.ok(!visuals.children.some(n => n.name === "door"));
  // its mesh is relative to the hinge: first vertex + hinge = the closed door's first vertex
  const sid = door.node.attrs.match(/shapeId="(\d+)"/)[1];
  const set = i3d.match(new RegExp(`<IndexedTriangleSet name="[^"]*" shapeId="${sid}"[^>]*>[\\s\\S]*?<v p="([^"]+)"`));
  near(set[1].split(" ").map(Number).map((v, k) => v + geo.doorLeaf.hinge[k]), geo.G.door.p.slice(0, 3), "door mesh");
  assert.doesNotMatch(buildI3d(sanitize({})) + placeableXml(sanitize({}), "x"), /door1|animatedObject/, "houses keep a fixed door");
});

/* ---------- Windows and coop interior ---------- */
test("i3d: a walk-in barn's windows are see-through", () => {
  const i3d = buildI3d(hen()), glass = i3d.match(/<Material name="glass_mat"[^>]*>/)[0];
  assert.match(glass, /alphaBlending="true"/);
  assert.match(buildI3d(hen(), { withTex: true }), /<Material name="glass_mat"[^>]*alphaBlending="true"/);
});

test("coop: filling automatically picks a style that follows the barn's size", () => {
  const style = id => KIND.chicken.autoFurnish(sanitize(PRESETS.find(x => x.id === id).settings)).style;
  assert.equal(style("gardenCoop"), "backyard");
  assert.equal(style("longHenHouse"), "floor");
  assert.equal(style("poultryBarn"), "commercial");
  assert.equal(buildGeometry(sanitize({})).G.fittings.i.length, 0, "houses have no fittings");
  assert.equal("items" in sanitize({}), false, "houses have no pieces");
});

test("coop: every preset starts furnished, with every piece where it may be", () => {
  for (const [id, p] of chickenPresets()) {
    assert.ok(p.items.length >= 4, `${id}: ${p.items.length} pieces`);
    const pr = problems(p.items, KIND.chicken.catalog, roomOf(p));
    assert.deepEqual([...pr].map(([i, m]) => `${p.items.find(x => x.id === i).type}: ${m}`), [], id);
  }
});

test("coop: every kind of piece can be dropped into an empty barn and snaps to a good place", () => {
  const p = hen({ width: 10, depth: 8, items: [] }), room = roomOf(p);
  for (const [type, def] of Object.entries(KIND.chicken.catalog)) {
    assert.ok(def.name && ["wall", "floor"].includes(def.mount), type);
    const it = snapItem({ id: 1, type, x: -2.2, z: -1.4, rot: 0, ...def.defaults }, def, room);
    assert.equal(problems([it], KIND.chicken.catalog, room).size, 0, `${type} after snapping`);
    const g = buildGeometry({ ...p, items: [it] }).G.fittings;
    assert.ok(g.i.length > buildGeometry(p).G.fittings.i.length, `${type} draws something`);
  }
});

test("coop: the inside is built from the pieces, where they are", () => {
  const p = hen({ width: 8, depth: 6, items: [] });
  // pieces are drawn after the walls and floor, so their vertices come after the empty barn's
  const base = buildGeometry(p).G.fittings.p.length;
  const at = x => { const g = buildGeometry({ ...p, items: [{ id: 1, type: "bale", x, z: 0, rot: 0 }] }).G.fittings, xs = [];
    for (let k = base; k < g.p.length; k += 3) xs.push(g.p[k]); return xs; };
  const a = at(-1), b = at(1.5);
  assert.ok(Math.abs(Math.min(...b) - Math.min(...a) - 2.5) < 1e-6, "moved 2.5 m");
  // a piece left outside the walls (the barn was made smaller) isn't built
  assert.deepEqual(at(30), [], "outside: nothing built");
  // pieces with collision stop you; hanging feeders don't
  const col = items => buildGeometry({ ...p, items }).collision.i.length;
  assert.ok(col([{ id: 1, type: "bale", x: 0, z: 0, rot: 0 }]) > col([]), "bale");
  assert.equal(col([{ id: 1, type: "feeder", x: 0, z: 0, rot: 0 }]), col([]), "feeder");
});

test("coop: pieces survive saving and loading", () => {
  const p = sanitize(PRESETS.find(x => x.id === "longHenHouse").settings);
  const back = sanitize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back.items, p.items);
  // an empty list stays empty: the user cleared it
  assert.deepEqual(sanitize({ ...p, items: [] }).items, []);
});

test("coop: nests, perches, feeders and drinkers for the hens", () => {
  for (const [id, p] of chickenPresets()) {
    const c = KIND.chicken.summary(p.items);
    // about one nest per 5 hens (fewer if the wall is full), 20 cm of perch per hen (or as much as fits)
    assert.ok(c.nests >= 1 && c.nests <= Math.ceil(p.hens / 5), `${id}: ${c.nests} nests`);
    assert.ok(c.nests >= Math.min(Math.ceil(p.hens / 5), 12), `${id}: only ${c.nests} nests`);
    assert.ok(c.perch >= Math.min(p.hens * 0.2, 3), `${id}: only ${c.perch.toFixed(1)} m of perch`);
    assert.ok(c.feeders >= 1 && c.drinkers >= 1, id);
  }
});

test("coop: everything is inside the walls, on or above the floor, and the doorway is clear", () => {
  for (const [id, p] of chickenPresets()) {
    const geo = buildGeometry(p), g = geo.G.fittings, { W, D, ridgeY } = geo.dims, F = p.foundation, t = 0.15;
    for (let k = 0; k < g.p.length; k += 3) {
      const [x, y, z] = g.p.slice(k, k + 3);
      if (g.s[k / 3] === "boards" && g.n[k + 1] < -0.3) continue;   // the roof boards run out under the eaves
      assert.ok(Math.abs(x) <= W / 2 - t + 1e-6 && Math.abs(z) <= D / 2 - t + 1e-6, `${id}: ${x},${z} outside the room`);
      assert.ok(y >= F - 1e-6 && y <= ridgeY, `${id}: height ${y}`);
    }
    // nothing within 1 m inside the door, across the door's width, up to its top (the roof frame is above)
    const { w, o } = doorMid(geo, p);
    for (let k = 0; k < g.p.length; k += 3) {
      const q = g.p.slice(k, k + 3), s = (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
      // (boards flat against the wall, like the kickboard beside the door, don't block it)
      if (q[1] > F + 0.03 && q[1] < F + o.t1 && d > -1.15 && d < -t - 0.03) assert.ok(s < o.s0 - 0.3 || s > o.s1 + 0.3, `${id}: ${q} in the doorway`);
    }
  }
});

test("i3d: coop fittings export as plain colored parts", () => {
  const i3d = buildI3d(sanitize(PRESETS.find(x => x.id === "longHenHouse").settings));
  const fit = [...i3d.matchAll(/<Material name="(fittings\d*)_mat" materialId="\d+" diffuseColor="[^"]+"\/>/g)];
  assert.ok(fit.length >= 4, `${fit.length} fitting colors`);
  assert.match(i3d, /<Shape name="fittings"/);
});

/* ---------- Canopy, pasture side and hen hatch ---------- */
test("shell: an entrance canopy stays out of a walk-in barn's room", () => {
  for (const entrance of ["gable", "shed", "porch"]) for (const doorWall of ["front", "left"]) {
    // one floor, so the canopy reaches up to the eaves (as in the screenshot)
    const p = hen({ width: 6, depth: 5, entrance, doorWall, pastureWall: OPP[doorWall], roofPitch: 35, floors: 1, floorHeight: 2.6, foundation: 0.2 });
    const geo = buildGeometry(p), { W, D, top } = geo.dims, F = p.foundation, t = 0.15;
    for (const m of ["roof", "trim", "walls", "gutter"]) {
      const g = geo.G[m];
      for (let k = 0; k < g.p.length; k += 3) {
        const [x, y, z] = g.p.slice(k, k + 3);
        const inside = Math.abs(x) < W / 2 - t - 0.01 && Math.abs(z) < D / 2 - t - 0.01 && y > F + 0.01 && y < top - 0.01;
        assert.ok(!inside, `${entrance} canopy on ${doorWall}: ${m} at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)} inside the room`);
      }
    }
    // nor its collision: you can stand inside the door
    const { w, s } = doorMid(geo, p);
    assert.ok(!hits(geo.collision, wp(w, s, F + 0.2, -0.6), wp(w, s, F + 2.0, -0.6)), `${entrance}: collision over the doorway inside`);
  }
});

test("pasture side: never the people door's wall", () => {
  assert.equal(sanitize({ kind: "chicken", doorWall: "front", pastureWall: "left" }).pastureWall, "left");
  assert.equal(sanitize({ kind: "chicken", doorWall: "front", pastureWall: "front" }).pastureWall, "back");
  assert.equal(sanitize({ kind: "chicken", doorWall: "left", pastureWall: "left" }).pastureWall, "right");
  for (const x of PRESETS.filter(x => x.kind === "chicken")) assert.notEqual(sanitize(x.settings).pastureWall, sanitize(x.settings).doorWall, x.id);
});

test("hatch: a hen-sized opening at floor level in the middle of the pasture wall", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) {
    const p = hen({ width: 6, depth: 5, pastureWall, doorWall: OPP[pastureWall], foundation: 0.3 });
    const geo = buildGeometry(p), { w } = geo.opsByWall[pastureWall], F = p.foundation;
    const hatch = geo.opsByWall[pastureWall].ops.find(o => o.kind === "hatch");
    assert.ok(hatch, pastureWall);
    assert.equal(hatch.t0, 0, "at floor level");
    assert.ok(hatch.s1 - hatch.s0 >= 0.35 && hatch.t1 >= 0.4 && hatch.t1 <= 0.7, "hen sized");
    assert.ok(Math.abs((hatch.s0 + hatch.s1) / 2 - w.L / 2) < 1e-9, "in the middle");
    // through the hatch you see out; beside it is wall
    const seen = s => hits(geo.G.walls, wp(w, s, F + 0.2, -0.5), wp(w, s, F + 0.2, 0.5)) || hits(geo.G.fittings, wp(w, s, F + 0.2, -0.5), wp(w, s, F + 0.2, 0.5));
    assert.ok(!seen(w.L / 2), `${pastureWall}: the hatch is open`);
    assert.ok(seen(w.L / 2 + 0.6), `${pastureWall}: wall beside the hatch`);
  }
});

test("hatch: hens come out of the hatch into the fenced pasture; the people door is outside it", () => {
  // Is (x, z) inside the polygon of fence posts (closed along the barn's wall)?
  const inside = (poly, x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (const pastureWall of ["front", "back", "left", "right"]) for (const doorWall of ["front", "back", "left", "right"]) {
    if (doorWall === pastureWall) continue;
    for (const [width, depth] of [[4, 3], [9, 5], [20, 8]]) {
      const p = hen({ width, depth, pastureWall, doorWall, hens: 20 }), geo = buildGeometry(p), y = henYard(geo, p);
      const { w, ops } = geo.opsByWall[pastureWall], h = ops.find(o => o.kind === "hatch");
      const out = wp(w, (h.s0 + h.s1) / 2, 0, 0.5); // half a metre out of the hatch
      const what = `${width}x${depth}, pasture ${pastureWall}, door ${doorWall}`;
      assert.ok(inside(y.fence, out[0], out[2]), `${what}: the hatch opens outside the fence`);
      const d = doorMid(geo, p), front = wp(d.w, d.s, 0, 0.5);
      assert.ok(!inside(y.fence, front[0], front[2]), `${what}: the people door opens into the pasture`);
    }
  }
});

test("henYard: nothing is put in front of the people door", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) for (const doorWall of ["front", "back", "left", "right"]) {
    if (doorWall === pastureWall) continue;
    for (const [width, depth] of [[4, 3], [9, 5], [20, 8]]) {
      const p = hen({ width, depth, pastureWall, doorWall, hens: 20 }), geo = buildGeometry(p), y = henYard(geo, p);
      const { w, o } = doorMid(geo, p);
      // 40 cm either side of the door, 4 m out
      const a = wp(w, o.s0 - 0.4, 0, 0), b = wp(w, o.s1 + 0.4, 0, 4);
      const zone = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) };
      const rect = bx => ({ x0: bx.center[0] - bx.size[0] / 2, x1: bx.center[0] + bx.size[0] / 2, z0: bx.center[2] - bx.size[2] / 2, z1: bx.center[2] + bx.size[2] / 2 });
      const hit = r => r.x0 < zone.x1 && zone.x0 < r.x1 && r.z0 < zone.z1 && zone.z0 < r.z1;
      for (const [what, bx] of [["feed pad", y.food], ["pallets", y.pallet.trigger], ["trailer spot", y.loading]])
        assert.ok(!hit(rect(bx)), `${width}x${depth}, pasture ${pastureWall}, door ${doorWall}: ${what} in front of the door`);
    }
  }
});

test("coop: filling automatically works for every door and pasture side", () => {
  for (const pastureWall of ["front", "back", "left", "right"]) for (const doorWall of ["front", "back", "left", "right"]) {
    if (doorWall === pastureWall) continue;
    for (const [width, depth, hens] of [[4, 3, 30], [9, 5, 110], [20, 8, 360], [6, 4, 50]]) {
      const p = sanitize({ kind: "chicken", width, depth, hens, pastureWall, doorWall, floors: 1, floorHeight: 2.4 });
      const what = `${width}x${depth} ${hens} hens, pasture ${pastureWall}, door ${doorWall}`;
      const pr = problems(p.items, KIND.chicken.catalog, roomOf(p, KIND.chicken.openings(p)));
      assert.deepEqual([...pr].map(([i, m]) => `${p.items.find(x => x.id === i).type}: ${m}`), [], what);
      const c = KIND.chicken.summary(p.items);
      assert.ok(c.nests >= 1, `${what}: no nests`);
      assert.ok(c.perch >= Math.min(p.hens * 0.2, 2), `${what}: ${c.perch.toFixed(1)} m perch`);
      assert.ok(c.feeders >= 1 && c.drinkers >= 1, `${what}: feeders ${c.feeders}, drinkers ${c.drinkers}`);
    }
  }
});

test("layout: the hen hatch is kept clear inside, like the door", () => {
  const p = hen({ width: 6, depth: 5, pastureWall: "back", doorWall: "front", items: [] });
  const room = roomOf(p, KIND.chicken.openings(p));
  const pr = problems([{ id: 1, type: "bale", x: 0, z: room.z0 + 0.3, rot: 0 }], KIND.chicken.catalog, room);
  assert.match(pr.get(1) || "", /hatch/i);
});

test("i3d: a house still has no chicken nodes", () => {
  const xml = buildI3d(sanitize({}));
  assert.doesNotMatch(xml, /exactFillRootNodeFood|navigationRootNode|fence1Node/);
  assert.equal(DEFAULTS.kind, "house");
});
