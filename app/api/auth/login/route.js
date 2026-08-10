import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { checkPassword, startSession } from "@/lib/auth";
import {
  clientIp,
  peekLimit,
  bumpLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024;

// Only failed attempts are counted, so signing in often is never punished and
// there is nothing to reset after a good password.
const PER_IP = { limit: 10, windowSeconds: 600 };

// A second, looser net across every IP trying the same account, which is what
// a spread-out guessing attempt looks like. Deliberately generous: a tight
// limit here would let anyone lock a known username out on purpose.
const PER_USER = { limit: 25, windowSeconds: 900 };

// A bcrypt hash of a value nobody will guess. Compared against when the
// username is unknown so that "no such account" and "wrong password" take the
// same amount of time. Without it the response time says which usernames are
// real, and an attacker can skip straight to guessing passwords for those.
const DECOY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { username = "", password = "" } = body;
  const name = String(username).trim().toLowerCase();
  const ip = clientIp(req);

  const ipKey = `login:ip:${ip}`;
  const userKey = `login:user:${name}`;

  const byIp = await peekLimit({ key: ipKey, ...PER_IP });
  if (!byIp.ok) {
    return tooMany(
      byIp.retryAfter,
      "Too many failed sign-in attempts from this connection. Try again shortly."
    );
  }

  const byUser = name
    ? await peekLimit({ key: userKey, ...PER_USER })
    : { ok: true, retryAfter: 0 };
  if (!byUser.ok) {
    return tooMany(
      byUser.retryAfter,
      "Too many failed sign-in attempts for that account. Try again shortly."
    );
  }

  const data = await ensureData();
  const user = (data.users || []).find((u) => u.username === name);

  // One comparison always runs, real account or not.
  let ok = false;
  if (user) {
    ok = await checkPassword(password, user.passwordHash);
  } else {
    await checkPassword(String(password), DECOY_HASH);
  }

  if (!ok) {
    await bumpLimit({ key: ipKey, windowSeconds: PER_IP.windowSeconds });
    if (name) await bumpLimit({ key: userKey, windowSeconds: PER_USER.windowSeconds });

    return NextResponse.json(
      { error: "That username and password do not match an account." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  await startSession(user);
  return NextResponse.json(
    { username: user.username, role: user.role },
    { headers: { "Cache-Control": "no-store" } }
  );
}
