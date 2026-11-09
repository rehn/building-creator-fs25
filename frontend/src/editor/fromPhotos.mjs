// A building from photos: what to tell Claude about a kind's settings (a guide and the JSON schema of
// its answer) and how to turn the answer into the kind's settings. The server adds the photos and
// sends it (backend/internal/vision); the admin then adjusts the result in the editor. No DOM.
import { SCHEMA, KIND, sanitize, buildGeometry, WALLS, WALL_NAMES, PORCH_OPTIONS, WING_WALLS, MAX_WINGS } from "./model.mjs";
import { wallsOf, wingsOf } from "./layout.mjs";
import { OBJECT_TYPES, objectInfo, objectProblems } from "./objects.mjs";

/** Sections Claude leaves alone: the game's own places, the inside, the shop. */
const SKIP = new Set(["Game mod", "Game places", "Inside", "Interior", "Farmhouse", "Game objects"]);

/** The settings fields Claude fills in for a kind: [field, section title]. */
export function photoFields(kindId) {
  const out = [], seen = new Set();
  for (const g of SCHEMA) {
    if (SKIP.has(g.title) || (g.kinds && !g.kinds.includes(kindId))) continue;
    for (const f of g.fields) {
      if (f.type === "text" || seen.has(f.k)) continue;
      seen.add(f.k);
      out.push([f, g.title]);
    }
  }
  return out;
}

const unit = f => f.cm ? " m" : (f.unit || "");
const isInt = f => f.step === 1 && Number.isInteger(f.min);
function fieldSchema(f) {
  if (f.type === "check") return {type: "boolean", description: f.label};
  if (f.type === "color") return {type: "string", description: `${f.label} colour, #RRGGBB`};
  if (f.type === "select") return {type: "string", enum: f.options.map(o => o[0]),
    description: `${f.label}: ${f.options.map(o => `${o[0]} = ${o[1]}`).join("; ")}`};
  return {type: isInt(f) ? "integer" : "number", description: `${f.label}, ${f.min} to ${f.max}${unit(f)}`};
}
function fieldLine(f) {
  if (f.type === "check") return `- ${f.k} (true/false): ${f.label}`;
  if (f.type === "color") return `- ${f.k} (#RRGGBB): ${f.label} colour`;
  if (f.type === "select") return `- ${f.k}: ${f.label}. One of: ${f.options.map(o => `"${o[0]}" (${o[1]})`).join(", ")}`;
  return `- ${f.k} (${isInt(f) ? "whole number" : "number"}, ${f.min} to ${f.max}${unit(f)}): ${f.label}`;
}

const opening = walls => ({
  type: "object", additionalProperties: false,
  required: ["wall", "type", "floor", "along", "width", "height", "sill", "porch", "opens"],
  properties: {
    wall: {type: "string", enum: walls},
    type: {type: "string", enum: ["window", "door"]},
    floor: {type: "integer", description: "0 = ground floor, 1 = the floor above ..."},
    along: {type: "number", description: "Middle of the opening along the wall, 0 = its left end, 1 = its right end, seen from outside"},
    width: {type: "number", description: "metres"},
    height: {type: "number", description: "metres"},
    sill: {type: "number", description: "metres from that floor's floor to the bottom of the opening; 0 for doors"},
    porch: {type: "string", enum: PORCH_OPTIONS.map(o => o[0]), description: "What is in front of a door; none for windows"},
    opens: {type: "boolean", description: "A door: true if it is a door people use (the player can open it in the game), false if it is shut for good (nailed, blocked, only for show). Always true for windows."},
  },
});

/** The game objects Claude may place (the kind's, but not the pasture, which has its own answer, nor the info area, which goes round the building). */
const placeable = kind => ((kind.objects && kind.objects.types) || []).filter(t => t !== "pasture" && t !== "info");

/**
 * What to send Claude for a kind of building: {guide, schema}. The answer is
 * {seen, settings, openings, notes, ...}; every field is required, so Claude decides each one.
 */
export function photoRequest(kindId) {
  const kind = KIND[kindId];
  if (!kind) throw new Error("unknown kind " + kindId);
  const fields = photoFields(kindId);
  const wing = !kind.hides.includes("Wings");
  const wingWalls = WING_WALLS.slice(0, 3 * MAX_WINGS), claddings = ((SCHEMA.flatMap(g => g.fields).find(f => f.k === "wallCladding") || {}).options || []).map(o => o[0]);
  const settings = {type: "object", additionalProperties: false, required: fields.map(([f]) => f.k), properties: {}};
  for (const [f] of fields) settings.properties[f.k] = fieldSchema(f);
  // the parts: wings (an L, T or U, a small annex ...), each with its place, size, floors and roof
  const wings = wing ? {type: "array", description: "The parts besides the main building: the other arms of an L, T or U, and small annexes against a wall (none for a plain rectangle)", items: {type: "object", additionalProperties: false, required: ["wall", "along", "width", "depth", "floors", "half", "pitch", "name", "wallCladding", "wallColor", "roofMaterial", "roofColor", "trimColor"], properties: {
    wall: {type: "string", enum: [...WALLS, ...wingWalls], description: "The wall it stands against: one of the main building's (front, back, left, right), or a wall of a part listed before it (w1End, w1Left, w1Right, w2End ...) when it stands on another part"},
    along: {type: "number", description: "Middle of the part along that wall, 0 = its left end, 1 = its right end, seen from outside"},
    width: {type: "number", description: "metres, along the wall"}, depth: {type: "number", description: "metres, out from the wall"},
    floors: {type: "integer", description: "0 = as many full floors as the main building (and its half floor, if any), else its own number (1 to 3): a lower part has fewer"},
    half: {type: "boolean", description: "A half floor in the roof (1½-plan) on a part with its own floors; false when floors is 0"},
    pitch: {type: "integer", description: "Roof angle in degrees (5 to 60), or 0 for the one of the part it stands on (the main building's for a part on it)"},
    name: {type: "string", description: "What it is, like Pumphus, Bod or Tvättstuga; empty if you can't tell"},
    wallCladding: {type: "string", enum: ["", ...claddings], description: "Its wall panel when it differs from the part it stands on; empty: as its parent"},
    wallColor: {type: "string", description: "Its wall colour #RRGGBB when it differs from its parent; empty: as its parent"},
    roofMaterial: {type: "string", enum: ["", "tiles", "metal", "plain"], description: "Its roof covering when it differs from its parent; empty: as its parent"},
    roofColor: {type: "string", description: "Its roof colour #RRGGBB when it differs from its parent; empty: as its parent"},
    trimColor: {type: "string", description: "The colour of its corner boards and frames #RRGGBB when it differs from its parent; empty: as its parent"}}}} : null;
  // an animal building's pasture: the wall the animals go out on and how far out the fence goes
  const ps = kind.objects && kind.objects.pasture, pasture = ps ? {type: "object", additionalProperties: false, required: ["wall", "depth"], properties: {
    wall: {type: "string", enum: WALLS, description: "The wall the animals go out through to the pasture"},
    depth: {type: "number", description: `How far out from that wall the fence goes, ${ps.depth[0]} to ${ps.depth[1]} m`}}} : null;
  // the game's boxes (feed pad, sleep point ...): only the ones the photos give a reason to move; the rest go where the app puts them
  const kinds = placeable(kind), objects = kinds.length ? {type: "array", description: "Game objects the photos show a place for (an empty list: the app places them all)", items: {type: "object", additionalProperties: false, required: ["type", "wall", "along", "out"], properties: {
    type: {type: "string", enum: kinds, description: kinds.map(t => `${t} = ${objectInfo(kind, t).name}`).join("; ")},
    wall: {type: "string", enum: WALLS, description: "The main building's wall it is beside"},
    along: {type: "number", description: "Its middle along that wall, 0 = the left end, 1 = the right end, seen from outside"},
    out: {type: "number", description: "metres from the wall to its middle"}}}} : null;
  const schema = {
    type: "object", additionalProperties: false, required: ["seen", "settings", "openings", "notes", ...(pasture ? ["pasture"] : []), ...(wings ? ["wings"] : []), ...(objects ? ["objects"] : [])],
    properties: {
      seen: {type: "string", description: "What the photos show: the footprint's shape (rectangle, L, T or U) and the parts it is made of, which wall each photo shows, materials, how you judged the sizes"},
      settings,
      openings: {type: "array", items: opening(wing ? [...WALLS, ...wingWalls] : WALLS), description: "Every window and door on the walls"},
      notes: {type: "string", description: "For the admin: what the app can't match and what to check"},
      ...(pasture ? {pasture} : {}),
      ...(wings ? {wings} : {}),
      ...(objects ? {objects} : {}),
    },
  };
  const animals = !!pasture
    ? `

Animals: the app makes the animals' own way out to the pasture (and the fence) on the pasture's wall by itself. ` +
      `Don't list that opening as a door; set pasture.wall to the side where the animals go out (it must not have a door, and no wing may stand there), and pasture.depth to how far out the fence goes.`
    : "";
  const parts = wing
    ? `

Shape and parts: first decide from the photos what the footprint is made of, and say it in "seen". The longest part is the main building (its long side the front). ` +
      `Every other part is a "wing" (up to ${MAX_WINGS}, in "wings"): the arm of an L, T or U, a small annex, a pump house or a shed. It stands against a wall of the main building (front, back, left, right) or, when it stands on another part, against a wall of a part listed before it in "wings" (see below): a pump house on a wing, a wing on a wing. ` +
      `Give its wall, "along" (like an opening's), width along the wall, depth out from it, floors (0 = as many as the part it stands on; fewer = a lower part with a lower roof), ` +
      `half (1½-plan) and pitch (its own roof angle, 0 = the one of the part it stands on). Rules the app follows: a wing as wide as the part it stands on, or wider than its roof reaches, on a long side meets that roof in a valley (an L when it is at an end, a T in the middle); ` +
      `a lower and narrower one, such as a milk room or porch with its own gable roof, runs up to the wall under the eaves; on a gable end it is a lower annex under the gable. ` +
      `A part meets only the roof of the part it stands on, so it must stand at least half a metre clear of every other part and of the main building's walls (choose the wall where nothing else is near), and can't be on a hip roof's end. ` +
      `Wing number n (in the order of "wings", from 1) has the walls wnEnd (its far end), wnLeft and wnRight (its sides, as you stand outside facing its end): ` +
      `w1End, w1Left, w1Right, w2End ... A part on wing 1's left side has the wall "w1Left" and must be listed after wing 1. Put windows and doors on their walls, also on the walls of parts on parts. A plain rectangular building has no wings. ` +
      `Give each part a short "name" (Pumphus, Bod ...). A part is made of the same materials as the part it stands on (the main building for a part on it) unless it differs, and then you set wallCladding, wallColor, roofMaterial, roofColor and trimColor for it; leave them empty ("") when it looks like its parent: a pump house with its own metal roof and plastered walls, a shed in the house's red. ` +
      `You can walk through a wing into the main building, so a part that is really a separate building (a shed standing apart) isn't a wing.`
    : "";
  const materials = `

Wall materials: Swedish farm buildings often have plastered (white or pale) walls below and boards above. When the lower part of the walls is a different material from the upper, ` +
    `set wallSplit to "floor" (the join at the top of the ground floor) or "height" (with splitHeight, in metres above the ground floor's floor, when it is elsewhere), ` +
    `lowerCladding and lowerColor for the lower part, and wallCladding and wallColor for the upper. The same split is used on every part, so a lower annex gets the lower material all the way up to its gable. ` +
    `Without such a join set wallSplit "one". Colours of weathered paint: give the colour it would have when new.`;
  const doors = `

Doors: "opens" says whether the player can open a door in the game. A door people obviously use is true; one that is nailed shut, blocked, boarded up or only a loft or hay hatch you chose to include is false. A big barn door that is used is true.`;
  const objectText = objects
    ? `

Game objects: the game needs boxes around the building: ${kinds.map(t => `${t} (${objectInfo(kind, t).name}: ${objectInfo(kind, t).hint})`).join("; ")}. ` +
      `The app places them by itself, so leave "objects" empty unless the photos show where one belongs, for example a feed alley or a loading ramp: then give its wall, along and out (the middle's distance from the wall).`
    : "";
  const sections = [];
  for (const [f, title] of fields) {
    let s = sections.find(x => x.title === title);
    if (!s) sections.push(s = {title, lines: []});
    s.lines.push(fieldLine(f));
  }
  const guide = `The app builds a ${kind.name.toLowerCase()}: ${wing ? "a rectangular building, or an L-, T- or U-shaped one made of parts," : "a rectangular building"} with walls, a roof, windows and doors.${parts}

Walls: choose the wall the photos show best, usually the long side with the main doors, as the front. ` +
`${WALL_NAMES.left} is the wall on your left when you stand outside facing the front, ${WALL_NAMES.right.toLowerCase()} the one on your right, ` +
`back the one opposite the front. "width" is the length of the front (and back) wall, "depth" of the side walls. ` +
`The ridge runs along the front with ridge "width", from front to back with "depth".
Heights: "floorHeight" is one full floor's height, so the walls are floors x floorHeight tall (plus a knee wall with a half floor), ` +
`standing on a base "foundation" m high. A barn with one tall storey has floors 1 and a large floorHeight.${materials}

Openings: list every window and door you can see, on the wall it is on. "along" is where its middle is along that wall, ` +
`from 0 at the left end to 1 at the right end, as you see the wall from outside. Doors stand on the ground floor (floor 0, sill 0); ` +
`a pair of doors or a wide barn door is one door up to 3 m wide and 2.6 m tall. A loft door or hatch up in a gable can't be built: ` +
`leave it out and mention it in notes. Window sills are measured from their own floor's floor. A building needs at least one door.${doors}${animals}${objectText}

Settings, by the editor's sections:
${sections.map(s => `${s.title}:\n${s.lines.join("\n")}`).join("\n\n")}`;
  return {guide, schema};
}

const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;

/**
 * The kind's settings from Claude's answer, cleaned like any save (sanitize): out-of-range values
 * clamped, unknown ones dropped, a door added if there is none, windows made up if none were listed.
 */
export function applyAnswer(kindId, answer) {
  const a = answer && typeof answer === "object" ? answer : {};
  const s = a.settings && typeof a.settings === "object" ? a.settings : {};
  const settings = {...s, kind: kindId};
  // the pasture: its wall and depth (the rest of the game objects go where the kind puts them)
  if (a.pasture && typeof a.pasture === "object") Object.assign(settings, {pastureWall: a.pasture.wall, fenceDepth: a.pasture.depth});
  if (Array.isArray(a.wings)) settings.wings = a.wings.filter(w => w && typeof w === "object").map(w => ({wall: w.wall, pos: w.along, width: w.width, depth: w.depth, floors: w.floors, half: w.half, pitch: w.pitch,
    name: w.name, wallCladding: w.wallCladding, wallColor: w.wallColor, roofMaterial: w.roofMaterial, roofColor: w.roofColor, trimColor: w.trimColor}));
  const openings = Array.isArray(a.openings) ? a.openings.filter(o => o && typeof o === "object") : [];
  if (openings.length) {
    settings.windows = openings.map(o => {
      const door = o.type === "door";
      return {wall: o.wall, type: door ? "door" : "window", floor: door ? 0 : num(o.floor), pos: num(o.along, 0.5),
        w: num(o.width, 1), h: num(o.height, door ? 2.1 : 1.2), sill: door ? 0 : num(o.sill, 0.85), style: "default",
        ...(door ? {porch: o.porch, opens: o.opens !== false} : {})};
    });
  }
  const p = sanitize(settings), kind = KIND[kindId], given = Array.isArray(a.objects) ? a.objects.filter(o => o && typeof o === "object") : [];
  if (!given.length) return p;
  // game objects the photos placed: a box beside a wall, in the kind's size; the rest stay where the kind puts them
  const walls = wallsOf(p), types = placeable(kind);
  const placed = given.filter(o => types.includes(o.type) && WALLS.includes(o.wall)).map(o => {
    const w = walls[o.wall], [sw, sd, sh] = OBJECT_TYPES[o.type].size, ax = Math.abs(w.u[0]) > 0.5;
    const along = Math.min(1, Math.max(0, num(o.along, 0.5))) * w.L, out = Math.max(0.5, num(o.out, sd / 2 + 1));
    return {type: o.type, x: w.o[0] + w.u[0] * along + w.n[0] * out, z: w.o[2] + w.u[2] * along + w.n[2] * out,
      w: ax ? sw : sd, d: ax ? sd : sw, h: sh, ix: 0, iz: 0};
  });
  return sanitize({...p, objects: [...p.objects.filter(x => !placed.some(q => q.type === x.type)), ...placed]});
}

/**
 * What is wrong with Claude's answer once it's built, for the admin to see: [string]. Parts that were left out
 * (too close, no room), game objects in the building or the pasture, windows and doors that overlap and are
 * hidden, and more animals than fit.
 */
export function answerProblems(kindId, answer) {
  const a = answer && typeof answer === "object" ? answer : {}, out = [];
  const p = applyAnswer(kindId, answer), asked = Array.isArray(a.wings) ? a.wings.length : 0;
  wingsOf(p).forEach(w => { if (w.off) out.push(`Wing ${w.id} was left out: ${w.off}`); });
  if (asked > p.wings.length) out.push(`${asked - p.wings.length} of the ${asked} wings were dropped (at most ${MAX_WINGS}).`);
  for (const [id, msg] of objectProblems(p)) { const o = p.objects.find(x => x.id === id); out.push(`${o ? objectInfo(KIND[kindId], o.type).name : "An object"}: ${msg}.`); }
  buildGeometry(p);
  const hidden = p.windows.filter(w => w._hidden).length;
  if (hidden) out.push(`${hidden} window${hidden > 1 ? "s or doors overlap" : " or door overlaps"} another or a wing and ${hidden > 1 ? "are" : "is"} hidden: check their places.`);
  const want = a.settings && Math.round(+a.settings.cows || +a.settings.sheep || +a.settings.hens || 0), got = p.cows || p.sheep || p.hens || 0;
  if (want && got && want > got) out.push(`The ${{cow: "cows", sheep: "sheep"}[p.kind] || "hens"} are limited to ${got} by the floor area (Claude asked for ${want}).`);
  return out;
}

/**
 * The same request as a prompt for a chat with Claude (claude.ai), for when the server has no API key
 * or the admin would rather use their subscription: the admin attaches the photos and pastes the
 * answer back (readAnswer). The task is the one the server gives the API (backend/internal/vision).
 */
export function chatPrompt(kindId, notes = "") {
  const {guide, schema} = photoRequest(kindId), kind = KIND[kindId];
  const n = String(notes || "").trim();
  return `I'm making a ${kind.name.toLowerCase()} for Farming Simulator 25 in "House to i3d", a web app that builds buildings ` +
`from settings, and I've attached photos of a real one. Look carefully at every photo, work out the building's shape, proportions, ` +
`roof, cladding, colours, and where its windows and doors are, and answer with settings for the app that make the closest match it can build.

Judge sizes from things of known size: a door is about 2 m tall, a person about 1.8 m, a window about 1 m, a wall board about ` +
`15-20 cm wide, a car about 4.5 m long. Use my notes over your own estimates. Colours are hex codes of the paint as it would look new ` +
`and in daylight, not in shadow.

The app can't build everything a real building has. Pick the nearest option it has, and say in "notes" what doesn't match, and ` +
`what you weren't sure of, so I know what to check. If a wall can't be seen in any photo, give it what such buildings usually have and say so.

<settings_guide>
${guide}
</settings_guide>
${n ? `\n<admin_notes>\n${n}\n</admin_notes>\n` : ""}
Answer with one JSON code block and nothing else, matching this JSON schema (every field is required):

\`\`\`json
${JSON.stringify(schema, null, 1)}
\`\`\``;
}

/**
 * Claude's answer as pasted from a chat: the JSON object in it (in a code block or not, with or
 * without words around it). Throws an Error saying what's wrong when there isn't one.
 */
export function readAnswer(text) {
  const t = String(text || "").trim();
  if (!t) throw new Error("Paste Claude’s answer first.");
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)```/), body = fence ? fence[1] : t;
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("That isn’t Claude’s answer: there’s no JSON in it. Copy the whole code block.");
  let v;
  try { v = JSON.parse(body.slice(a, b + 1)); } catch {
    throw new Error("The JSON in that answer is broken or cut off. Copy the whole code block, or ask Claude to write it again.");
  }
  if (!v || typeof v !== "object" || Array.isArray(v) || (typeof v.settings !== "object" && !Array.isArray(v.openings)))
    throw new Error("That JSON doesn’t have the settings in it. Ask Claude to answer in the format the prompt asks for.");
  return v;
}
