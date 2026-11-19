// The settings the browser needs from the server's environment, read when asked (not when the app was built):
//   MAX_PARTS    the most parts (wings, at any depth) a building can have besides its main part: 12 if not set, at most 40.
//   APP_VERSION  the release this web app is (the image sets it: 1.2.3, edge or dev).
export const dynamic = "force-dynamic";

export function GET() {
  const n = Math.floor(Number(process.env.MAX_PARTS));
  return Response.json({ maxParts: Number.isFinite(n) && n > 0 ? n : 12, version: process.env.APP_VERSION || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
