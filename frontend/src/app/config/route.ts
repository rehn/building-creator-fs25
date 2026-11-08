// The settings the browser needs from the server's environment, read when asked (not when the app was built):
//   MAX_PARTS  the most parts (wings, at any depth) a building can have besides its main part: 12 if not set, at most 40.
export const dynamic = "force-dynamic";

export function GET() {
  const n = Math.floor(Number(process.env.MAX_PARTS));
  return Response.json({ maxParts: Number.isFinite(n) && n > 0 ? n : 12 }, { headers: { "Cache-Control": "no-store" } });
}
