// Sets Content-Security-Policy: frame-ancestors on every page. Here and not in next.config.ts headers(), which is fixed when the app is built
// (FRAME_ANCESTORS has to be a setting of the running container).
import { NextResponse } from "next/server";
import { frameAncestorsHeader } from "@/lib/frame.mjs";

export function proxy() {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", frameAncestorsHeader());
  return res;
}

export const config = { matcher: "/((?!_next/static|_next/image).*)" };
