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

// Same reasoning as the shift log: somebody writing up a day's deals at the
// end of it is normal, and refusing them pushes the record back into memory.
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
    key: `transactions:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "That is a lot of transactions in one hour. Pause a moment."
    );
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const username = String(body.username || "").slice(0, 40).trim();
  const type = String(body.type || "").slice(0, 80).trim();
  const counterparty = String(body.counterparty || "").slice(0, 60).trim();
  // Amount and materials stay text: a deal is as often "half the takings" or
  // "3 stacks of iron" as it is a number, and forcing a number would lose that.
  const amount = String(body.amount || "").slice(0, 60).trim();
  const materials = String(body.materials || "").slice(0, 200).trim();
  const detail = String(body.detail || "").slice(0, 2000).trim();

  if (!type || (!amount && !materials)) {
    return NextResponse.json(
      { error: "Say what the service was, and what was paid or moved." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const entry = {
    ts: new Date().toISOString().slice(0, 10),
    username,
    type,
    counterparty,
    amount,
    materials,
    detail,
    // The account that filed it, which is not necessarily the in-game name
    // typed above.
    account: session.username,
  };

  const data = stored;
  data.transactions = [...(data.transactions || []), entry].slice(-200);
  await writeData(data);

  // No Discord post, as everywhere but a notice.

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
