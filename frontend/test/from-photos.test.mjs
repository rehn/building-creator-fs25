// A building from photos: what Claude is told about each kind's settings, and its answer turned into settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoRequest, photoFields, applyAnswer } from "../src/editor/fromPhotos.mjs";
import { KINDS, fieldsFor, KIND } from "../src/editor/model.mjs";

// Structured outputs take a subset of JSON schema: every object closed and fully required, no ranges.
function checkSchema(s, path = "$") {
  for (const k of ["minimum", "maximum", "pattern", "minLength", "maxLength", "format"]) assert.ok(!(k in s), `${path}: no ${k}`);
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${path} is closed`);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: every property is required`);
    for (const [k, v] of Object.entries(s.properties)) checkSchema(v, `${path}.${k}`);
  }
  if (s.type === "array") checkSchema(s.items, `${path}[]`);
}

test("from photos: every kind's request is a valid answer schema with a guide to each setting", () => {
  for (const kind of KINDS) {
    const {guide, schema} = photoRequest(kind.id);
    checkSchema(schema);
    const fields = photoFields(kind.id).map(([f]) => f);
    assert.ok(fields.length > 20, kind.id);
    for (const f of fields) {
      assert.ok(schema.properties.settings.properties[f.k], `${kind.id}: ${f.k} in the schema`);
      assert.ok(guide.includes(`- ${f.k} `) || guide.includes(`- ${f.k}:`), `${kind.id}: ${f.k} in the guide`);
      if (f.type === "select") assert.deepEqual(schema.properties.settings.properties[f.k].enum, f.options.map(o => o[0]));
    }
    // the game's own places, the shop and the inside are the admin's, not Claude's
    for (const k of ["modPrice", "modAuthor", "modDescription", "sleepPoint", "interior"]) assert.ok(!fields.some(f => f.k === k), `${kind.id}: no ${k}`);
    assert.ok(JSON.stringify(schema).length < 64 << 10, "fits what the server takes");
    assert.ok(guide.length < 64 << 10);
  }
  // a kind's own settings are there, with its own range
  const cow = photoRequest("cow");
  assert.ok(cow.schema.properties.settings.properties.cows);
  assert.match(cow.schema.properties.pasture.properties.depth.description, new RegExp(`${KIND.cow.objects.pasture.depth[0]} to`), "the pasture with the kind's own range");
  assert.ok(!photoRequest("house").schema.properties.settings.properties.cows);
  assert.throws(() => photoRequest("spaceship"));
});

const answer = {
  seen: "Photo 1 shows the front.",
  settings: {width: 28, depth: 12, floors: 1, floorHeight: 3.6, roofType: "gable", roofPitch: 99, wallColor: "#8a2b1d", cows: 40, roofMaterial: "thatch", nonsense: 1},
  openings: [
    {wall: "front", type: "door", floor: 2, along: 0.5, width: 2.8, height: 2.5, sill: 1, porch: "none"},
    {wall: "front", type: "window", floor: 0, along: 0.2, width: 0.8, height: 0.6, sill: 1.5, porch: "none"},
    {wall: "back", type: "window", floor: 0, along: 0.8, width: 0.8, height: 0.6, sill: 1.5, porch: "none"},
    {wall: "left", type: "door", floor: 0, along: 0.3, width: 1, height: 2.1, sill: 0, porch: "shed"},
  ],
  notes: "Couldn't see the back.",
};

test("from photos: the answer becomes the kind's settings, cleaned", () => {
  const p = applyAnswer("cow", answer);
  assert.equal(p.kind, "cow");
  assert.equal(p.width, 28);
  assert.equal(p.floorHeight, 3.6);
  assert.equal(p.roofPitch, 60, "clamped into range");
  assert.equal(p.wallColor, "#8a2b1d");
  assert.equal(p.roofMaterial, KIND.cow.defaults.roofMaterial ?? "tiles", "an option that doesn't exist falls back");
  assert.ok(!("nonsense" in p));
  const doors = p.windows.filter(w => w.type === "door"), wins = p.windows.filter(w => w.type === "window");
  assert.equal(doors.length, 2);
  assert.equal(wins.length, 2);
  const big = doors.find(d => d.wall === "front");
  assert.deepEqual([big.floor, big.sill, big.pos, big.w, big.h], [0, 0, 0.5, 2.8, 2.5], "a door stands on the ground");
  assert.equal(doors.find(d => d.wall === "left").porch, "shed");
  assert.equal(wins.find(w => w.wall === "back").pos, 0.8);
});

test("from photos: a poor answer still makes a building", () => {
  for (const a of [null, {}, {settings: "x", openings: "y"}, {openings: [null, 5]}]) {
    const p = applyAnswer("chicken", a);
    assert.equal(p.kind, "chicken");
    assert.ok(p.windows.some(w => w.type === "door"), "always a door");
  }
  // windows but no door: a door is added
  const p = applyAnswer("house", {openings: [{wall: "front", type: "window", floor: 0, along: 0.5, width: 1, height: 1.2, sill: 0.9}]});
  assert.ok(p.windows.some(w => w.type === "door"));
});

test("from photos: animal buildings are told the app makes the animals' doorway", () => {
  assert.match(photoRequest("cow").guide, /pasture's wall by itself/);
  assert.match(photoRequest("chicken").guide, /pasture's wall by itself/);
  assert.doesNotMatch(photoRequest("house").guide, /pasture.wall/);
  assert.ok(photoRequest("cow").schema.properties.pasture && !photoRequest("house").schema.properties.pasture);
  const p = applyAnswer("cow", {settings: {}, openings: [], pasture: {wall: "left", depth: 25}});
  assert.deepEqual([p.pastureWall, p.fenceDepth], ["left", 25], "the answer's pasture becomes the barn's");
});

test("from photos: a house's answer can have wings, with openings on their walls", () => {
  const {schema, guide} = photoRequest("house");
  assert.ok(schema.properties.wings && schema.properties.wings.items.properties.floors);
  const walls = schema.properties.openings.items.properties.wall.enum;
  assert.ok(walls.includes("w1End") && walls.includes("w4Right"));
  assert.match(guide, /arm of an L, T or U/);
  const cow = photoRequest("cow").schema;
  assert.ok(cow.properties.wings && cow.properties.openings.items.properties.wall.enum.includes("w1End"), "barns have wings too");
  const p = applyAnswer("house", {settings: {}, wings: [{wall: "back", along: 0.2, width: 6, depth: 5, floors: 0}, {wall: "front", along: 0.8, width: 4, depth: 3, floors: 1}],
    openings: [{wall: "w1End", type: "door", floor: 0, along: 0.5, width: 1, height: 2.1, sill: 0, porch: "porch"},
               {wall: "w2Left", type: "window", floor: 0, along: 0.5, width: 1, height: 1.2, sill: 0.9, porch: "none"}]});
  assert.deepEqual(p.wings.map(w => [w.id, w.wall, w.pos, w.floors]), [[1, "back", 0.2, 0], [2, "front", 0.8, 1]]);
  assert.deepEqual(p.windows.map(w => w.wall).sort(), ["w1End", "w2Left"]);
});

test("from photos: a prompt for a chat with Claude, and its answer pasted back", async () => {
  const { chatPrompt, readAnswer } = await import("../src/editor/fromPhotos.mjs");
  const text = chatPrompt("house", "About 12 m long.");
  const {guide, schema} = photoRequest("house");
  assert.ok(text.includes(guide), "the same guide as the API gets");
  assert.ok(text.includes(JSON.stringify(schema, null, 1)), "and the same answer format");
  assert.match(text, /About 12 m long\./);
  assert.match(text, /photos/i);
  assert.doesNotMatch(chatPrompt("house", ""), /<admin_notes>/, "no notes, no notes block");

  const a = {seen: "an L", settings: {width: 12}, openings: [], notes: "check the wing"};
  // a code block, with chat around it, or bare
  for (const pasted of ["```json\n" + JSON.stringify(a, null, 2) + "\n```", "Here you go:\n```\n" + JSON.stringify(a) + "\n```\nHope it helps!", JSON.stringify(a)])
    assert.deepEqual(readAnswer(pasted), a);
  for (const bad of ["", "no json here", "```json\n{\"settings\": [1,2\n```", "[1, 2]", "{\"hello\": 1}"])
    assert.throws(() => readAnswer(bad), /answer|settings|JSON/i, bad);
});

// Claude's answer for a long red barn with an L arm and a small lower annex against the long wall (the plan's example).
const longBarn = {
  seen: "An L-shaped barn: a 40 m stable, an arm at its right end, and a milk room annex.",
  settings: {width: 40, depth: 12, floors: 2, floorHeight: 2.6, roofPitch: 40, roofType: "gable", ridge: "width", cows: 40, wallSplit: "floor", lowerCladding: "plaster", lowerColor: "#F2F0EA", wallCladding: "lockpanel", wallColor: "#8B2A1E", roofMaterial: "metal"},
  openings: [
    {wall: "front", type: "door", floor: 0, along: 0.5, width: 2.4, height: 2.5, sill: 0, porch: "none", opens: true},
    {wall: "front", type: "door", floor: 0, along: 0.65, width: 1, height: 2.1, sill: 0, porch: "none", opens: false},
    {wall: "front", type: "window", floor: 0, along: 0.1, width: 1.2, height: 0.8, sill: 1.1, porch: "none", opens: true},
    {wall: "w2End", type: "door", floor: 0, along: 0.5, width: 1, height: 2.1, sill: 0, porch: "none", opens: true},
  ],
  notes: "",
  pasture: {wall: "back", depth: 25},
  wings: [
    {wall: "front", along: 0.95, width: 12, depth: 20, floors: 0, half: false, pitch: 0},
    {wall: "front", along: 0.2, width: 5, depth: 4, floors: 1, half: false, pitch: 30},
  ],
  objects: [{type: "food", wall: "right", along: 0.1, out: 6}],
};

test("from photos: a long barn with an arm and an annex becomes parts, wall materials, doors and objects", () => {
  const p = applyAnswer("cow", longBarn);
  assert.equal(p.wings.length, 2);
  assert.deepEqual(p.wings.map(w => [w.wall, w.floors, w.pitch]), [["front", 0, 0], ["front", 1, 30]]);
  assert.deepEqual([p.wallSplit, p.lowerCladding, p.lowerColor], ["floor", "plaster", "#F2F0EA"]);
  const doors = p.windows.filter(w => w.type === "door");
  assert.deepEqual(doors.map(d => d.opens).sort(), [false, true, true], "a door shut for good doesn't open");
  assert.deepEqual(p.windows.filter(w => w.type === "window").map(w => w.opens), [undefined], "windows have no such setting");
  // the feed pad where Claude put it: beside the right wall, 6 m out, 1.2 m from its left end ... and the rest where the barn puts them
  const food = p.objects.find(o => o.type === "food");
  assert.ok(Math.abs(food.x - (20 + 6)) < 1e-6 && Math.abs(food.z - (6 - 1.2)) < 1e-6, `${food.x}, ${food.z}`);   // (a right wall runs from the front corner back)
  assert.deepEqual(p.objects.map(o => o.type).sort(), ["bales", "food", "info", "loading", "pasture"]);
  assert.equal(p.pastureWall, "back");
});

test("from photos: the guide explains wall materials, doors that open, parts and game objects", () => {
  const cow = photoRequest("cow"), house = photoRequest("house");
  assert.match(cow.guide, /plastered/);
  assert.match(cow.guide, /wallSplit to "floor"/);
  assert.match(cow.guide, /"opens"/);
  assert.match(cow.guide, /milk room or porch/);
  assert.match(cow.guide, /food \(Feed pad/);
  assert.ok(cow.schema.properties.objects.items.properties.type.enum.every(t => t !== "pasture" && t !== "info"));
  assert.deepEqual(house.schema.properties.objects.items.properties.type.enum, ["sleep"]);
  assert.ok(cow.schema.properties.openings.items.properties.opens);
  assert.ok(cow.schema.properties.openings.items.required.includes("opens"));
});

test("from photos: what is wrong with an answer is listed for the admin", async () => {
  const { answerProblems } = await import("../src/editor/fromPhotos.mjs");
  assert.deepEqual(answerProblems("cow", longBarn), [], "the plan's barn has nothing wrong");
  // a wing in the pasture, one too close to another, and a feed pad inside the building
  const bad = {...longBarn, pasture: {wall: "back", depth: 25}, wings: [{...longBarn.wings[0], wall: "back"}, {...longBarn.wings[0], wall: "back", along: 0.9}], objects: [{type: "food", wall: "back", along: 0.5, out: 0.5}]};
  const msgs = answerProblems("cow", bad).join(" | ");
  assert.match(msgs, /Wing 2 was left out: It is too close/);
  assert.match(msgs, /wing stands in the pasture/i);
  assert.match(msgs, /Feed pad: It.s in the building/);
  // too many cows for the floor
  assert.match(answerProblems("cow", {...longBarn, settings: {...longBarn.settings, width: 10, depth: 8, cows: 90}, wings: []}).join(" "), /cows are limited to/);
  // windows over a wing are hidden
  const over = {...longBarn, openings: [...longBarn.openings, {wall: "front", type: "window", floor: 0, along: 0.2, width: 1, height: 1, sill: 1, porch: "none", opens: true}]};
  assert.match(answerProblems("cow", over).join(" "), /hidden/);
  assert.deepEqual(answerProblems("house", {settings: {}, openings: []}), [], "a plain house");
});
