import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { effectiveRole } from "@/lib/roles";
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

// Applying is open to anyone with an account, including a plain member — the
// whole point is that the applicant does not work here yet. The account is
// what stops this being an anonymous spam endpoint.
const PER_ACCOUNT = { limit: 5, windowSeconds: 3600 };

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const stored = await ensureData();

  // Not a level check: `member` sits at the same level as a visitor, and a
  // member must be able to apply. What matters is that the account still
  // exists, which is exactly what effectiveRole resolves.
  if (effectiveRole(stored, session) === "public") {
    return NextResponse.json(
      { error: "Sign in to apply." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `applications:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "You have sent several applications in the past hour. Give us a chance to read them."
    );
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const username = String(body.username || "").slice(0, 40).trim();
  const discord = String(body.discord || "").slice(0, 60).trim();
  const role = String(body.role || "").slice(0, 80).trim();
  const wage = String(body.wage || "").slice(0, 120).trim();
  const experience = String(body.experience || "").slice(0, 2000).trim();
  const references = String(body.references || "").slice(0, 1000).trim();
  const notes = String(body.notes || "").slice(0, 2000).trim();

  if (!username || !role) {
    return NextResponse.json(
      { error: "Give your in-game name and the role you want." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const entry = {
    ts: new Date().toISOString().slice(0, 10),
    username,
    discord,
    role,
    wage,
    experience,
    references,
    notes,
    status: "New",
    // The account that filed it, which is not necessarily the in-game name
    // typed above.
    account: session.username,
  };

  const data = stored;
  data.applications = [...(data.applications || []), entry].slice(-200);
  await writeData(data);

  // No Discord post, for the same reason client desk requests do not send one:
  // an application names a person and states what they want to be paid.

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
