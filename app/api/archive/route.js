import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { ARCHIVED_LISTS } from "@/lib/archive";
import { CAPS } from "@/lib/caps";
import {
  rateLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024;

// Restoring is rare and deliberate — a handful after a mis-click at most.
const PER_ACCOUNT = { limit: 20, windowSeconds: 3600 };

/**
 * Puts a deleted row back on the record.
 *
 * Executive, matching the control room page it is reached from. Note this is
 * looser than deleting a legal filing, which is chief executive only: putting
 * something back is a recovery, not a destruction, and an executive who could
 * not undo their own mis-click would have to retype it instead.
 */
export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const data = await ensureData();

  if (levelOf(effectiveRole(data, session)) < LEVEL.exec) {
    return NextResponse.json(
      { error: "Executives only." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `archive:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of restoring in one hour.");
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const bad = (error, status) =>
    NextResponse.json(
      { error },
      { status: status || 400, headers: { "Cache-Control": "no-store" } }
    );

  if (body.action !== "restore") return bad("Unknown action.");

  const id = String(body.id || "").trim();
  if (!id) return bad("Which record should come back?");

  const archive = Array.isArray(data.deleted) ? data.deleted : [];
  const at = archive.findIndex((r) => r && r.id === id);
  if (at < 0) return bad("That is no longer in the deleted records.", 404);

  const row = archive[at];
  const key = row.kind;

  if (!Object.prototype.hasOwnProperty.call(ARCHIVED_LISTS, key)) {
    return bad("That kind of record cannot be restored.");
  }

  const entry = row.entry;
  if (!entry || typeof entry !== "object") {
    return bad("That row did not keep enough to put back.");
  }

  const list = Array.isArray(data[key]) ? data[key] : [];

  // Two rows sharing an id would break the very things ids exist for — the
  // archive's diff reads them into a Set, and a filing's comments are addressed
  // by one. In practice this means it has already been restored.
  if (entry.id && list.some((e) => e && e.id === entry.id)) {
    return bad("That one is already back on the record.", 409);
  }

  // Appending to a full list would push the oldest row off at the cap, and that
  // row would go without ever reaching the archive. Refuse and say so rather
  // than trade one record for another.
  const cap = CAPS[key];
  if (cap && list.length >= cap) {
    return bad(
      `The ${ARCHIVED_LISTS[key].toLowerCase()} list is full at ${cap}. Remove something before restoring this.`,
      409
    );
  }

  // Goes to the end of the list rather than its old position: nothing records
  // where it sat, and the rows around it have moved on since. It keeps its own
  // `ts`, so it still reads with the date it was originally filed.
  data[key] = [...list, entry];
  data.deleted = archive.filter((_, i) => i !== at);

  await writeData(data);

  return NextResponse.json(
    { ok: true, kind: key, label: ARCHIVED_LISTS[key] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
