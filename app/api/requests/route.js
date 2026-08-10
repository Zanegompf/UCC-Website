import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL } from "@/lib/roles";
import { postToDiscord } from "@/lib/discord";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const session = await getSession();
  if (levelOf(session.role) < LEVEL.client) {
    return NextResponse.json({ error: "Sign in to use the client desk." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const from = String(body.from || "").slice(0, 60).trim();
  const detail = String(body.detail || "").slice(0, 2000).trim();

  if (!from || !detail) {
    return NextResponse.json({ error: "Add your name and what you need." }, { status: 400 });
  }

  const entry = {
    ts: new Date().toISOString().slice(0, 10),
    from,
    contact: String(body.contact || "").slice(0, 60).trim(),
    type: String(body.type || "Something else").slice(0, 80),
    detail,
    status: "New",
    account: session.username,
  };

  const data = await ensureData();
  data.requests = [...(data.requests || []), entry].slice(-200);
  await writeData(data);

  await postToDiscord(data, {
    title: "New client request — " + entry.type,
    body: entry.detail,
    footer: entry.from + (entry.contact ? " · " + entry.contact : ""),
    color: 0xb8892b,
  });

  return NextResponse.json({ ok: true });
}
