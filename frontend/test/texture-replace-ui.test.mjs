// A saved texture can be edited again (Lars, 2026-11-25): its finished picture is opened in the editor and saved over it (PUT /api/textures/{id}).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = p => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");

test("the api can replace a texture's files", () => {
  assert.match(src("lib/api.ts"), /replaceTexture: \(id: string, form: FormData\) => send<Texture>\("PUT", "\/textures\/"/);
});

test("each texture in the list has a button that opens its picture in the editor, and Save puts it in the same texture", () => {
  const page = src("app/textures/page.tsx");
  assert.match(page, /async function editPicture\(/);
  assert.match(page, /onClick=\{\(\) => editPicture\(x\)\}/);
  assert.match(page, /decodeDds\(new Uint8Array\(await api\.textureFile\(x\.id, "diffuse"\)\)\)/);
  assert.match(page, /replacing: string \| null/);
  assert.match(page, /draft\.replacing \? await api\.replaceTexture\(draft\.replacing, form\) : await api\.createTexture\(form\)/);
  assert.match(page, /Save changes/);
});
