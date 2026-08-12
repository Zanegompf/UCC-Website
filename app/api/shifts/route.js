import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
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

  const bad = (error, status) =>
    NextResponse.json(
      { error },
      { status: status || 400, headers: { "Cache-Control": "no-store" } }
    );

  const data = stored;
  const shifts = Array.isArray(data.shifts) ? data.shifts : [];

  // A shift with no `timeOut` is one somebody is still on. It is matched by
  // `account` rather than by the in-game name, because the name is free text
  // and two people could type the same one.
  const openIndex = shifts.findIndex(
    (s) => s && s.account === session.username && !String(s.timeOut || "").trim()
  );

  /* ----------------------------- clocking out ---------------------------- */

  if (body.action === "out") {
    if (openIndex < 0) {
      return bad("You are not clocked in. Clock in first, then out at the end.");
    }

    const timeOut = String(body.timeOut || "").slice(0, 40).trim();
    if (!timeOut) return bad("Give the time you finished.");

    const output = String(body.output || "").slice(0, 2000).trim();
    const next = [...shifts];
    next[openIndex] = { ...next[openIndex], timeOut, output };

    data.shifts = next;
    await writeData(data);

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  /* ------------------------------ clocking in ---------------------------- */

  if (openIndex >= 0) {
    // Otherwise a second clock-in would strand the first shift open forever,
    // and payroll would be reading a row nobody can close.
    const open = shifts[openIndex];
    return bad(
      `You are already clocked in — ${open.occupation || "a shift"} from ${
        open.timeIn || "earlier"
      }. Clock out of that first.`,
      409
    );
  }

  const username = String(body.username || "").slice(0, 40).trim();
  const occupation = String(body.occupation || "").slice(0, 80).trim();
  const timeIn = String(body.timeIn || "").slice(0, 40).trim();

  if (!username || !occupation || !timeIn) {
    return bad("Give a name, an occupation and the time you started.");
  }

  const entry = {
    ts: new Date().toISOString().slice(0, 10),
    username,
    occupation,
    timeIn,
    // Filled in on the way out. Empty is what marks the shift as still open.
    timeOut: "",
    output: "",
    // Who was signed in when this was filed, which is not necessarily the
    // in-game name typed above. Payroll disputes need both.
    account: session.username,
  };

  // The cap trims from the front, so an open shift could in principle be
  // trimmed away before it is closed. At 200 rows that needs a very busy
  // week, and losing the oldest row beats letting the list grow unbounded.
  data.shifts = [...shifts, entry].slice(-200);
  await writeData(data);

  // No Discord post. Posting a notice is the only thing on this site that is
  // allowed to reach a webhook; a shift is filed several times a day and would
  // bury the channel. It lands in the staff room, which is where payroll is
  // worked out from anyway.

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
