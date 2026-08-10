import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { postToDiscord } from "@/lib/discord";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const session = await getSession();
  const data = await ensureData();

  if (levelOf(effectiveRole(data, session)) < LEVEL.exec) {
    return NextResponse.json({ error: "Executives only." }, { status: 403 });
  }

  const { title = "", body = "" } = await req.json().catch(() => ({}));
  const result = await postToDiscord(data, { title, body });

  return NextResponse.json({ message: result });
}
