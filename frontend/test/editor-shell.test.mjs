// The pages where one thing is edited (a building, a prop, a mod) are made with EditorShell (top bar, sub-bar, work area), so they look alike
// (docs/DESIGN.md "Editor pages"). A new editor page is added to this list; a page that builds its own bar instead fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGES = ["projects/[id]", "builder/[id]", "mods/[id]"];
for (const page of PAGES) {
  test(`${page} is made with EditorShell`, () => {
    const src = readFileSync(new URL(`../src/app/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /<EditorShell[\s>]/, "uses the shell");
    assert.ok(!/className="editor-bar"/.test(src.replace(/<div className="editor-bar" role="alert">/g, "")), "no bar of its own besides the alerts");
    assert.ok(!/<TopBar/.test(src), "the shell has the top bar");
  });
}
