// Cow barn: an FS25 cowHusbandryPasture (no milk, like the base game's small cow barn,
// data/placeables/brandless/animalHusbandries/cowBarnSmall) you can walk into. Cows graze in the
// pasture and eat and drink at troughs along the barn's pasture wall; feed and bales go in outside
// the fence, water is automatic. Swedish barn presets: a red ladugård, a small fähus, a lösdriftsstall.
// Imports only the i3d writer and the pure helpers; the core hands in the rest (see kinds/index.mjs).
import { tg, shape } from "../i3d.mjs";
import { roomOf, furnisher } from "../layout.mjs";
import { OPPOSITE, wallLength, yardFrame } from "./pasture.mjs";

/** About one cow per 6 m² of floor; at most 100 (the base game's biggest pasture barn takes 99). */
export const M2_PER_COW = 6;
export const MAX_COWS = 100;
/** Food storage per cow, in litres (the base game's cow barns hold about 1600-1700 l per cow). */
const FOOD_PER_COW = 1700;
/** Smallest starting pasture along the barn: cows need more room than hens. */
const MIN_PASTURE_WIDTH = 16;
export const cowCap = p => Math.max(1, Math.min(MAX_COWS, Math.floor(p.width * p.depth / M2_PER_COW + 1e-9)));
const cowsOf = p => Math.min(Math.round(p.cows), cowCap(p));

/* ---------- The doorway and the troughs ---------- */
/** The cows' doorway: an open 1.6 x 2.2 m opening in the middle of the pasture wall, kept clear 1.6 m inside. */
function openings(p) {
  const L = wallLength(p, p.pastureWall), h = Math.min(2.2, p.floors * p.floorHeight - 0.3);
  return [{wall: p.pastureWall, s0: L / 2 - 0.8, s1: L / 2 + 0.8, t1: h, clear: 1.6, what: "the cows' doorway", plain: true}];
}
// Troughs against the pasture wall, outside: feed on one side of the doorway, water on the other.
const TROUGH = {d0: 0.25, d1: 0.95, wall: 0.08, food: {top: 0.75, bottom: 0.45, min: 0.5, max: 0.7}, water: {top: 0.7, bottom: 0.4, min: 0.45, max: 0.62}};

/**
 * Where a cow barn's gameplay places are, from built geometry. All points in world space.
 *   fence:        as the hen house's (yardFrame), at least 16 m along the pasture wall
 *   feedTrough, waterTrough: {outer, inner (rects), top, bottom, planeMin, planeMax, plane: [x, z], size: [sx, sz]}
 *   foodPlaces, waterPlaces: [{pos, rot}] where cows stand to eat and drink, facing the trough
 *   food:         the feed pad (tip feed onto it) outside the fence; bales: where bales are dropped
 *   loading:      animal trailer spot further out on the feed side; info; blockers: kept out of the walking area
 *   markers:      {food, bales, animals, teleport}; areas: ground leveled for the troughs and the pad
 */
export function cowYard(geo, p) {
  const {fence, past, feed: fw, at, boxAt, rectOf, clear} = yardFrame(geo, p, MIN_PASTURE_WIDTH);
  const L = past.L, [o0, o1] = [L / 2 - 0.8, L / 2 + 0.8];
  const sides = [[0.4, o0 - 0.5], [o1 + 0.5, L - 0.4]].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const n = cowsOf(p);
  const trough = (range, kind, length) => {
    const [a, b] = range, len = Math.max(0.8, Math.min(b - a, length)), s0 = (a + b) / 2 - len / 2, s1 = s0 + len, c = TROUGH[kind];
    const box = (sA, sB, dA, dB, h) => ({...boxAt(past, (sA + sB) / 2, (dA + dB) / 2, sB - sA, dB - dA, h)});
    const outer = box(s0, s1, TROUGH.d0, TROUGH.d1, c.top), innerB = box(s0 + TROUGH.wall, s1 - TROUGH.wall, TROUGH.d0 + TROUGH.wall, TROUGH.d1 - TROUGH.wall, c.top);
    return {s0, s1, outer: rectOf(outer), inner: rectOf(innerB), top: c.top, bottom: c.bottom, planeMin: c.min, planeMax: c.max,
      plane: [innerB.center[0], innerB.center[2]], size: [innerB.size[0], innerB.size[2]], box: outer};
  };
  const feedTrough = trough(sides[0], "food", Math.max(2, n * 0.6)), waterTrough = trough(sides[1], "water", 2);
  // A cow at a trough faces it: its +z points back at the wall.
  const facing = Math.atan2(-past.n[0], -past.n[2]) * 180 / Math.PI;
  const along = t => { const k = Math.max(1, Math.floor((t.s1 - t.s0) / 1.4)); return Array.from({length: k}, (_, i) => t.s0 + (i + 0.5) * (t.s1 - t.s0) / k); };
  const foodPlaces = along(feedTrough).map(s => ({pos: at(past, s, 1.7), rot: facing}));
  const waterPlaces = along(waterTrough).map(s => ({pos: at(past, s, 1.6), rot: facing}));
  // Feed pad and bales outside the fence on the feed side; the trailer spot further out.
  const [fa, fb] = clear(fw), fc = (fa + fb) / 2;
  const food = boxAt(fw, fc, 1.75, Math.max(2.5, Math.min(4, fb - fa)), 3, 0.3);
  const bales = boxAt(fw, fc, 1.75, Math.max(2.5, Math.min(4, fb - fa)), 3, 2.5);
  const loading = boxAt(fw, fc, 5.5, Math.min(4, fb - fa), 4, 3);
  const {W, D} = geo.dims;
  return {
    fence, feedTrough, waterTrough, foodPlaces, waterPlaces, food, bales, loading,
    info: {center: [0, 1.5, 0], size: [W + 2, 3, D + 2]},
    blockers: [{center: [0, 1, 0], size: [W, 2, D]}, feedTrough.box, waterTrough.box],
    markers: {food: at(fw, fc - 0.8, 1.75), bales: at(fw, fc + 0.8, 1.75), animals: at(fw, fc, 5.5), teleport: at(fw, fc, 8.5)},
    areas: [food, feedTrough.box, waterTrough.box].map(rectOf),
  };
}

/** The troughs, drawn outside the walls (c: {p, geo, abox, paint} from the core). The fill planes are separate i3d nodes. */
function outside(c) {
  const y = cowYard(c.geo, c.p);
  c.paint(COLORS.concrete);
  for (const t of [y.feedTrough, y.waterTrough]) {
    const o = t.outer, i = t.inner;
    c.abox("fittings", [o.x0, 0, o.z0], [o.x1, t.bottom, o.z1]);                 // the base, up to the trough's floor
    for (const [a, b] of [[[o.x0, o.z0], [i.x0, o.z1]], [[i.x1, o.z0], [o.x1, o.z1]], [[i.x0, o.z0], [i.x1, i.z0]], [[i.x0, i.z1], [i.x1, o.z1]]])
      c.abox("fittings", [a[0], t.bottom, a[1]], [b[0], t.top, b[1]]);          // its four sides
    c.abox("collision", [o.x0, 0, o.z0], [o.x1, t.top, o.z1]);
  }
}

/* ---------- Inside ---------- */
const COLORS = {concrete: "#9A968C", floor: "#8A857B", rubber: "#2E2E2C", steel: "#A9AFB3", wood: "#A47A4E", straw: "#DDBF73", hay: "#B7B064", bale: "#D9BC6A"};
/** The floor: concrete over the whole room. */
function furnish(c) { c.floor(COLORS.floor); }

/** Thin steel tube along x, y or z between two points of the piece's frame (as a slim box). */
const bar = (c, [x0, y0, z0], [x1, y1, z1], r = 0.025) =>
  c.box(Math.min(x0, x1) - r, Math.max(x0, x1) + r, Math.min(z0, z1) - r, Math.max(z0, z1) + r, Math.min(y0, y1), Math.max(y0, y1) + (y0 === y1 ? 2 * r : 0));
const stallDepth = 2.3;
const CATALOG = {
  stalls: {name: "Cubicles (liggbås)", mount: "wall", collision: true,
    params: [{k: "count", label: "Cubicles", min: 1, max: 24, step: 1}], defaults: {count: 6},
    size: it => [it.count * 1.2, stallDepth], height: () => 1.25,
    build(c, it) {
      const w = it.count * 1.2, z0 = -stallDepth / 2;
      c.paint(COLORS.rubber); c.box(-w / 2, w / 2, z0, z0 + 2.1, 0, 0.12);                 // the raised, matted bed
      c.paint(COLORS.steel);
      for (let i = 0; i <= it.count; i++) {
        const x = Math.max(-w / 2 + 0.03, Math.min(w / 2 - 0.03, -w / 2 + i * 1.2));
        bar(c, [x, 0.12, z0 + 0.3], [x, 1.15, z0 + 0.3]);                                  // post at the back
        bar(c, [x, 1.1, z0 + 0.3], [x, 1.1, z0 + 1.7]);                                    // top rail of the loop
        bar(c, [x, 0.45, z0 + 0.5], [x, 0.45, z0 + 1.6]);                                  // lower rail
        bar(c, [x, 0.12, z0 + 1.7], [x, 1.1, z0 + 1.7]);                                   // front leg
      }
      bar(c, [-w / 2, 1.15, z0 + 1.2], [w / 2, 1.15, z0 + 1.2]);                           // neck rail along the row
    }},
  feedfence: {name: "Feeding fence (foderhäck)", mount: "floor", collision: true,
    params: [{k: "length", label: "Length", min: 2, max: 30, step: 0.1, unit: " m"}], defaults: {length: 6},
    size: it => [it.length, 0.5], height: () => 1.3,
    build(c, it) {
      const L = it.length;
      c.paint(COLORS.concrete); c.box(-L / 2, L / 2, -0.25, 0.25, 0, 0.25);                // the feed curb
      c.paint(COLORS.steel);
      for (let x = -L / 2 + 0.05; x < L / 2; x += 0.7) bar(c, [x, 0.25, 0], [x, 1.25, 0]);   // head bars
      bar(c, [-L / 2, 1.25, 0], [L / 2, 1.25, 0]); bar(c, [-L / 2, 0.55, 0], [L / 2, 0.55, 0]);
    }},
  calfpen: {name: "Calf pen (kalvbox)", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [2.4, 2], height: () => 1.1,
    build(c) {
      c.paint(COLORS.straw); c.box(-1.2, 1.2, -1, 1, 0, 0.04);
      c.paint(COLORS.wood);
      for (const y of [0.3, 0.6, 0.9]) {
        c.box(-1.2, 1.2, -1, -0.95, y, y + 0.12); c.box(-1.2, 1.2, 0.95, 1, y, y + 0.12);
        c.box(-1.2, -1.15, -1, 1, y, y + 0.12); c.box(1.15, 1.2, -1, 1, y, y + 0.12);
      }
      for (const x of [-1.2, 1.12]) for (const z of [-1, 0.92]) c.box(x, x + 0.08, z, z + 0.08, 0, 1.1);
    }},
  hayrack: {name: "Hay rack (höhäck)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.6, 0.6], height: () => 1.7,
    build(c) {
      c.paint(COLORS.wood);
      c.box(-0.8, 0.8, -0.3, 0.15, 0.6, 0.72);                                             // the trough under it
      for (let x = -0.75; x <= 0.75; x += 0.15) c.box(x - 0.02, x + 0.02, 0.1, 0.15, 0.72, 1.6);
      c.box(-0.8, 0.8, 0.08, 0.17, 1.58, 1.68);
      for (const x of [-0.8, 0.74]) c.box(x, x + 0.06, -0.3, 0.17, 0, 1.68);
      c.paint(COLORS.hay); c.box(-0.75, 0.75, -0.28, 0.09, 0.72, 1.35);
    }},
  waterbowl: {name: "Water bowl (vattenkopp)", mount: "wall", params: [], defaults: {},
    size: () => [0.4, 0.35], height: () => 0.8,
    build(c) {
      c.paint(COLORS.steel);
      c.box(-0.05, 0.05, -0.175, -0.1, 0.5, 0.8);                                          // bracket on the wall
      c.cyl(0, 0.02, 0.55, 0.15, 0.13);                                                    // the bowl
    }},
  bale: {name: "Straw bale", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [0.9, 0.5], height: () => 0.4,
    build(c) { c.paint(COLORS.bale); c.box(-0.45, 0.45, -0.25, 0.25, 0, 0.4); }},
};

/**
 * Fills the inside to match the barn's size and cows, in the free space: rows of cubicles (one per
 * cow) along the longest free walls, a feeding fence down the middle of a bigger barn (hay racks in
 * a small fähus), water bowls (one per 10 cows), a calf pen and a couple of straw bales.
 * Returns {style, items}.
 */
function autoFurnish(p) {
  const room = roomOf(p, openings(p)), n = cowsOf(p), f = furnisher(room, CATALOG), {items} = f;
  const style = n <= 10 ? "fahus" : n <= 40 ? "ladugard" : "losdrift";
  let placed = 0;
  for (let k = 0; k < 6 && placed < n; k++) {
    const s = f.longest(room.walls, stallDepth);
    if (!s || s.len < 1.3) break;
    const count = Math.min(24, Math.floor((s.len - 0.1) / 1.2), n - placed);
    f.onWall(s, "stalls", {count});
    placed += count;
  }
  let fed = false;
  if (style !== "fahus") {
    const alongX = room.x1 - room.x0 >= room.z1 - room.z0, c = alongX ? (room.z0 + room.z1) / 2 : (room.x0 + room.x1) / 2;
    const line = f.freeLine(c, alongX, 0.7), length = line ? Math.min(30, Math.floor((line[1] - line[0] - 0.4) * 10) / 10) : 0;
    if (length >= 2) { f.add("feedfence", alongX ? (line[0] + line[1]) / 2 : c, alongX ? c : (line[0] + line[1]) / 2, alongX ? 0 : 90, {length}); fed = true; }
  }
  if (!fed) for (let k = 0; k < Math.max(1, Math.ceil(n / 6)); k++) { const s = f.longest(room.walls, 0.6); if (s && s.len >= 1.7) f.onWall(s, "hayrack", {}); }
  for (let k = 0; k < Math.min(4, Math.max(1, Math.ceil(n / 10))); k++) { const s = f.longest(room.walls, 0.35); if (s && s.len >= 0.5) f.onWall(s, "waterbowl", {}); }
  f.onFloor("calfpen");
  f.onFloor("bale"); f.onFloor("bale");
  return {style, items};
}

/* ---------- Export ---------- */
const quad = (sx, sz) => ({p: [-sx/2, 0, -sz/2, -sx/2, 0, sz/2, sx/2, 0, sz/2, sx/2, 0, -sz/2], n: [0,1,0, 0,1,0, 0,1,0, 0,1,0], uv: [0,0, 0,1, 1,1, 1,0], i: [0, 1, 2, 0, 2, 3]});
/** Scene nodes and placeable XML for the pasture (c: export context from the core). */
function scene(c) {
  const {p, geo, doc} = c, y = cowYard(geo, p), n = cowsOf(p);
  const forage = doc.material("forage_mat", {diffuseColor: "0.42 0.45 0.2 1"}), water = doc.material("water_mat", {diffuseColor: "0.22 0.36 0.45 1"});
  const plane = (name, t, mat) => shape(name, {translation: [t.plane[0], t.planeMax, t.plane[1]], shapeId: doc.shape(name, quad(...t.size)), castsShadows: false, receiveShadows: true, materialIds: mat});
  const places = (group, name, list) => tg(group, [0, 0, 0], list.map((q, i) => tg(`${name}${i + 1}`, q.pos, [], {rotation: [0, q.rot, 0]})));
  const blocker = (b, i) => c.box(i ? `navmeshBlocker${i + 1}` : "navmeshBlocker", b, {static: true, collisionFilterGroup: "0x800000", collisionFilterMask: "0x1", buildNavMeshMask: "0xfe"});
  const nodes = [tg("cowFeatures", [0, 0, 0], [
    // Solid, not a trigger: unloading finds it with a raycast. It only collides with triggers.
    c.box("exactFillRootNodeFood", y.food, {static: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("markerFood", y.markers.food),
    c.box("baleTrigger", y.bales, c.trigger("0x20000000", "0x40000")),
    tg("markerBales", y.markers.bales),
    c.box("loadingTrigger", y.loading, c.trigger("0x20000000", "0x110000")),
    tg("markerAnimals", y.markers.animals),
    c.box("infoTrigger", y.info, c.trigger("0x20000000", "0x110000")),
    tg("teleportNode", y.markers.teleport),
    plane("foodPlane", y.feedTrough, forage),
    places("foodPlaces", "foodPlace", y.foodPlaces),
    plane("waterPlane", y.waterTrough, water),
    places("waterPlaces", "waterPlace", y.waterPlaces),
    // Like the base game's cow barn: the barn and troughs are cut out of the walking area made from the fence.
    tg("navigationRootNode", [0, 0, 0], y.blockers.map(blocker)),
    tg("fence1", [0, 0, 0], y.fence.map((q, i) => tg(`fence1Node${i + 1}`, q))),
  ])];
  const t = y.feedTrough, w = y.waterTrough;
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerFood" filename="$data/shared/assets/marker/markerIconFood.i3d" adjustToGround="true"/>
        <triggerMarker node="markerAnimals" filename="$data/shared/assets/marker/markerIconAnimals.i3d" adjustToGround="true"/>
        <triggerMarker node="markerBales" filename="$data/shared/assets/marker/markerIconBales.i3d" adjustToGround="true"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="COW" teleportNode="teleportNode"/>
    </hotspots>

    <infoTrigger triggerNode="infoTrigger"/>

    <husbandry saveId="Animals_COW" hasStatistics="false">
        <!-- The walking area is made from the fence when the barn is placed; the barn and troughs are blocked out. -->
        <animals type="COW" baseMaxNumAnimals="${n}" maxNumAnimals="${n}">
            <navigation rootNode="navigationRootNode"/>
            <loadingTrigger node="loadingTrigger"/>
        </animals>
        <food capacity="${n * FOOD_PER_COW}">
            <foodPlaces>
${y.foodPlaces.map((_, i) => `                <foodPlace node="foodPlace${i + 1}"/>`).join("\n")}
            </foodPlaces>
            <foodPlane node="foodPlane" minY="${t.planeMin}" maxY="${t.planeMax}" changeVisibility="true" defaultFillType="FORAGE"/>
            <unloadTrigger exactFillRootNode="exactFillRootNodeFood"/>
            <baleTrigger triggerNode="baleTrigger" deleteLitersPerSecond="200"/>
        </food>
        <water automaticWaterSupply="true">
            <waterPlane node="waterPlane" minY="${w.planeMin}" maxY="${w.planeMax}"/>
            <waterPlaces>
${y.waterPlaces.map((_, i) => `                <waterPlace node="waterPlace${i + 1}"/>`).join("\n")}
            </waterPlaces>
        </water>
        <fence xmlFilename="$data/placeables/brandless/fences/husbandries/cowFence/cowFence.xml">
            <sections>
                <section segmentId="SEGMENT" customizable="true">
${y.fence.map((_, i) => `                    <node node="fence1Node${i + 1}"/>`).join("\n")}
                </section>
            </sections>
        </fence>
        <meadow>
            <fruitType name="GRASS" eatableStartGrowthState="greenMiddle" eatableEndGrowthState="harvestReady" eatenGrowthState="greenSmall"/>
            <fruitType name="MEADOW" eatableStartGrowthState="greenMiddle" eatableEndGrowthState="harvestReady" eatenGrowthState="greenSmall"/>
            <createTask weedState="0">
                <fruit type="MEADOW" growthState="greenSmall"/>
                <ground type="NONE"/>
                <terrainGroundType name="grass"/>
            </createTask>
        </meadow>
    </husbandry>
`;
  return {nodes, xml, areas: y.areas};
}

/* ---------- The kind ---------- */
const swedishRed = {wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8"};
export default {
  id: "cow",
  name: "Cow barn",
  plural: "Cow barns",
  category: "animals",
  walkIn: true,
  defaults: {cows: 12, pastureWall: "back", fenceDepth: 15},
  sections: [
    {title: "Cows", side: "build", hint: "Cows graze in the pasture and come in through a wide doorway in the pasture side; they eat and drink at troughs along that wall. Fill feed (or drop bales) at the feed place outside the fence; water is automatic. The fence starts at least 16 m wide, and you can drag it to any shape when placing the barn in the game. This is a barn without milking (like the game’s small cow barn).", fields: [
      {k: "cows", label: "Cows", min: 1, max: MAX_COWS, step: 1},
      {k: "pastureWall", label: "Pasture side (with the cows’ doorway)", type: "select", options: [["front", "Front"], ["back", "Back"], ["left", "Left side"], ["right", "Right side"]]},
      {k: "fenceDepth", label: "Pasture depth, from the wall", min: 10, max: 60, step: 0.5, unit: " m"}]},
  ],
  hides: ["Interior", "Farmhouse", "Kupor (dormers)"],
  /**
   * Settings as this kind uses them: no sleep point, rooms or dormers; at least 6 x 6 m (troughs on
   * both sides of the doorway); no more cows than fit; the pasture never on the people door's wall.
   */
  normalize: p => {
    const q = {...p, sleepPoint: false, interior: false, dormers: [], width: Math.max(6, p.width), depth: Math.max(6, p.depth)};
    return {...q, cows: Math.min(q.cows, cowCap(q)), pastureWall: q.pastureWall === q.doorWall ? OPPOSITE[q.doorWall] : q.pastureWall};
  },
  openings,
  placeable: () => ({type: "cowHusbandryPasture",
    fn: ["$l10n_function_animalPenCow", "$l10n_ui_construction_cowBarnNoMilk", "$l10n_function_adjustableMeadow"],
    shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "cows"},
    note: `Cow barn: use <placeable type="cowHusbandryPasture" ...>, as in the base game's small cow barn.`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m cow barn for ${cowsOf(p)} cows, made with House to i3d.`,
  furnish,
  outside,
  catalog: CATALOG,
  autoFurnish,
  scene,
  presets: [
    {id: "ladugard", name: "Röd ladugård", blurb: "16 × 9 m red Swedish barn for 20 cows: falu red boards, white trim, a fieldstone base and lanterns on the ridge.", settings: {
      cows: 20, pastureWall: "back", fenceDepth: 18, ...swedishRed,
      width: 16, depth: 9, floors: 1, floorHeight: 3.2, foundation: 0.6, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 40, overhang: 0.5,
      roofMaterial: "tiles", roofColor: "#2F2F2F", chimney: false, gutters: true, downpipes: 2, ventilators: 2,
      winFront: 6, winBack: 6, winLeft: 1, winRight: 0, winW: 0.8, winH: 0.6, sill: 1.5,
      doorWall: "left", doorPos: 0, doorW: 2.4, doorH: 2.6, doorColor: "#5B1E16", entrance: "none",
      modPrice: 45000, modUpkeep: 120}},
    {id: "fahus", name: "Fähus", blurb: "8 × 6 m small cowshed for 6 cows, red boards and a red tile roof.", settings: {
      cows: 6, pastureWall: "back", fenceDepth: 14, ...swedishRed, wallColor: "#7A2418",
      width: 8, depth: 6, floors: 1, floorHeight: 2.6, foundation: 0.4, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 30, overhang: 0.4,
      roofMaterial: "tiles", roofColor: "#7A2E1F", chimney: false, gutters: false, downpipes: 0, ventilators: 0,
      winFront: 2, winBack: 0, winLeft: 1, winRight: 1, winW: 0.7, winH: 0.5, sill: 1.4,
      doorWall: "front", doorPos: -0.5, doorW: 1.2, doorH: 2.1, doorColor: "#F2EFE8", entrance: "none",
      modPrice: 15000, modUpkeep: 40}},
    {id: "losdriftsstall", name: "Lösdriftsstall", blurb: "30 × 16 m modern loose-housing barn for 70 cows, a low metal roof and lanterns along the ridge.", settings: {
      cows: 70, pastureWall: "front", fenceDepth: 30,
      wallCladding: "lockpanel", wallColor: "#A8A398", trimColor: "#3B3F42",
      width: 30, depth: 16, floors: 1, floorHeight: 3.6, foundation: 0.3, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 4,
      winFront: 8, winBack: 8, winLeft: 0, winRight: 0, winW: 1.4, winH: 0.6, sill: 1.5,
      doorWall: "right", doorPos: 0, doorW: 2.5, doorH: 2.6, doorColor: "#3B3F42", entrance: "none",
      modPrice: 140000, modUpkeep: 300}},
  ],
};
