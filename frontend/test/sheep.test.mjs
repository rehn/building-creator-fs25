import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, KIND, sanitize, buildGeometry, buildI3d, placeableXml, placementAreas, catalogFor, gamePlaces } from "../src/editor/model.mjs";
import { roomOf, problems } from "../src/editor/layout.mjs";
import { sheepCap, MAX_SHEEP } from "../src/editor/kinds/sheep.mjs";
import { objectProblems, objectInfo } from "../src/editor/objects.mjs";

const sheep = (o = {}) => sanitize({ kind: "sheep", width: 12, depth: 8, sheep: 20, floors: 1, floorHeight: 3, ...o });
const presets = () => PRESETS.filter(x => x.kind === "sheep");





