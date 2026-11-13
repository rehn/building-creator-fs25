// The model files of a building that the editor sends to the server each time it saves, for other programs that draw the building or put it
// in a map: an OBJ and its MTL (colours), and a game mod zip (modDesc.xml, house.xml, house.i3d, the XML's paths relative to the zip's root).
// Plain colours, no textures, no shop picture and no imported items of the user's own (they stay stand-ins). No DOM, so tests run it too.
import JSZip from "jszip";
import { sanitize, buildObj, buildI3d, placeableXml, modDescXml, MOD_FILES } from "./model.mjs";

// An i3d says it is ISO-8859-1, so that is how its bytes are written.
const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);

/** {obj, mtl, mod}: two texts and the zip as a Uint8Array, for the building with these settings (as the editor saves them) called name. */
export async function modelBundle(settings, name, {author = ""} = {}) {
  const p = sanitize(settings);
  const {obj, mtl} = buildObj(p);
  const zip = new JSZip();
  zip.file("modDesc.xml", modDescXml(p, name, {author, icon: false}));
  zip.file(MOD_FILES.xml, placeableXml(p, name, {image: false}));
  zip.file(MOD_FILES.i3d, latin1(buildI3d(p, {withTex: false})));
  return {obj, mtl, mod: await zip.generateAsync({type: "uint8array", compression: "DEFLATE"})};
}
