// A building from photos: what to tell Claude about a kind's settings (a guide and the JSON schema of
// its answer) and how to turn the answer into the kind's settings. The server adds the photos and
// sends it (backend/internal/vision); the admin then adjusts the result in the editor. No DOM.
import { SCHEMA, KIND, sanitize, WALLS, WALL_NAMES, PORCH_OPTIONS, WING_WALLS } from "./model.mjs";

/** Sections Claude leaves alone: the game's own places, the inside, the shop. */
const SKIP = new Set(["Game mod", "Game places", "Inside", "Interior", "Farmhouse"]);

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
  required: ["wall", "type", "floor", "along", "width", "height", "sill", "porch"],
  properties: {
    wall: {type: "string", enum: walls},
    type: {type: "string", enum: ["window", "door"]},
    floor: {type: "integer", description: "0 = ground floor, 1 = the floor above ..."},
    along: {type: "number", description: "Middle of the opening along the wall, 0 = its left end, 1 = its right end, seen from outside"},
    width: {type: "number", description: "metres"},
    height: {type: "number", description: "metres"},
    sill: {type: "number", description: "metres from that floor's floor to the bottom of the opening; 0 for doors"},
    porch: {type: "string", enum: PORCH_OPTIONS.map(o => o[0]), description: "What is in front of a door; none for windows"},
  },
});

/**
 * What to send Claude for a kind of building: {guide, schema}. The answer is
 * {seen, settings, openings, notes}; every field is required, so Claude decides each one.
 */
export function photoRequest(kindId) {
  const kind = KIND[kindId];
  if (!kind) throw new Error("unknown kind " + kindId);
  const fields = photoFields(kindId);
  const wing = fields.some(([f]) => f.k === "wing");
  const settings = {type: "object", additionalProperties: false, required: fields.map(([f]) => f.k), properties: {}};
  for (const [f] of fields) settings.properties[f.k] = fieldSchema(f);
  // an animal building's pasture: the wall the animals go out on and how far out the fence goes
  const ps = kind.objects && kind.objects.pasture, pasture = ps ? {type: "object", additionalProperties: false, required: ["wall", "depth"], properties: {
    wall: {type: "string", enum: WALLS, description: "The wall the animals go out through to the pasture"},
    depth: {type: "number", description: `How far out from that wall the fence goes, ${ps.depth[0]} to ${ps.depth[1]} m`}}} : null;
  const schema = {
    type: "object", additionalProperties: false, required: ["seen", "settings", "openings", "notes", ...(pasture ? ["pasture"] : [])],
    properties: {
      seen: {type: "string", description: "What the photos show: the footprint's shape (rectangle, L or T), which wall each photo shows, materials, how you judged the sizes"},
      settings,
      openings: {type: "array", items: opening(wing ? [...WALLS, ...WING_WALLS] : WALLS), description: "Every window and door on the walls"},
      notes: {type: "string", description: "For the admin: what the app can't match and what to check"},
      ...(pasture ? {pasture} : {}),
    },
  };
  const animals = !!pasture
    ? `

Animals: the app makes the animals' own way out to the pasture (and the fence) on the pasture's wall by itself. ` +
      `Don't list that opening as a door; set pasture.wall to the side where the animals go out (it must not have a door), and pasture.depth to how far out the fence goes.`
    : "";
  const wingText = wing
    ? `

Shape: first decide from the photos whether the footprint is a rectangle, an L or a T, and say which in "seen". ` +
      `L- and T-shaped houses are built: the longest part is the house (its long side the front), the other part a wing on one of its walls (wingWall), ` +
      `wingPos along that wall like an opening's "along", wingWidth across it and wingDepth out from the wall. The wing has the house's ` +
      `floors and roof pitch; on a long side its roof meets the house's in a valley, on a gable end it is a lower annex. ` +
      `Its openings go on its own walls: wingEnd (its far end), wingLeft and wingRight (its sides, as you stand outside facing wingEnd). ` +
      `A plain rectangular house has wing false.`
    : "";
  const sections = [];
  for (const [f, title] of fields) {
    let s = sections.find(x => x.title === title);
    if (!s) sections.push(s = {title, lines: []});
    s.lines.push(fieldLine(f));
  }
  const guide = `The app builds a ${kind.name.toLowerCase()}: ${wing ? "a rectangular building, or an L- or T-shaped one with a wing," : "a rectangular building"} with walls, a roof, windows and doors.${wingText}

Walls: choose the wall the photos show best, usually the long side with the main doors, as the front. ` +
`${WALL_NAMES.left} is the wall on your left when you stand outside facing the front, ${WALL_NAMES.right.toLowerCase()} the one on your right, ` +
`back the one opposite the front. "width" is the length of the front (and back) wall, "depth" of the side walls. ` +
`The ridge runs along the front with ridge "width", from front to back with "depth".
Heights: "floorHeight" is one full floor's height, so the walls are floors x floorHeight tall (plus a knee wall with a half floor), ` +
`standing on a base "foundation" m high. A barn with one tall storey has floors 1 and a large floorHeight.

Openings: list every window and door you can see, on the wall it is on. "along" is where its middle is along that wall, ` +
`from 0 at the left end to 1 at the right end, as you see the wall from outside. Doors stand on the ground floor (floor 0, sill 0); ` +
`a pair of doors or a wide barn door is one door up to 3 m wide and 2.6 m tall. A loft door or hatch up in a gable can't be built: ` +
`leave it out and mention it in notes. Window sills are measured from their own floor's floor. A building needs at least one door.${animals}

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
  const openings = Array.isArray(a.openings) ? a.openings.filter(o => o && typeof o === "object") : [];
  if (openings.length) {
    settings.windows = openings.map(o => {
      const door = o.type === "door";
      return {wall: o.wall, type: door ? "door" : "window", floor: door ? 0 : num(o.floor), pos: num(o.along, 0.5),
        w: num(o.width, 1), h: num(o.height, door ? 2.1 : 1.2), sill: door ? 0 : num(o.sill, 0.85), style: "default",
        ...(door ? {porch: o.porch} : {})};
    });
  }
  return sanitize(settings);
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
