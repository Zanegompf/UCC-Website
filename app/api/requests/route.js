import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { postToDiscord } from "@/lib/discord";
import {
  rateLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;

// Each of these appends to the record and fires a Discord webhook, so an
// account left signed in on a shared machine is a spam cannon otherwise.
const PER_ACCOUNT = { limit: 10, windowSeconds: 3600 };

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const stored = await ensureData();
  if (levelOf(effectiveRole(stored, session)) < LEVEL.client) {
    return NextResponse.json({ error: "Sign in to use the client desk." }, { status: 403 });
  }

  const limited = await rateLimit({
    key: `requests:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "You have filed a lot of requests in the past hour. Give the desk a moment."
    );
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);
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

  const data = stored;
  data.requests = [...(data.requests || []), entry].slice(-200);
  await writeData(data);

  await postToDiscord(data, {
    event: "Client requests",
    title: "New client request — " + entry.type,
    body: entry.detail,
    footer: entry.from + (entry.contact ? " · " + entry.contact : ""),
    color: 0xb8892b,
  });

  return NextResponse.json({ ok: true });
}
