import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
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

// Executives are trusted, but a stolen exec cookie should not be able to empty
// the webhook's reputation into the server's announcement channel.
const PER_ACCOUNT = { limit: 20, windowSeconds: 3600 };

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const data = await ensureData();

  if (levelOf(effectiveRole(data, session)) < LEVEL.exec) {
    return NextResponse.json({ error: "Executives only." }, { status: 403 });
  }

  const limited = await rateLimit({
    key: `discord:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of posts in one hour. Pause a moment.");
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const title = String(body.title || "").slice(0, 256);
  const text = String(body.body || "").slice(0, 2000);

  const result = await postToDiscord(data, { title, body: text });

  return NextResponse.json(
    { message: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}
