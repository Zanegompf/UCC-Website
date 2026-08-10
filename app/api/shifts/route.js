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

// A shift log is a payroll record, so this is looser than the client desk —
// somebody catching up on a week of forgotten entries is normal, and being
// refused would just push the log back into Discord.
const PER_ACCOUNT = { limit: 30, windowSeconds: 3600 };

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const stored = await ensureData();

  if (levelOf(effectiveRole(stored, session)) < LEVEL.staff) {
    return NextResponse.json(
      { error: "Company staff only." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `shifts:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "That is a lot of shifts in one hour. Pause a moment."
    );
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const username = String(body.username || "").slice(0, 40).trim();
  const occupation = String(body.occupation || "").slice(0, 80).trim();
  const timeIn = String(body.timeIn || "").slice(0, 40).trim();
  const timeOut = String(body.timeOut || "").slice(0, 40).trim();
  const output = String(body.output || "").slice(0, 2000).trim();

  if (!username || !occupation || !timeIn || !timeOut) {
    return NextResponse.json(
      { error: "Give a name, an occupation, and both times." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const entry = {
    ts: new Date().toISOString().slice(0, 10),
    username,
    occupation,
    timeIn,
    timeOut,
    output,
    // Who was signed in when this was filed, which is not necessarily the
    // in-game name typed above. Payroll disputes need both.
    account: session.username,
  };

  const data = stored;
  data.shifts = [...(data.shifts || []), entry].slice(-200);
  await writeData(data);

  await postToDiscord(data, {
    event: "Shift log",
    title: `Shift logged — ${entry.username}`,
    body:
      `**${entry.occupation}**\n${entry.timeIn} → ${entry.timeOut}` +
      (entry.output ? `\n\n${entry.output}` : ""),
    footer: entry.ts + " · filed by " + entry.account,
    color: 0x1c7554,
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
