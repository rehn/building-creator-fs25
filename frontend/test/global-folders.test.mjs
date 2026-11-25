// The folders are the app's own (docs/PLAN_MALLAR.md: Lars, 2026-11-25): buildings, props and mods use the same ones and one can be made before anything is in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { folderNames } from "../src/lib/folders.mjs";

const src = p => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");

test("the folder names of several lists are one list: no empty name, no twice, in order", () => {
  assert.deepEqual(folderNames(["Hallsberg", "", "Askersund"], ["hallsberg", "Askersund"], undefined), ["Askersund", "hallsberg", "Hallsberg"]);
  assert.deepEqual(folderNames([], []), []);
});

test("the api can list and make folders, and a mod has one", () => {
  const api = src("lib/api.ts");
  assert.match(api, /folders: \(\) =>/);
  assert.match(api, /createFolder: \(name: string\) =>/);
  assert.match(api, /interface Mod \{[^}]*folder\?: string/s);
  assert.match(api, /updateMod: \(id: string, patch: \{[^}]*folder\?: string/);
});

test("the pages for buildings and mods choose a folder with the same select and read the app's folders", () => {
  for (const page of ["app/page.tsx", "app/mods/page.tsx", "app/mods/[id]/page.tsx"]) {
    const s = src(page);
    assert.match(s, /<FolderSelect[\s>]/, page + " has the folder select");
    assert.match(s, /useFolders\(/, page + " reads the app's folders");
  }
});

test("a folder can be renamed and deleted from the lists of buildings and mods", () => {
  const api = src("lib/api.ts");
  assert.match(api, /renameFolder: \(from: string, to: string\)/);
  assert.match(api, /deleteFolder: \(name: string\)/);
  for (const page of ["app/page.tsx", "app/mods/page.tsx"]) {
    const s = src(page);
    assert.match(s, /<FolderActions[\s>]/, page + " has rename and delete for the folder shown");
    assert.match(s, /appFolders\.rename\(/);
    assert.match(s, /appFolders\.remove\(/);
  }
});

// Lars could not add a folder and saw nothing: a folder that could not be made (the server did not answer or did not know the route) was dropped without a word in the select.
test("a folder that cannot be made is told, in the select of every page that has one", () => {
  const sel = src("components/FolderSelect.tsx");
  assert.match(sel, /onError\?: \(message: string\) => void/);
  assert.ok(!/catch \{ return; \}/.test(sel), "the failure is not dropped");
  assert.match(sel, /onError\?\.\(/);
  for (const page of ["app/page.tsx", "app/mods/page.tsx", "app/mods/[id]/page.tsx"]) assert.match(src(page), /<FolderSelect[\s\S]{0,500}?onError=\{setError\}/, page);   // (the attributes have "=>" in them: no [^>])
});
