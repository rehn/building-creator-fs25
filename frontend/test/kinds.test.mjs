import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, CATEGORIES, kindOf } from "../src/editor/kinds/index.mjs";
import { PRESETS, SCHEMA, sanitize, buildI3d, placeableXml, placeableSnippet, defaultModDescription } from "../src/editor/model.mjs";

// Every kind of building is a module with the same shape (see src/editor/kinds/index.mjs).
test("kinds: every kind has the whole interface", () => {
  const titles = new Set(SCHEMA.map(g => g.title));
  for (const k of KINDS) {
    assert.match(k.id, /^[a-z]+$/, "id");
    assert.ok(k.name, `${k.id}: name`);
    assert.ok(CATEGORIES.some(c => c.id === k.category), `${k.id}: category ${k.category}`);
    assert.equal(typeof k.walkIn, "boolean", `${k.id}: walkIn`);
    for (const f of ["normalize", "placeable", "description", "scene"]) assert.equal(typeof k[f], "function", `${k.id}: ${f}`);
    if (k.walkIn) {
      assert.equal(typeof k.furnish, "function", `${k.id}: a walk-in kind finishes its floor`);
      assert.ok(k.catalog && Object.keys(k.catalog).length, `${k.id}: a walk-in kind has pieces to place`);
      assert.equal(typeof k.autoFurnish, "function", `${k.id}: and can fill its inside automatically`);
      for (const [type, d] of Object.entries(k.catalog)) {
        assert.ok(d.name && ["wall", "floor"].includes(d.mount), `${k.id}.${type}: name, mount`);
        for (const f of ["size", "height", "build"]) assert.equal(typeof d[f], "function", `${k.id}.${type}: ${f}`);
        for (const f of d.params) assert.ok(f.k in d.defaults && f.label, `${k.id}.${type}.${f.k}: default and label`);
      }
    }
    assert.ok(Array.isArray(k.sections) && Array.isArray(k.hides) && k.defaults, `${k.id}: sections, hides, defaults`);
    for (const t of k.hides) assert.ok(titles.has(t), `${k.id} hides "${t}", which isn't a section`);
    assert.ok(k.presets.length >= 1, `${k.id}: at least one preset`);
  }
  assert.equal(new Set(KINDS.map(k => k.id)).size, KINDS.length, "unique ids");
});

test("kinds: a save without a kind, or with an unknown one, is a farmhouse", () => {
  assert.equal(kindOf({}).id, "house");
  assert.equal(kindOf({ kind: "spaceship" }).id, "house");
  assert.equal(kindOf(null).id, "house");
});

test("presets: every preset of every kind makes a valid project and exports", () => {
  assert.equal(new Set(PRESETS.map(x => x.id)).size, PRESETS.length, "unique preset ids");
  for (const x of PRESETS) {
    const p = sanitize(x.settings);
    assert.equal(p.kind, x.kind, `${x.id}: kind`);
    assert.ok(CATEGORIES.some(c => c.id === x.category), `${x.id}: category`);
    const { type } = kindOf(p).placeable(p);
    assert.match(placeableXml(p, x.name), new RegExp(`<placeable type="${type}">`), x.id);
    assert.match(placeableSnippet(p), /<i3dMappings>/, x.id);
    assert.match(buildI3d(p), /<\/i3D>/, x.id);
    assert.ok(defaultModDescription(p).length > 10, x.id);
  }
});

test("settings: a kind's own settings only exist on that kind", () => {
  assert.equal("hens" in sanitize({}), false, "a farmhouse has no hens");
  assert.equal(sanitize({ kind: "chicken" }).hens, 30);
});

test("settings: kinds can share a key with their own ranges (a hen house's and a cow barn's pasture depth)", () => {
  assert.equal(sanitize({ kind: "chicken", fenceDepth: 7 }).fenceDepth, 7, "a hen pasture may be 7 m deep");
  assert.equal(sanitize({ kind: "cow", fenceDepth: 7 }).fenceDepth, 10, "a cow pasture at least 10 m");
});
