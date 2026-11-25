// The yard of a mod's animals (docs/PLAN_MOD.md, docs/PLAN_MALLAR.md step 1): where the feed pad, bale drop, trailer spot, egg or wool pallets, info area, troughs and fence go to start with, and the
// husbandry the game reads (the nodes and the placeable XML) for hens, cows and sheep. The mod (kinds/modframe.mjs, lib/modObjects.mjs) is the owner of this; the animal barns of kinds/ still use it
// until the game logic is taken out of the building types. Pure but for the i3d nodes it writes; imports only the helpers (never a kind).
import { tg, shape } from "../i3d.mjs";
import { navMesh } from "../walkarea.mjs";
import { yardFrame, shellOf, teleportFor, pastureWallFor, navContourNodes } from "../kinds/pasture.mjs";
import { objectOf, objectsOf, boxOf, iconOf, boxFrom, insidePoly } from "../objects.mjs";
import { placeOnWall, placeOnBuilding } from "../places.mjs";
import { roomOf, wallsOf, WALL_T } from "../layout.mjs";

/* ---------- Hens ---------- */
/** Floor space per hen, as in the base game's 360-hen barn (about 2.2 per m², rounded up). */
export const HENS_PER_M2 = 2.5;
export const MAX_HENS = 360;
/** Feed storage per hen, in litres (the base game's chicken barns hold about 25 l per hen). */
export const FEED_PER_HEN = 25;
export const henCap = p => Math.max(1, Math.min(MAX_HENS, Math.floor(HENS_PER_M2 * p.width * p.depth + 1e-9)));
export const hensOf = p => Math.min(Math.round(p.hens), henCap(p));

/** Smallest starting pasture, like the base game's smallest (about 12 m along the barn, 6 m deep). */
export const HEN_MIN_WIDTH = 12;


/**
 * The hen house's game objects as {box, icon}: the building's (p.objects), or where they go to start
 * with: the feed pad and trailer spot on the feed side, the egg pallets on another wall, the info area
 * round the barn (the feed and pallet sides: walls that aren't the pasture's, walls without a door first).
 */
export function henObjects(geo, p, yf = yardFrame(geo, p, HEN_MIN_WIDTH)) {
  const {feedKey, otherKey, frames, mid} = yf, {W, D} = geo.dims;
  const start = {
    // Feed pad: low on the ground, so a tipping trailer's or auger's raycast starts above it.
    food: placeOnWall(frames, feedKey, w => { const [c, len] = mid(w); return {s: c, d: 1.75, along: Math.max(2.5, Math.min(4, len)), out: 3, h: 0.3, icon: [c, 1.75]}; }),
    loading: placeOnWall(frames, feedKey, w => { const [c, len] = mid(w); return {s: c, d: 5.5, along: Math.min(4, len), out: 4, h: 3, icon: [c, 5.5]}; }),
    pallets: placeOnWall(frames, otherKey, w => {
      const [c, len] = mid(w), lines = Math.min(4.8, Math.max(1.2, len - 1));
      return {s: c, d: 2.8, along: Math.min(lines + 1, len), out: 3.2, h: 2.5, icon: null};
    }),
    info: {box: placeOnBuilding({center: [0, 1.5, 0], size: [W + 2, 3, D + 2]}), icon: null},
  };
  const out = {};
  for (const t of ["food", "loading", "pallets", "info"]) {
    const o = objectOf(p, t);
    out[t] = o ? {box: boxOf(o), icon: iconOf(o)} : start[t];
  }
  return out;
}
/** Where the hen house's objects go to start with (kind.objects.defaults): from its pasture wall and depth. */
export function defaultObjects(p) {
  const q = {...p, pastureWall: pastureWallFor(p), objects: undefined}, y = henObjects(shellOf(q), q);
  return [
    ...["food", "loading", "pallets", "info"].map(t => boxFrom(t, y[t].box, t === "food" || t === "loading" ? y[t].icon : null)),
    // (a new barn's pasture goes on a wall without a door, if it can)
    {type: "pasture", wall: q.pastureWall, a: 0, b: 0, depth: p.fenceDepth},
  ];
}

/** The placeable a hen house is (and a mod with a hen yard): the game's chicken barn type. */
export const HEN_PLACEABLE = {type: "chickenHusbandryPasture", fn: "$l10n_function_animalPenChicken",
  shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "chickens"},
  note: `Chicken barn: use <placeable type="chickenHusbandryPasture" ...>, as in the base game's chicken barns.`};


/* ---------- Cows ---------- */
/** What the pasture is painted with (ground types of the game's groundTypes.xml): grass is the living meadow the animals graze. */
export const PASTURE_GROUNDS = [["grass", "Grass"], ["dirt", "Dirt"], ["animalMud", "Mud"], ["gravel", "Gravel"], ["sand", "Sand"], ["forestGround", "Forest floor"]];
/** About one cow per 6 m² of floor; at most 100 (the base game's biggest pasture barn takes 99). */
export const M2_PER_COW = 6;
export const MAX_COWS = 100;
/** Food storage per cow, in litres (the base game's cow barns hold about 1600-1700 l per cow). */
export const FOOD_PER_COW = 1700;
/** Smallest starting pasture along the barn: cows need more room than hens. */
export const COW_MIN_WIDTH = 16;
export const cowCap = p => Math.max(1, Math.min(MAX_COWS, Math.floor(p.width * p.depth / M2_PER_COW + 1e-9)));
export const cowsOf = p => Math.min(Math.round(p.cows), cowCap(p));
/**
 * What differs between the barns built on this module (the cow barn and the sheep barn, sheep.mjs):
 * the animal count, the smallest pasture, whether there are pallets (wool) and how it is exported.
 */
export const COW = {count: cowsOf, minWidth: COW_MIN_WIDTH, pallets: false, foodPer: FOOD_PER_COW, animal: "COW", fill: "FORAGE",
  fence: "cowFence/cowFence", glyph: "cow", fnAnimal: "$l10n_function_animalPenCow"};


// Troughs are game objects (feedTrough, waterTrough: a box on the ground, its height the top edge). A trough is a plank box
// with a wall round a hollow; the fill plane floats in the hollow.
// body: how far behind the head (the stand point) an animal reaches, so a place with a wall or the fence just behind it isn't used
const TROUGH = {wall: 0.08, stand: 0.7, spacing: 1.4, body: 2.3};

/**
 * A trough from its object {x, z, w, d, h}: its outer and inner rectangles, the heights of its floor and fill, and
 * where animals stand: along its long sides, 70 cm out, on each side where the animal fits (it and its body behind it inside the fence and not in the building),
 * or else on the side away from the building. Null where the building has none.
 */
export function troughFrom(o, fence, rects) {
  if (!o) return null;
  const outer = {x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2}, t = TROUGH.wall;
  const inner = {x0: outer.x0 + t, x1: outer.x1 - t, z0: outer.z0 + t, z1: outer.z1 - t};
  const top = o.h, bottom = top * 0.6;
  const alongX = o.w >= o.d, len = alongX ? o.w : o.d, k = Math.max(1, Math.floor((len - 0.2) / TROUGH.spacing));
  const out = (alongX ? o.d : o.w) / 2 + TROUGH.stand;
  // a trough turned round the Y axis (turn, degrees, as three.js turns: x' = x cos + z sin, z' = -x sin + z cos): the places are worked out as for a trough that is not, in its own frame, and turned with it
  const turn = ((+o.turn || 0) % 360 + 360) % 360, ca = Math.cos(turn * Math.PI / 180), sa = Math.sin(turn * Math.PI / 180), turned = ([lx, lz]) => [lx * ca + lz * sa, -lx * sa + lz * ca];
  const spots = sign => Array.from({length: k}, (_, i) => {
    const s = -len / 2 + (i + 0.5) * len / k, ln = alongX ? [0, sign] : [sign, 0], n = turned(ln), l = alongX ? [s, ln[1] * out] : [ln[0] * out, s], w = turned(l);
    const pos = [o.x + w[0], 0, o.z + w[1]];
    return {pos, rot: Math.atan2(-n[0], -n[1]) * 180 / Math.PI, back: [pos[0] + n[0] * TROUGH.body, 0, pos[2] + n[1] * TROUGH.body]};
  });
  const free = q => !rects.some(r => q[0] > r.x0 - 0.3 && q[0] < r.x1 + 0.3 && q[2] > r.z0 - 0.3 && q[2] < r.z1 + 0.3) && (!fence || insidePoly(fence, q[0], q[2]));
  let sides = [1, -1].map(spots).filter(list => list.every(q => free(q.pos) && free(q.back)));
  if (!sides.length) { // not reachable (the warning says so): at least the side away from the building
    const c = rects[0] ? [(rects[0].x0 + rects[0].x1) / 2, (rects[0].z0 + rects[0].z1) / 2] : [0, 0];
    const away = sign => { const q = spots(sign)[0].pos; return Math.hypot(q[0] - c[0], q[2] - c[1]); };
    sides = [spots(away(1) >= away(-1) ? 1 : -1)];
  }
  const strip = list => list.map(({pos, rot}) => ({pos, rot}));
  return {outer, inner, top, bottom, planeMin: bottom + (top - bottom) * 0.15, planeMax: top - (top - bottom) * 0.2,
    asset: o.asset, rot: o.rot, turn, plane: [o.x, o.z], size: [inner.x1 - inner.x0, inner.z1 - inner.z0], places: strip(sides.flat()),
    // (the box is the trough's own size at its middle, with the turn when it has one; local: the outer and inner rectangles round the middle, for drawing in the trough's own frame)
    box: {center: [o.x, top / 2, o.z], size: [o.w, top, o.d], ...(turn ? {turn} : {})},
    local: {outer: {x0: -o.w / 2, x1: o.w / 2, z0: -o.d / 2, z1: o.d / 2}, inner: {x0: -o.w / 2 + t, x1: o.w / 2 - t, z0: -o.d / 2 + t, z1: o.d / 2 - t}}};
}
/** The troughs to start with: against the pasture wall outside, feed on one side of the doorway, water on the other (the longer stretch gets the feed). */
function startTroughs(yf, p, cfg) {
  const {past, boxAt} = yf, L = past.L, m = L / 2, n = cfg.count(p);
  const sides = [[0.4, m - 0.8 - 0.5], [m + 0.8 + 0.5, L - 0.4]].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const one = ([a, b], length, top) => {
    const len = Math.max(0.8, Math.min(b - a, length)), s = (a + b) / 2;
    return {box: boxAt(past, s, 0.6, len, 0.7, top), icon: null};
  };
  return {feedTrough: one(sides[0], Math.max(2, n * 0.6), 0.75), waterTrough: one(sides[1], 2, 0.7)};
}


/**
 * The cow barn's game objects as {box, icon}: the building's (p.objects), or where they go to start
 * with. A building with objects that left one out (the bale drop is optional) has null for it.
 */
export function cowObjects(geo, p, yf, cfg) {
  const {feedKey, otherKey, frames, mid} = yf, {W, D} = geo.dims;
  const pad = (h, icon) => w => { const [c, len] = mid(w); return {s: c, d: 1.75, along: Math.max(2.5, Math.min(4, len)), out: 3, h, icon: [c + icon, 1.75]}; };
  const start = {
    food: placeOnWall(frames, feedKey, pad(0.3, -0.8)),
    bales: placeOnWall(frames, feedKey, pad(2.5, 0.8)),
    loading: placeOnWall(frames, feedKey, w => { const [c, len] = mid(w); return {s: c, d: 5.5, along: Math.min(4, len), out: 4, h: 3, icon: [c, 5.5]}; }),
    info: {box: placeOnBuilding({center: [0, 1.5, 0], size: [W + 2, 3, D + 2]}), icon: null},
    pallets: cfg.pallets && placeOnWall(frames, otherKey, w => {
      const [c, len] = mid(w), lines = Math.min(4.8, Math.max(1.2, len - 1));
      return {s: c, d: 2.8, along: Math.min(lines + 1, len), out: 3.2, h: 2.5, icon: null};
    }),
  };
  Object.assign(start, startTroughs(yf, p, cfg));
  const out = {};
  for (const t of ["food", "bales", "loading", "info", ...(cfg.pallets ? ["pallets"] : [])]) {
    const o = objectOf(p, t);
    out[t] = o ? {box: boxOf(o), icon: iconOf(o)} : Array.isArray(p.objects) ? null : start[t];
  }
  // (the troughs: as many as the building has; look: the user's item it looks like)
  for (const t of ["feedTrough", "waterTrough"]) {
    const list = objectsOf(p, t);
    out[t + "s"] = list.length ? list.map(o => ({box: boxOf(o), icon: iconOf(o), look: {asset: o.asset, rot: o.rot}})) : Array.isArray(p.objects) ? [] : [start[t]];
  }
  return out;
}
/** Where the cow barn's objects go to start with (kind.objects.defaults): from its pasture wall and depth. */
export const defaultsOf = cfg => p => {
  const q = {...p, pastureWall: pastureWallFor(p), objects: undefined}, geo = shellOf(q), y = cowObjects(geo, q, yardFrame(geo, q, cfg.minWidth), cfg);
  return [
    ...["food", "bales", "loading", "info", ...(cfg.pallets ? ["pallets"] : [])].map(t => boxFrom(t, y[t].box, y[t].icon)),
    // (the start has one feed and one water trough)
    ...["feedTrough", "waterTrough"].map(t => boxFrom(t, y[t + "s"][0].box, y[t + "s"][0].icon)),
    // (a new barn's pasture goes on a wall without a door, if it can)
    {type: "pasture", wall: q.pastureWall, a: 0, b: 0, depth: p.fenceDepth},
  ];
};


/** The placeable a cow yard is (and a cow barn): the game's cow barn type. */
export const COW_PLACEABLE = {type: "cowHusbandryPasture",
  fn: ["$l10n_function_animalPenCow", "$l10n_ui_construction_cowBarnNoMilk", "$l10n_function_adjustableMeadow"],
  shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "cows"},
  note: `Cow barn: use <placeable type="cowHusbandryPasture" ...>, as in the base game's small cow barn.`};
/** The placeable a sheep yard is (and a sheep barn): the game's sheep barn type. */
export const SHEEP_PLACEABLE = {type: "sheepHusbandry",
  fn: ["$l10n_function_animalPenSheep", "$l10n_function_adjustableMeadow"],
  shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "sheeps"},
  note: `Sheep barn: use <placeable type="sheepHusbandry" ...>, as in the base game's sheep barns.`};

/* ---------- Sheep ---------- */
/** About one sheep per 1.5 m² of floor; at most 70 (the base game's biggest sheep barn takes 68). */
export const M2_PER_SHEEP = 1.5;
export const MAX_SHEEP = 70;
export const sheepCap = p => Math.max(1, Math.min(MAX_SHEEP, Math.floor(p.width * p.depth / M2_PER_SHEEP + 1e-9)));
export const sheepOf = p => Math.min(Math.round(p.sheep), sheepCap(p));
/** Hay storage per sheep, in litres (the base game's sheep barns hold about 160). */
export const FOOD_PER_SHEEP = 160;
export const SHEEP_MIN_WIDTH = 12;
export const SHEEP = {...COW, count: sheepOf, minWidth: SHEEP_MIN_WIDTH, foodPer: FOOD_PER_SHEEP, animal: "SHEEP", fill: "DRYGRASS_WINDROW",
  fence: "sheepNetFence/sheepNetFence", pallets: {fills: "WOOL GOATMILK", max: 8}};

/* ---------- The husbandry the game reads ---------- */
/**
 * A horizontal plane sx along x and sz along z about its middle, turned `turn` degrees round Y (as three.js turns: x' = x cos + z sin, z' = -x sin + z cos) IN ITS CORNERS, not by a rotation of its node:
 * the game moves a food or water plane up and down and, seen in a cow yard (2026-11-25), did not turn it with its trough, so the hay lay across the trough that was turned a quarter.
 */
export const planeQuad = (sx, sz, turn = 0) => {
  const corners = [[-sx / 2, -sz / 2], [-sx / 2, sz / 2], [sx / 2, sz / 2], [sx / 2, -sz / 2]];
  const a = turn * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), r = v => Math.round(v * 1e9) / 1e9 || 0;
  const p = corners.flatMap(([x, z]) => (turn ? [r(x * ca + z * sa), 0, r(-x * sa + z * ca)] : [x, 0, z]));
  return {p, n: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], uv: [0, 0, 0, 1, 1, 1, 1, 0], i: [0, 1, 2, 0, 2, 3]};
};

/**
 * The nodes, placeable XML and ground areas of a yard y (cowYard's shape) for n animals of cfg's kind. rects: what the way back along the fence goes round (footprints); clear: the polygon [[x, z] ...]
 * where the grass is cleared (none: no clear task); ground: what the pasture is painted with (PASTURE_GROUNDS); under: the ground under the buildings. troughs: draw the troughs as nodes (a mod has no building
 * to draw them outside of); y.markers: the icons, y.feedTrough(s) and so on as cowYard gives them.
 */
export function cowScene(c, y, cfg, n, {rects, clear, ground, under, troughs = false}) {
  const {doc} = c, pastureGround = PASTURE_GROUNDS.some(g => g[0] === ground) ? ground : "grass";
  const stripesMat = y.pallet && doc.material("warningStripes_mat", {}, ["diffuse", "normal", "specular"].map((k, i) =>
    [["Texture", "Normalmap", "Glossmap"][i], `$data/shared/warningStripes_${k}.png`])); // the game finds the .dds
  const forage = doc.material("forage_mat", {diffuseColor: "0.42 0.45 0.2 1"}), water = doc.material("water_mat", {diffuseColor: "0.22 0.36 0.45 1"});
  const plane = (name, t, mat) => shape(name, {translation: [t.plane[0], t.planeMax, t.plane[1]], shapeId: doc.shape(name, planeQuad(...t.size, t.turn)), castsShadows: false, receiveShadows: true, materialIds: mat});
  const places = (group, name, list) => tg(group, [0, 0, 0], list.map((q, i) => tg(`${name}${i + 1}`, q.pos, [], {rotation: [0, q.rot, 0]})));
  const blocker = (b, i) => c.box(i ? `navmeshBlocker${i + 1}` : "navmeshBlocker", b, {static: true, collisionFilterGroup: "0x800000", collisionFilterMask: "0x1", buildNavMeshMask: "0xfe"});
  const nodes = [tg(cfg.animal === "COW" ? "cowFeatures" : "animalFeatures", [0, 0, 0], [
    // Solid, not a trigger: unloading finds it with a raycast. It only collides with triggers.
    c.box("exactFillRootNodeFood", y.food, {static: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("markerFood", y.markers.food),
    ...(y.bales ? [c.box("baleTrigger", y.bales, c.trigger("0x20000000", "0x40000")), tg("markerBales", y.markers.bales)] : []),
    c.box("loadingTrigger", y.loading, c.trigger("0x20000000", "0x110000")),
    tg("markerAnimals", y.markers.animals),
    c.box("infoTrigger", y.info, c.trigger("0x20000000", "0x110000")),
    tg("teleportNode", y.markers.teleport),
    ...(troughs ? [...y.feedTroughs.flatMap((t, k) => troughNodes(c, "feedTrough", k, t, false)), ...y.waterTroughs.flatMap((t, k) => troughNodes(c, "waterTrough", k, t, true))] : []),
    ...(y.feedTrough ? [plane("foodPlane", y.feedTrough, forage), places("foodPlaces", "foodPlace", y.foodPlaces)] : []),
    ...(y.waterTrough ? [plane("waterPlane", y.waterTrough, water), places("waterPlaces", "waterPlace", y.waterPlaces)] : []),
    // Like the base game's cow barn: the barn and troughs are cut out of the walking area made from the fence.
    // (animals that can go inside: a walking mesh of the whole area, like the base game's big barns; else the area made from the fence minus the blockers)
    tg("navigationRootNode", [0, 0, 0], y.nav
      ? [shape("navigationMeshShape", {shapeId: doc.shape("navigationMeshShape", navMesh(insideOnly(y.nav)), {cpu: true}), nonRenderable: true, buildNavMeshMask: "0xfe", castsShadows: false, receiveShadows: false, materialIds: forage}),
        // (the base game's big barns also have a "walkingPlane": the same area as a collision surface of its own group, which the animals stand on)
        shape("walkingPlane", {shapeId: doc.shape("walkingPlane", navMesh(insideOnly(y.nav)), {cpu: true}), static: true, collisionFilterGroup: "0x400000", collisionFilterMask: "0x1", nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: forage}),
        ...y.nav.blockers.map(blocker)]
      : y.blockers.map(blocker)),
    tg("fence1", [0, 0, 0], y.fence.map((q, i) => tg(`fence1Node${i + 1}`, q))),
    // the way back from the last post to the first along the building (the game would close the area with a straight line, through the building)
    tg("navContour", [0, 0, 0], navContourNodes(y.fence, rects).map(([x, z], i) => tg(`navContourNode${i + 1}`, [x, 0, z]))),
    // the ground under the building: the meadow's clear task takes grass away there (and paints dirt)
    ...(clear.length >= 3 ? [tg("meadowClear", [0, 0, 0], clear.map(([x, z], i) => tg(`clearAreaPoint${i + 1}`, [x, 0, z])))] : []),
    ...(y.pallet ? [
      c.box("palletTrigger", y.pallet.trigger, c.trigger("0x20000000", "0x10000")),
      ...y.pallet.lines.map(([a, b], i) => tg(`palletAreaStart0${i + 1}`, a, [tg(`palletAreaEnd0${i + 1}`, b.map((v, k) => v - a[k]))])),
      // Hidden until the game's trigger marker setting shows it; projected onto the terrain.
      shape("warningStripes01", {translation: [0, 0.02, 0], shapeId: doc.shape("warningStripes", y.pallet.stripes), castsShadows: false, receiveShadows: true,
        nonRenderable: true, terrainDecal: true, materialIds: stripesMat, clipDistance: 100})] : []),
  ])];
  const t = y.feedTrough, w = y.waterTrough;
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerFood" filename="$data/shared/assets/marker/markerIconFood.i3d" adjustToGround="true"/>
        <triggerMarker node="markerAnimals" filename="$data/shared/assets/marker/markerIconAnimals.i3d" adjustToGround="true"/>
${y.bales ? `        <triggerMarker node="markerBales" filename="$data/shared/assets/marker/markerIconBales.i3d" adjustToGround="true"/>
` : ""}${y.pallet ? `        <triggerMarker node="warningStripes01"/>
` : ""}    </triggerMarkers>

    <hotspots>
        <hotspot type="${cfg.animal}" teleportNode="teleportNode"/>
    </hotspots>

    <infoTrigger triggerNode="infoTrigger"/>

    <husbandry saveId="Animals_${cfg.animal}" hasStatistics="false">
        <!-- The walking area is made from the fence when the barn is placed; the barn and troughs are blocked out. -->
        <animals type="${cfg.animal}" baseMaxNumAnimals="${n}" maxNumAnimals="${n}">
            ${y.nav ? '<navigation rootNode="navigationRootNode" shape="navigationMeshShape"/>' : '<navigation rootNode="navigationRootNode"/>'}
            <loadingTrigger node="loadingTrigger"/>
        </animals>
        <food capacity="${n * cfg.foodPer}">
${t ? `            <foodPlaces>
${y.foodPlaces.map((_, i) => `                <foodPlace node="foodPlace${i + 1}"/>`).join("\n")}
            </foodPlaces>
            <foodPlane node="foodPlane" minY="${t.planeMin}" maxY="${t.planeMax}" changeVisibility="true" defaultFillType="${cfg.fill}"/>
` : ""}            <unloadTrigger exactFillRootNode="exactFillRootNodeFood"/>
${y.bales ? `            <baleTrigger triggerNode="baleTrigger" deleteLitersPerSecond="200"/>
` : ""}        </food>
        <water automaticWaterSupply="true">
${w ? `            <waterPlane node="waterPlane" minY="${w.planeMin}" maxY="${w.planeMax}"/>
            <waterPlaces>
${y.waterPlaces.map((_, i) => `                <waterPlace node="waterPlace${i + 1}"/>`).join("\n")}
            </waterPlaces>
` : ""}        </water>
${y.pallet ? `        <pallets>
            <palletSpawner fillTypes="${cfg.pallets.fills}" maxNumPallets="${cfg.pallets.max}">
                <palletTrigger node="palletTrigger"/>
                <spawnPlaces>
                    <spawnPlace startNode="palletAreaStart01" endNode="palletAreaEnd01"/>
                    <spawnPlace startNode="palletAreaStart02" endNode="palletAreaEnd02"/>
                </spawnPlaces>
            </palletSpawner>
        </pallets>
` : ""}        <fence xmlFilename="$data/placeables/brandless/fences/husbandries/${cfg.fence}.xml">
            <sections>
                <section segmentId="SEGMENT" customizable="true">
${y.fence.map((_, i) => `                    <node node="fence1Node${i + 1}"/>`).join("\n")}
                </section>
            </sections>
${(pts => pts.length ? `            <!-- the animals' area goes back along the building to the first post, not through it -->
            <additionalNavMeshNodes>
${pts.map((_, i) => `                <node node="navContourNode${i + 1}"/>`).join("\n")}
            </additionalNavMeshNodes>
` : "")(navContourNodes(y.fence, rects))}        </fence>
        <meadow>
            <fruitType name="GRASS" eatableStartGrowthState="greenMiddle" eatableEndGrowthState="harvestReady" eatenGrowthState="greenSmall"/>
            <fruitType name="MEADOW" eatableStartGrowthState="greenMiddle" eatableEndGrowthState="harvestReady" eatenGrowthState="greenSmall"/>
            <createTask weedState="0">
                <!-- Grass grows in the pasture only when the ground is grass; any other ground is painted bare, as the base game's farm stable does (grass would cover it). -->
                <fruit type="${pastureGround === "grass" ? "MEADOW" : "UNKNOWN"}" growthState="${pastureGround === "grass" ? "greenSmall" : "0"}"/>
                <ground type="NONE"/>
                <terrainGroundType name="${pastureGround}"/>
            </createTask>${clear.length >= 3 ? `
            <clearTask>
                <fruit type="UNKNOWN" growthState="0"/>
                <ground type="NONE"/>
                <terrainGroundType name="${under && under !== "auto" ? under : "dirt"}"/>
                <polygon>
${clear.map((_, i) => `                    <node node="clearAreaPoint${i + 1}"/>`).join("\n")}
                </polygon>
            </clearTask>` : ""}
        </meadow>
    </husbandry>
`;
  return {nodes, xml, areas: y.areas};
}


/**
 * A trough (cow.mjs troughFrom's) as nodes, drawn as the cow barn draws one: a base, four sides round a hollow and a collision box (a water trough has a water surface in the hollow), in a group at its
 * middle that is turned with the trough. prefix + (k + 1) names it.
 */
export function troughNodes(c, prefix, k, t, water) {
  // (in the trough's own frame, at its middle: a group at the middle, turned with the trough)
  const o = t.local.outer, i = t.local.inner, name = `${prefix}${k + 1}`, concrete = "#9A968C";
  const b = (suffix, a, z, h0, h1, color = concrete) => c.solid(`${name}${suffix}`, {center: [(a[0] + z[0]) / 2, (h0 + h1) / 2, (a[1] + z[1]) / 2], size: [Math.abs(z[0] - a[0]), h1 - h0, Math.abs(z[1] - a[1])]}, color);
  return [tg(name, [t.plane[0], 0, t.plane[1]], [
    b("Base", [o.x0, o.z0], [o.x1, o.z1], 0, t.bottom),
    b("SideW", [o.x0, o.z0], [i.x0, o.z1], t.bottom, t.top), b("SideE", [i.x1, o.z0], [o.x1, o.z1], t.bottom, t.top),
    b("SideN", [i.x0, o.z0], [i.x1, i.z0], t.bottom, t.top), b("SideS", [i.x0, i.z1], [i.x1, o.z1], t.bottom, t.top),
    ...(water ? [b("Water", [i.x0, i.z0], [i.x1, i.z1], t.bottom, t.planeMax, "#7FA0AE")] : []),
    c.box(`${name}Collision`, {center: [0, t.box.center[1], 0], size: t.box.size}, {static: true, collisionFilterGroup: "0x3e", collisionFilterMask: "0xfffffbff"}),
  ], t.turn ? {rotation: [0, t.turn, 0]} : {})];
}

/**
 * The nodes, placeable XML and ground areas of a hen yard y (henYard's shape: fence, food, pallet, loading, info, blockers, areas; clear: a polygon [[x, z] ...] where the grass is cleared, a clear task as the cow barn has) for n hens, the building's footprints
 * rects ({x0, x1, z0, z1}) the way back along the fence follows. feedTroughs, waterTroughs (cow.mjs troughFrom's): drawn, the first feed trough with the game's food plane and the places the hens eat at. A mod (kinds/modframe.mjs) builds its own yard and uses the same export.
 */
export function henScene(c, y, n, rects) {
  const {doc} = c, blocker = (b, i) => c.box(i ? `navmeshBlocker${i + 1}` : "navmeshBlocker", b, {static: true, collisionFilterGroup: "0x800000", collisionFilterMask: "0x1", buildNavMeshMask: "0xfe", ...(b.turn ? {rotation: [0, b.turn, 0]} : {})});
  // (hens that can go inside: a walking mesh of the floor and a walking plane, as the base game's hen barns have; the area outside is the fence less that shape, the walls are the blockers)
  const ft = y.feedTroughs || [], wt = y.waterTroughs || [];
  const floor = y.nav && {...y.nav, rects: y.nav.rects.filter(r => r.inside)}, forage = (y.nav || ft.length) && doc.material("forage_mat", {diffuseColor: "0.42 0.45 0.2 1"});
  // a trough as the cow barn draws it: a base, four sides round a hollow, a collision box; a water trough has a water surface in the hollow
  const drawTrough = (prefix, k, t, water) => troughNodes(c, prefix, k, t, water);
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
    tg("navigationRootNode", [0, 0, 0], y.nav
      ? [shape("navigationMeshShape", {shapeId: doc.shape("navigationMeshShape", navMesh(floor), {cpu: true}), nonRenderable: true, buildNavMeshMask: "0xfe", castsShadows: false, receiveShadows: false, materialIds: forage}),
        shape("walkingPlane", {shapeId: doc.shape("walkingPlane", navMesh(floor), {cpu: true}), static: true, collisionFilterGroup: "0x400000", collisionFilterMask: "0x1", nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: forage}),
        ...y.nav.blockers.map(blocker)]
      : y.blockers.map(blocker)),
    // the troughs: drawn; the first feed trough has the game's food plane (it rises and falls with the feed) and the places where the hens stand to eat
    ...ft.flatMap((t, k) => drawTrough("feedTrough", k, t, false)), ...wt.flatMap((t, k) => drawTrough("waterTrough", k, t, true)),
    ...(ft.length ? [shape("foodPlane", {translation: [ft[0].plane[0], ft[0].planeMax, ft[0].plane[1]], shapeId: doc.shape("foodPlane", planeQuad(...ft[0].size, ft[0].turn)), castsShadows: false, receiveShadows: true, materialIds: forage}),
      tg("foodPlaces", [0, 0, 0], ft.flatMap(t => t.places).map((q, i) => tg(`foodPlace${i + 1}`, q.pos, [], {rotation: [0, q.rot, 0]})))] : []),
    tg("fence1", [0, 0, 0], y.fence.map((q, i) => tg(`fence1Node${i + 1}`, q))),
    // the ground under and round the building: the meadow's clear task takes the grass away there (and paints dirt), so the grass ends a little outside the walls
    ...(y.clear && y.clear.length >= 3 ? [tg("meadowClear", [0, 0, 0], y.clear.map(([x, z], i) => tg(`clearAreaPoint${i + 1}`, [x, 0, z])))] : []),
    // the way back from the last post to the first along the building (the game would close the area with a straight line, through the building)
    tg("navContour", [0, 0, 0], navContourNodes(y.fence, rects).map(([x, z], i) => tg(`navContourNode${i + 1}`, [x, 0, z]))),
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
            <navigation rootNode="navigationRootNode"${y.nav ? ' shape="navigationMeshShape"' : ""}/>
            <loadingTrigger node="loadingTrigger"/>
        </animals>
        <food capacity="${n * FEED_PER_HEN}">
${ft.length ? `            <foodPlaces>
${ft.flatMap(t => t.places).map((_, i) => `                <foodPlace node="foodPlace${i + 1}"/>`).join("\n")}
            </foodPlaces>
            <foodPlane node="foodPlane" minY="${+ft[0].planeMin.toFixed(3)}" maxY="${+ft[0].planeMax.toFixed(3)}" changeVisibility="true" defaultFillType="WHEAT"/>
` : ""}            <unloadTrigger exactFillRootNode="exactFillRootNodeFood"/>
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
${(pts => pts.length ? `            <!-- the animals' area goes back along the building to the first post, not through it -->
            <additionalNavMeshNodes>
${pts.map((_, i) => `                <node node="navContourNode${i + 1}"/>`).join("\n")}
            </additionalNavMeshNodes>
` : "")(navContourNodes(y.fence, rects))}        </fence>
        <meadow>
            <createTask weedState="0">
                <decoFoliage name="grassShort"/>
                <ground type="NONE"/>
                <terrainGroundType name="grass"/>
            </createTask>${y.clear && y.clear.length >= 3 ? `
            <clearTask>
                <fruit type="UNKNOWN" growthState="0"/>
                <ground type="NONE"/>
                <terrainGroundType name="dirt"/>
                <polygon>
${y.clear.map((_, i) => `                    <node node="clearAreaPoint${i + 1}"/>`).join("\n")}
                </polygon>
            </clearTask>` : ""}
        </meadow>
    </husbandry>
`;
  return {nodes, xml, areas: y.areas};
}

/* ---------- The kind ---------- */

/** The walking mesh for the export: the building's floor and the ramps (the yard is the fence's contour, which the game makes itself). */
const insideOnly = nav => ({...nav, rects: nav.rects.filter(r => r.inside)});

/**
 * The walls round the building (every part, with the passages between parts open) as thin blocker boxes, with a gap at each entrance: the game cuts these out of
 * the ground the animals walk on, so they can't go through a wall, in or out. Each box covers the wall (its thickness and a little more inside).
 */
export function wallSlabs(p, entrances, ops) {
  const out = [], frames = wallsOf(p), t = WALL_T + 0.1, inward = 0.05;
  for (const w of roomOf(p, ops).walls) {
    const horizontal = w.z0 === w.z1, lo = horizontal ? Math.min(w.x0, w.x1) : Math.min(w.z0, w.z1), hi = horizontal ? Math.max(w.x0, w.x1) : Math.max(w.z0, w.z1);
    let parts = [[lo - WALL_T, hi + WALL_T]];
    for (const e of entrances.filter(q => q.wall === w.name)) {
      const f = frames[e.wall], at = s => horizontal ? f.o[0] + f.u[0] * s : f.o[2] + f.u[2] * s, a = Math.min(at(e.s0), at(e.s1)), b = Math.max(at(e.s0), at(e.s1));   // (exactly the doorway: wider let the animals through the wall beside it)
      parts = parts.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]]).filter(([u, v]) => v - u > 0.05);
    }
    const [nx, nz] = w.into, centre = (t - inward) / 2 - inward;   // (the box reaches t outside the inside face and `inward` inside it)
    for (const [u, v] of parts) {
      const along = (u + v) / 2, len = v - u;
      out.push(horizontal
        ? {center: [along, 1, w.z0 - nz * ((t - inward) / 2)], size: [len, 2, t + inward]}
        : {center: [w.x0 - nx * ((t - inward) / 2), 1, along], size: [t + inward, 2, len]});
    }
  }
  return out;
}
