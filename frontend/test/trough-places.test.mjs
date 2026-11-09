// An animal at the trough reaches about 2 m behind the place it stands at: a place with the barn's wall (or the fence) just behind it isn't used (the cow stood in the wall).
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildI3d } from "../src/editor/model.mjs";

const places = (p, group) => [...buildI3d(p).matchAll(new RegExp(`name="${group}\\d+"[^>]*translation="([^"]+)"`, "g"))].map(m => m[1].split(" ").map(Number));

test("food places stay away from a side with the barn's wall close behind", () => {
  const base = sanitize(PRESETS.find(x => x.id === "ladugard").settings);
  // the feed trough 1.5 m out from the back wall (z = -4.5): a place on its wall side would be at z -4.95 with the cow's body in the wall
  const objects = base.objects.map(o => o.type === "feedTrough" ? {...o, z: -6.0} : o);
  const p = sanitize({...base, objects});
  const spots = places(p, "foodPlace");
  assert.ok(spots.length > 0, "places");
  for (const [, , z] of spots) assert.ok(z < -6.0, `a place at z=${z} is on the wall side`);
});
