// The reference building: GET /api/v1/reference-building. A map program that places our buildings wants to know whether it has the orientation right
// before it places hundreds. This is a house nobody can mistake: an L (main part 12 x 8 m, a 5 x 6 m wing at the back towards the east end),
// whose FRONT wall is painted red and the rest white, made once as it is (angle 0) and once turned 30 degrees counter-clockwise about the main part's middle.
// Put both on a map: the red wall must face south for the first and south turned 30 degrees for the second, the wing must be at the back (north) and to the east,
// and the building must not be mirrored (a mirrored one has its wing at the west end).
import { osmToHouse } from "../editor/osm.mjs";

export const FRONT_COLOR = "#c0392b";
const MAIN = { x0: 100, y0: 200, w: 12, d: 8 };
const WING = { x0: 107, w: 5, d: 6 };           // north of the main part, flush with its east end
const FOOTPRINT = [[100, 200], [112, 200], [112, 214], [107, 214], [107, 208], [100, 208]];
const CENTRE = [MAIN.x0 + MAIN.w / 2, MAIN.y0 + MAIN.d / 2];
const TAGS = { building: "house", "building:levels": "1", "roof:shape": "gabled", "building:colour": "white", "roof:colour": "gray", name: "Reference L" };

const round = v => Math.round(v * 1000) / 1000;
const turn = ([x, y], deg) => {
  const r = deg * Math.PI / 180, dx = x - CENTRE[0], dy = y - CENTRE[1];
  return [round(CENTRE[0] + dx * Math.cos(r) - dy * Math.sin(r)), round(CENTRE[1] + dx * Math.sin(r) + dy * Math.cos(r))];
};

/** [{id, name, footprint, tags, result (osmToHouse's answer), placement, outline (its footprint), settings (with the red front wall), frontWall: {from, to, faces}}] */
export function referenceBuildings() {
  return [0, 30].map(deg => {
    const footprint = FOOTPRINT.map(pt => turn(pt, deg));
    const id = `reference/L-${deg}`;
    const result = osmToHouse({ footprint, tags: TAGS, id });
    if (!("placement" in result)) throw new Error(`The reference building failed: ${result.error}`);
    const settings = { ...result.settings, wallStyles: { front: { wallColor: FRONT_COLOR } } };
    // seen from outside, the front wall's left end is the west corner (-x of the building), its right end the east one
    const frontWall = { from: turn([MAIN.x0, MAIN.y0], deg), to: turn([MAIN.x0 + MAIN.w, MAIN.y0], deg), faces: deg ? `south turned ${deg} degrees counter-clockwise` : "south" };
    return { id, name: `${result.name} ${deg}`, footprint, tags: TAGS, result, placement: result.placement, outline: result.footprint, settings, frontWall };
  });
}
