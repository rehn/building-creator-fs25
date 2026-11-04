// Chicken barn: an FS25 chickenHusbandryPasture you can walk into, modelled on the base game's
// chicken barns (data/placeables/rudolfHormann/chickenBarnBig is the 360-hen one).
// Imports only the i3d writer; the core hands in what it needs (see kinds/index.mjs).
import { tg, shape } from "../i3d.mjs";
import { roomOf, furnisher } from "../layout.mjs";
import { OPPOSITE, wallLength, yardFrame } from "./pasture.mjs";

/** Floor space per hen, as in the base game's 360-hen barn (about 2.2 per m², rounded up). */
export const HENS_PER_M2 = 2.5;
export const MAX_HENS = 360;
/** Feed storage per hen, in litres (the base game's chicken barns hold about 25 l per hen). */
const FEED_PER_HEN = 25;
export const henCap = p => Math.max(1, Math.min(MAX_HENS, Math.floor(HENS_PER_M2 * p.width * p.depth + 1e-9)));
const hensOf = p => Math.min(Math.round(p.hens), henCap(p));

/** Smallest starting pasture, like the base game's smallest (about 12 m along the barn, 6 m deep). */
const MIN_PASTURE_WIDTH = 12;

/**
 * Where a chicken barn's gameplay places are, from built geometry. All points in world space.
 *   fence:   posts on the ground from one corner of the pasture wall, out fenceDepth, across and back
 *            to the other corner (the base game's winding); 6 posts when the pasture is wider than
 *            the wall, so the fence runs back along the wall line. The player can reshape it.
 *   food:    feed pad {center, size}, low on the ground beside one of the other walls; marker on it
 *   pallet:  egg pallet spawn lines (2, [start, end]) and their trigger box, beside another one
 *   loading: animal trailer trigger box further out on the feed side; marker; teleport spot beyond
 *   info:    box around the barn; blocker: the barn's footprint, kept out of the walking area
 *   areas:   ground rectangles of the food and pallet places, for clearing and leveling
 * The feed and pallet sides are two of the three walls that aren't the pasture's, never the people
 * door's: the wall opposite the pasture for feed if it's free, else a side wall.
 */
export function henYard(geo, p) {
  // The game can't make a walking area for a tiny pasture (a 6 x 4.4 m one failed): at least 12 m wide.
  const {fence, feed: fw, other: pw, at, boxAt, rectOf, clear} = yardFrame(geo, p, MIN_PASTURE_WIDTH);
  // Feed pad: low on the ground, so a tipping trailer's or auger's raycast starts above it. The
  // trailer spot is further out on the same side.
  const [fa, fb] = clear(fw), fc = (fa + fb) / 2;
  const food = boxAt(fw, fc, 1.75, Math.max(2.5, Math.min(4, fb - fa)), 3, 0.3);
  const loading = boxAt(fw, fc, 5.5, Math.min(4, fb - fa), 4, 3);
  const [pa, pb] = clear(pw), pc = (pa + pb) / 2;
  const len = Math.min(4.8, Math.max(1.2, pb - pa - 1));
  const lines = [2, 3.6].map(d => [at(pw, pc - len / 2, d), at(pw, pc + len / 2, d)]);
  const palletTrigger = boxAt(pw, pc, 2.8, Math.min(len + 1, pb - pa), 3.2, 2.5);
  const {W, D} = geo.dims;
  return {
    fence,
    food: {...food, marker: at(fw, fc, 1.75)},
    pallet: {lines, trigger: palletTrigger, stripes: cornerStripes(rectOf(palletTrigger))},
    loading: {...loading, marker: at(fw, fc, 5.5), teleport: at(fw, fc, 8.5)},
    info: {center: [0, 1.5, 0], size: [W + 2, 3, D + 2]},
    blocker: {center: [0, 1, 0], size: [W, 2, D]},
    areas: [food, palletTrigger].map(rectOf),
  };
}

/** The hen hatch: 40 x 50 cm at floor level in the middle of the pasture wall, kept clear 80 cm inside. */
function openings(p) {
  const L = (p.pastureWall === "front" || p.pastureWall === "back") ? p.width : p.depth;
  return [{wall: p.pastureWall, s0: L / 2 - 0.2, s1: L / 2 + 0.2, t1: 0.5, clear: 0.8, what: "the hen hatch"}];
}

/**
 * Warning stripes: an L-shaped mark (two flat arms, up to 1 m long and 0.25 m wide) in each corner
 * of the ground rectangle r, facing up. UVs in metres: the stripe texture tiles once per metre.
 */
function cornerStripes(r, arm = 1, w = 0.25) {
  const g = {p: [], n: [], uv: [], i: []};
  const quad = (xa, xb, za, zb) => {
    const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)], [z0, z1] = [Math.min(za, zb), Math.max(za, zb)], base = g.p.length / 3;
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) { g.p.push(x, 0, z); g.n.push(0, 1, 0); g.uv.push(x, z); }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const ax = Math.min(arm, (r.x1 - r.x0) / 2), az = Math.min(arm, (r.z1 - r.z0) / 2);
  for (const [cx, sx] of [[r.x0, 1], [r.x1, -1]]) for (const [cz, sz] of [[r.z0, 1], [r.z1, -1]]) {
    quad(cx, cx + sx * ax, cz, cz + sz * w);          // arm along x, including the corner square
    quad(cx, cx + sx * w, cz + sz * w, cz + sz * az); // arm along z
  }
  return g;
}

/* ---------- Interior ---------- */
const COOP = {litter: "#B8935A", straw: "#DDBF73", bale: "#D9BC6A", wood: "#A47A4E", dark: "#4A3422", metal: "#A3A9AD", pipe: "#C9CED2", red: "#B8382C"};

/** The floor: litter over the whole room. c: {floor(color)} from the core. */
function furnish(c) { c.floor(COOP.litter); }

/**
 * The pieces a hen house can have (see layout.mjs for what a catalog entry is). build(c, it) draws
 * in the piece's own frame: c.box(x0, x1, z0, z1, y0, y1) and c.cyl(x, z, y, r, h, seg) with y up
 * from the floor, c.paint(color), and c.H, the wall height (hanging things go up to it).
 */
const nestDepth = 0.6, perchReach = tiers => 0.25 + 0.3 * (tiers - 1) + 0.05;
const CATALOG = {
  nests: {name: "Nest boxes", mount: "wall", collision: true,
    params: [{k: "count", label: "Boxes per row", min: 1, max: 30, step: 1}, {k: "tiers", label: "Rows", min: 1, max: 3, step: 1}],
    defaults: {count: 6, tiers: 1},
    size: it => [it.count * 0.35, nestDepth], height: it => 0.5 + it.tiers * 0.42,
    build(c, it) {
      const w = it.count * 0.35, xA = -w / 2, xB = w / 2, zb = -nestDepth / 2;
      for (let k = 0; k < it.tiers; k++) {
        const yb = 0.5 + k * 0.42;
        c.paint(COOP.wood);
        c.box(xA, xB, zb, zb + 0.4, yb, yb + 0.02);               // floor board
        c.box(xA, xB, zb, zb + 0.42, yb + 0.35, yb + 0.37);       // top board
        c.box(xA, xB, zb + 0.4, zb + 0.42, yb, yb + 0.1);         // front lip
        for (let i = 0; i <= it.count; i++) { const x = xA + i * 0.35; c.box(Math.max(xA, x - 0.01), Math.min(xB, x + 0.01), zb, zb + 0.4, yb, yb + 0.35); }
        c.box(xA, xB, zb + 0.55, zb + 0.6, yb - 0.12, yb - 0.07); // landing bar
        if (k === 0) for (const x of [xA, xB - 0.05]) c.box(x, x + 0.05, zb + 0.55, zb + 0.6, 0, yb - 0.07);
        c.paint(COOP.dark); c.box(xA, xB, zb, zb + 0.01, yb + 0.02, yb + 0.35);
        c.paint(COOP.straw); c.box(xA + 0.01, xB - 0.01, zb + 0.02, zb + 0.38, yb + 0.02, yb + 0.06);
      }
    }},
  perch: {name: "Perch ladder", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 0.6, max: 12, step: 0.1, unit: " m"}, {k: "tiers", label: "Bars", min: 2, max: 4, step: 1}],
    defaults: {length: 2, tiers: 3},
    size: it => [it.length, perchReach(it.tiers)], height: it => 0.45 + 0.3 * (it.tiers - 1),
    build(c, it) {
      const L = it.length, d = perchReach(it.tiers), n = Math.floor(L / 1.5);
      const posts = [-L / 2, ...Array.from({length: n}, (_, i) => -L / 2 + (i + 1) * L / (n + 1)), L / 2 - 0.05];
      c.paint(COOP.wood);
      for (let k = 0; k < it.tiers; k++) {
        const y = 0.45 + 0.3 * k, z = -d / 2 + 0.25 + 0.3 * (it.tiers - 1 - k);
        c.box(-L / 2, L / 2, z - 0.025, z + 0.025, y - 0.05, y);
        for (const x of posts) c.box(x, x + 0.05, z - 0.025, z + 0.025, 0, y - 0.05);
      }
    }},
  feeder: {name: "Tube feeder", mount: "floor", params: [], defaults: {},
    size: () => [0.4, 0.4], height: () => 0.7,
    build(c) {
      c.paint(COOP.metal); c.cyl(0, 0, 0.12, 0.2, 0.07); c.cyl(0, 0, 0.19, 0.1, 0.45);
      c.paint(COOP.red); c.cyl(0, 0, 0.64, 0.12, 0.04);
      c.paint(COOP.metal); c.cyl(0, 0, 0.68, 0.005, c.H - 0.68, 4);
    }},
  drinker: {name: "Bell drinker", mount: "floor", params: [], defaults: {},
    size: () => [0.36, 0.36], height: () => 0.5,
    build(c) {
      c.paint(COOP.red); c.cyl(0, 0, 0.15, 0.18, 0.08); c.cyl(0, 0, 0.23, 0.06, 0.25);
      c.paint(COOP.metal); c.cyl(0, 0, 0.48, 0.005, c.H - 0.48, 4);
    }},
  trough: {name: "Feeder trough", mount: "floor",
    params: [{k: "length", label: "Length", min: 1, max: 30, step: 0.1, unit: " m"}], defaults: {length: 4},
    size: it => [it.length, 0.2], height: () => 0.4,
    build(c, it) {
      const L = it.length;
      c.paint(COOP.metal); c.box(-L / 2, L / 2, -0.08, 0.08, 0.25, 0.37);
      for (let x = -L / 2 + 0.2; x < L / 2; x += 3) c.box(x, x + 0.01, -0.005, 0.005, 0.37, c.H);
      c.paint(COOP.straw); c.box(-L / 2, L / 2, -0.06, 0.06, 0.37, 0.375);
    }},
  nipples: {name: "Nipple drinker line", mount: "floor",
    params: [{k: "length", label: "Length", min: 1, max: 30, step: 0.1, unit: " m"}], defaults: {length: 4},
    size: it => [it.length, 0.1], height: () => 0.55,
    build(c, it) {
      const L = it.length;
      c.paint(COOP.pipe); c.box(-L / 2, L / 2, -0.02, 0.02, 0.5, 0.54);
      for (let x = -L / 2 + 0.2; x < L / 2; x += 3) c.box(x, x + 0.01, -0.005, 0.005, 0.54, c.H);
      c.paint(COOP.red); for (let x = -L / 2 + 0.3; x < L / 2 - 0.1; x += 0.6) c.box(x - 0.03, x + 0.03, -0.03, 0.03, 0.44, 0.5);
    }},
  bale: {name: "Straw bale", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [0.9, 0.5], height: () => 0.4,
    build(c) { c.paint(COOP.bale); c.box(-0.45, 0.45, -0.25, 0.25, 0, 0.4); }},
};

/** What the pieces add up to: nest boxes, metres of perch, feeders and drinkers. */
function summary(items) {
  const sum = (type, f) => items.filter(it => it.type === type).reduce((s, it) => s + f(it), 0);
  return {nests: sum("nests", it => it.count * it.tiers), perch: sum("perch", it => it.length * it.tiers),
    feeders: sum("feeder", () => 1) + sum("trough", () => 1), drinkers: sum("drinker", () => 1) + sum("nipples", () => 1)};
}

const step = (v, s) => +(Math.floor(v / s + 1e-9) * s).toFixed(3);
/**
 * Fills the inside to match the barn's size and hens, using the free wall space (clear of the door,
 * the hen hatch and what's already placed): nest boxes (about one per 5 hens) on the wall opposite
 * the pasture if it has room, perch ladders on the longest free stretches (20 cm per hen), then
 * feeders and drinkers nearest the middle, or troughs and nipple lines down a big barn.
 * Returns {style, items}.
 */
function autoFurnish(p) {
  const room = roomOf(p, openings(p)), n = hensOf(p);
  const style = n <= 40 ? "backyard" : n <= 150 ? "floor" : "commercial";
  const f = furnisher(room, CATALOG), {items} = f;
  const byName = Object.fromEntries(room.walls.map(wl => [wl.name, wl]));
  const opposite = byName[OPPOSITE[p.pastureWall]];

  // Nest boxes: about one per 5 hens, on the wall opposite the pasture if it has room, else the longest free stretch.
  const want = Math.ceil(n / 5);
  let ns = f.longest([opposite], nestDepth);
  if (!ns || ns.len < Math.min(want, 4) * 0.35 + 0.1) ns = f.longest(room.walls, nestDepth);
  if (ns && ns.len >= 0.45) {
    const perRow = Math.max(1, Math.floor((ns.len - 0.1) / 0.35));
    const tiers = Math.min({backyard: 2, floor: 2, commercial: 3}[style], Math.ceil(want / perRow));
    f.onWall(ns, "nests", {count: Math.max(1, Math.min(perRow, Math.floor(want / tiers))), tiers});
  }

  // Perch ladders: 20 cm per hen, on the longest free stretches of wall.
  const most = {backyard: 2, floor: 3, commercial: 4}[style];
  let perch = 0;
  for (let k = 0; k < most && perch < n * 0.2; k++) {
    const s4 = f.longest(room.walls, perchReach(4));
    if (!s4 || s4.len < 0.7) break;
    const tiers = Math.max(2, Math.min(4, Math.ceil((n * 0.2 - perch) / (s4.len - 0.1))));
    const s = f.longest(room.walls, perchReach(tiers)), length = Math.min(12, step(s.len - 0.1, 0.1));
    if (length < 0.6) break;
    f.onWall(s, "perch", {length, tiers});
    perch += length * tiers;
  }

  if (style === "commercial") {
    // Feeder troughs and nipple drinker lines down the length of the barn.
    const alongX = room.x1 - room.x0 >= room.z1 - room.z0, rot = alongX ? 0 : 90;
    const [lo, hi] = alongX ? [room.z0, room.z1] : [room.x0, room.x1];
    for (const [type, fr] of [["trough", 0.3], ["trough", 0.7], ["nipples", 0.43], ["nipples", 0.57]]) {
      const c = lo + (hi - lo) * fr, line = f.freeLine(c, alongX), length = line ? Math.min(30, step(line[1] - line[0] - 0.2, 0.1)) : 0;
      if (length >= 1) f.add(type, alongX ? (line[0] + line[1]) / 2 : c, alongX ? c : (line[0] + line[1]) / 2, rot, {length});
    }
  }
  // Tube feeders (one per 25 hens) and bell drinkers (one per 40), unless troughs and lines were
  // placed: one of each first, so a small coop that only has room for two gets both.
  const has = t => items.some(it => it.type === t);
  const feeders = has("trough") ? 0 : Math.max(1, Math.ceil(n / 25)), drinkers = has("nipples") ? 0 : Math.max(1, Math.ceil(n / 40));
  const order = [...(feeders ? ["feeder"] : []), ...(drinkers ? ["drinker"] : []),
    ...Array(Math.max(0, feeders - 1)).fill("feeder"), ...Array(Math.max(0, drinkers - 1)).fill("drinker")];
  for (const type of order) f.onFloor(type);
  return {style, items};
}

/* ---------- Export ---------- */
/**
 * Scene nodes and placeable XML for the pasture. c: export context from the core
 * {p, geo, doc, box(name, {center, size}, attrs), trigger(group, mask)}.
 */
function scene(c) {
  const {p, geo, doc} = c, y = henYard(geo, p), n = hensOf(p);
  const stripesMat = doc.material("warningStripes_mat", {}, ["diffuse", "normal", "specular"].map((k, i) =>
    [["Texture", "Normalmap", "Glossmap"][i], `$data/shared/warningStripes_${k}.png`])); // the game finds the .dds
  const nodes = [tg("chickenFeatures", [0, 0, 0], [
    // Solid, not a trigger: unloading finds it with a raycast. It only collides with triggers.
    c.box("exactFillRootNodeFood", y.food, {static: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("markerFood", y.food.marker),
    c.box("loadingTrigger", y.loading, c.trigger("0x20000000", "0x110000")),
    tg("markerAnimals", y.loading.marker),
    c.box("infoTrigger", y.info, c.trigger("0x20000000", "0x110000")),
    tg("teleportNode", y.loading.teleport),
    c.box("palletTrigger", y.pallet.trigger, c.trigger("0x20000000", "0x10000")),
    ...y.pallet.lines.map(([a, b], i) => tg(`palletAreaStart0${i + 1}`, a, [tg(`palletAreaEnd0${i + 1}`, b.map((v, k) => v - a[k]))])),
    // Like the base game's horse barn: the footprint is cut out of the walking area made from the fence.
    tg("navigationRootNode", [0, 0, 0], [c.box("navmeshBlocker", y.blocker, {static: true, collisionFilterGroup: "0x800000", collisionFilterMask: "0x1", buildNavMeshMask: "0xfe"})]),
    tg("fence1", [0, 0, 0], y.fence.map((q, i) => tg(`fence1Node${i + 1}`, q))),
    // Hidden until the game's trigger marker setting shows it; projected onto the terrain.
    shape("warningStripes01", {translation: [0, 0.02, 0], shapeId: doc.shape("warningStripes", y.pallet.stripes), castsShadows: false, receiveShadows: true,
      nonRenderable: true, terrainDecal: true, materialIds: stripesMat, clipDistance: 100}),
  ])];
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerFood" filename="$data/shared/assets/marker/markerIconFood.i3d" adjustToGround="true"/>
        <triggerMarker node="markerAnimals" filename="$data/shared/assets/marker/markerIconAnimals.i3d" adjustToGround="true"/>
        <!-- Stripes around the egg pallets, shown or hidden with the game's trigger marker setting. -->
        <triggerMarker node="warningStripes01"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="CHICKEN" teleportNode="teleportNode"/>
    </hotspots>

    <infoTrigger triggerNode="infoTrigger"/>

    <husbandry saveId="Animals_CHICKEN" hasStatistics="false">
        <!-- The walking area is made from the fence when the barn is placed; the barn itself is blocked out. -->
        <animals type="CHICKEN" baseMaxNumAnimals="${n}" maxNumAnimals="${n}">
            <navigation rootNode="navigationRootNode"/>
            <loadingTrigger node="loadingTrigger"/>
        </animals>
        <food capacity="${n * FEED_PER_HEN}">
            <unloadTrigger exactFillRootNode="exactFillRootNodeFood"/>
        </food>
        <pallets>
            <palletSpawner fillTypes="EGG" maxNumPallets="6">
                <palletTrigger node="palletTrigger"/>
                <spawnPlaces>
                    <spawnPlace startNode="palletAreaStart01" endNode="palletAreaEnd01"/>
                    <spawnPlace startNode="palletAreaStart02" endNode="palletAreaEnd02"/>
                </spawnPlaces>
            </palletSpawner>
        </pallets>
        <fence xmlFilename="$data/placeables/brandless/fences/husbandries/chickenNetFence/chickenNetFence.xml">
            <sections>
                <section segmentId="SEGMENT" customizable="true">
${y.fence.map((_, i) => `                    <node node="fence1Node${i + 1}"/>`).join("\n")}
                </section>
            </sections>
        </fence>
        <meadow>
            <createTask weedState="0">
                <decoFoliage name="grassShort"/>
                <ground type="NONE"/>
                <terrainGroundType name="grass"/>
            </createTask>
        </meadow>
    </husbandry>
`;
  return {nodes, xml, areas: y.areas};
}

/* ---------- The kind ---------- */
export default {
  id: "chicken",
  name: "Hen house",
  category: "animals",
  /** Walk-in: inside walls, hollow collision, a door that opens and a furnished inside. */
  walkIn: true,
  defaults: {hens: 30, pastureWall: "back", fenceDepth: 8},
  /** Editor sections only this kind has (shown first), and shared ones it doesn't use. */
  sections: [
    {title: "Chickens", side: "build", hint: "Hens go in and out through a small hatch in the pasture side. The fence starts there, at least 12 m wide and 6 m deep (the game can’t handle a smaller pasture), and you can drag it to any shape when placing the barn in the game. The people door is always on another wall, outside the fence; feed and egg pallets go on the walls without the door.", fields: [
      {k: "hens", label: "Hens", min: 1, max: MAX_HENS, step: 1},
      {k: "pastureWall", label: "Pasture side (with the hen hatch)", type: "select", options: [["front", "Front"], ["back", "Back"], ["left", "Left side"], ["right", "Right side"]]},
      {k: "fenceDepth", label: "Pasture depth, from the wall", min: 6, max: 40, step: 0.5, unit: " m"}]},
  ],
  hides: ["Interior", "Farmhouse", "Kupor (dormers)"],
  /**
   * Settings as this kind uses them: no sleep point, rooms or dormers; no more hens than fit; and
   * the pasture never on the people door's wall (it moves to the opposite one).
   */
  normalize: p => ({...p, sleepPoint: false, interior: false, dormers: [], hens: Math.min(p.hens, henCap(p)),
    pastureWall: p.pastureWall === p.doorWall ? OPPOSITE[p.doorWall] : p.pastureWall}),
  openings,
  placeable: () => ({type: "chickenHusbandryPasture", fn: "$l10n_function_animalPenChicken",
    shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "chickens"},
    note: `Chicken barn: use <placeable type="chickenHusbandryPasture" ...>, as in the base game's chicken barns.`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m chicken barn for ${hensOf(p)} hens, made with House to i3d.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  summary,
  scene,
  presets: [
    {id: "gardenCoop", name: "Red garden coop", blurb: "4 × 3 m coop for 30 hens, red boards with white trim.", settings: {
      hens: 30, fenceDepth: 8,
      width: 4, depth: 3, floors: 1, floorHeight: 2.3, foundation: 0.2, roofType: "gable", ridge: "width", roofPitch: 35, overhang: 0.3,
      chimney: false, gutters: false, downpipes: 0, winFront: 1, winBack: 0, winLeft: 1, winRight: 0, winW: 0.6, winH: 0.5, sill: 1.2,
      doorWall: "front", pastureWall: "back", doorPos: 0.6, doorW: 0.8, doorH: 1.8, entrance: "none",
      wallCladding: "lockpanel", roofMaterial: "tiles", wallColor: "#8E2A1E", trimColor: "#F2EFE8", roofColor: "#2B2D2F", doorColor: "#F2EFE8",
      modPrice: 4500, modUpkeep: 10}},
    {id: "longHenHouse", name: "Long hen house", blurb: "9 × 5 m for 110 hens: low walls, a row of small windows and a metal roof.", settings: {
      hens: 110, fenceDepth: 14,
      width: 9, depth: 5, floors: 1, floorHeight: 2.4, foundation: 0.2, roofType: "gable", ridge: "width", roofPitch: 18, overhang: 0.4,
      chimney: false, gutters: true, downpipes: 1, winFront: 5, winBack: 0, winLeft: 0, winRight: 1, winW: 0.8, winH: 0.5, sill: 1.3,
      doorWall: "left", pastureWall: "front", doorPos: 0, doorW: 1.6, doorH: 2, entrance: "none",
      wallCladding: "horizontal", roofMaterial: "metal", wallColor: "#E8E4DA", trimColor: "#3E5A4A", roofColor: "#4A4F52", doorColor: "#3E5A4A",
      modPrice: 22000, modUpkeep: 30}},
    {id: "poultryBarn", name: "Poultry barn", blurb: "20 × 8 m barn for 360 hens, as many as the biggest barn in the game.", settings: {
      hens: 360, fenceDepth: 20,
      width: 20, depth: 8, floors: 1, floorHeight: 3, foundation: 0.3, roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      chimney: false, gutters: true, downpipes: 2, winFront: 8, winBack: 8, winLeft: 0, winRight: 0, winW: 1.2, winH: 0.6, sill: 1.5,
      doorWall: "right", pastureWall: "front", doorPos: 0, doorW: 2.5, doorH: 2.6, entrance: "none",
      wallCladding: "lockpanel", roofMaterial: "metal", wallColor: "#7C8A8F", trimColor: "#F2EFE8", roofColor: "#3B3F42", doorColor: "#F2EFE8",
      modPrice: 79000, modUpkeep: 100}},
  ],
};
