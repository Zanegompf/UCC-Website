import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { readRegister } from "@/lib/shareholders";
import { entryId } from "@/lib/ids";
import { MAX_SHAREHOLDERS } from "@/lib/caps";
import {
  rateLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

// The register is saved in one go from the share page, not per keystroke, so a
// working session is a handful of saves rather than hundreds.
const PER_ACCOUNT = { limit: 60, windowSeconds: 3600 };

/** A share count: whole shares, never negative, and bounded so one typo cannot
 *  make every other holding round to nothing on the chart. */
const MAX_SHARES = 1e12;

function readShares(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, MAX_SHARES);
}

/**
 * The share register — who owns the company, and who votes it.
 *
 * **Chief executive only, and this one is a permission rather than an
 * interface.** The chart hammer on the People tab and the price control on the
 * share page both show at `ceo` but save through `PUT /api/data`, which checks
 * for exec — an executive can do the same thing from the control room, so those
 * two are conveniences. The register has no control-room page at all and
 * `shareholders` is deliberately not in `EDITABLE`, so this route is the only
 * way it can be written and the gate here is the whole of it.
 */
export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const data = await ensureData();

  if (levelOf(effectiveRole(data, session)) < LEVEL.ceo) {
    return NextResponse.json(
      { error: "Only the chief executive can change the share register." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `shareholders:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of saving in one hour.");
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const bad = (error, status) =>
    NextResponse.json(
      { error },
      { status: status || 400, headers: { "Cache-Control": "no-store" } }
    );

  if (body.action !== "save") return bad("Unknown action.");

  /**
   * One list of holders, cleaned.
   *
   * Ids are minted here for a row that arrives without one, so a holder added in
   * the browser gets the same kind of id as everything else on the record. The
   * editor addresses rows by id, and so does the removal it arms first — a row
   * identified by position would move under the arming when the list re-sorts.
   */
  const readClass = (list, label) => {
    if (list === undefined) return null;
    if (!Array.isArray(list)) return { error: `The ${label} list was not a list.` };

    if (list.length > MAX_SHAREHOLDERS) {
      return {
        error: `That is more than ${MAX_SHAREHOLDERS} ${label}. Fold the smallest holdings together first.`,
      };
    }

    const seen = new Set();
    const rows = [];
    for (const raw of list) {
      const name = String(raw?.name || "").slice(0, 60).trim();
      const shares = readShares(raw?.shares);
      // A blank row is how the editor starts a new holder, so it is dropped
      // rather than refused — otherwise adding one and thinking better of it
      // would block the save.
      if (!name && !shares) continue;
      if (!name) return { error: "Every holder needs a name." };
      if (shares === null) {
        return { error: `${name}'s holding has to be a whole number of shares.` };
      }

      const key = name.toLowerCase();
      if (seen.has(key)) {
        return { error: `${name} is on the ${label} list twice. Put the holding on one row.` };
      }
      seen.add(key);

      rows.push({ id: String(raw?.id || "").trim() || entryId(), name, shares });
    }
    return { rows };
  };

  const current = readRegister(data);
  const next = { ...current };

  for (const [key, label] of [["equity", "equity holders"], ["voters", "voter holders"]]) {
    const read = readClass(body[key], label);
    if (read?.error) return bad(read.error);
    if (read) next[key] = read.rows;
  }

  if (body.voterShares !== undefined) {
    const v = readShares(body.voterShares);
    if (v === null) return bad("Voting shares issued has to be a whole number.");
    next.voterShares = v;
  }

  data.shareholders = next;

  /**
   * Equity is counted against `stock.shares`, so the total issued on the share
   * page writes that rather than a second copy of it. Two share counts would
   * drift the way the caps did, and the market capital reads this one.
   */
  if (body.shares !== undefined) {
    const s = readShares(body.shares);
    if (s === null) return bad("Shares issued has to be a whole number.");
    if (s < 1) return bad("The company has to have at least one share issued.");
    data.stock = { ...data.stock, shares: s };
  }

  await writeData(data);

  return NextResponse.json(
    { ok: true, shareholders: data.shareholders, shares: data.stock.shares },
    { headers: { "Cache-Control": "no-store" } }
  );
}
