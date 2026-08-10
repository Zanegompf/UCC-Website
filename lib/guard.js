import crypto from "crypto";
import { redis } from "./store";

/**
 * Request-side hardening: who is calling, how often, and how big is the body.
 *
 * None of this replaces lib/roles.js. Roles decide *what* a caller may see or
 * change; this file decides whether the request gets that far at all.
 */

/* ------------------------------------------------------------------ *
 * Who is calling
 * ------------------------------------------------------------------ */

/**
 * The caller's IP address.
 *
 * Vercel sets `x-real-ip` to the address it actually accepted the connection
 * from, so that one is trustworthy. `x-forwarded-for` is a list the client can
 * prepend to, and Vercel appends to the end, so the LAST entry is the one worth
 * reading — taking the first would let anyone rotate their own rate limit away.
 */
export function clientIp(req) {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  const chain = req.headers.get("x-forwarded-for");
  if (chain) {
    const parts = chain.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return "unknown";
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

/**
 * Fixed-window counters kept in Redis, in the same database as the company
 * record but under their own short-lived keys. They have to live in Redis
 * rather than in memory because every request may land on a different
 * serverless instance, and an in-memory counter would reset constantly.
 *
 * All three helpers fail OPEN: if Redis is unreachable the request is allowed
 * through. A storage blip should not lock the whole company out of its own
 * site, and lib/roles.js is still doing the real work underneath.
 */

function bucketKey(key, windowSeconds) {
  return `ucc:rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
}

function resetIn(windowSeconds) {
  return windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
}

/** Count this call, then say whether the caller is over the line. */
export async function rateLimit({ key, limit, windowSeconds }) {
  try {
    const k = bucketKey(key, windowSeconds);
    const count = Number(await redis(["INCR", k]));
    if (count === 1) await redis(["EXPIRE", k, windowSeconds]);
    return { ok: count <= limit, count, retryAfter: resetIn(windowSeconds) };
  } catch (e) {
    return { ok: true, count: 0, retryAfter: 0, degraded: true };
  }
}

/**
 * Look at a counter without touching it.
 *
 * Sign-in uses this rather than `rateLimit` so that only *failed* attempts are
 * ever counted. Counting every attempt and then clearing on success would look
 * tidier and be worse: anyone holding one valid account could burn nine guesses
 * at somebody else's, sign into their own to wipe the counter, and go again.
 */
export async function peekLimit({ key, limit, windowSeconds }) {
  try {
    const count = Number((await redis(["GET", bucketKey(key, windowSeconds)])) || 0);
    return { ok: count < limit, count, retryAfter: resetIn(windowSeconds) };
  } catch (e) {
    return { ok: true, count: 0, retryAfter: 0, degraded: true };
  }
}

/** Record one strike against a counter. */
export async function bumpLimit({ key, windowSeconds }) {
  try {
    const k = bucketKey(key, windowSeconds);
    const count = Number(await redis(["INCR", k]));
    if (count === 1) await redis(["EXPIRE", k, windowSeconds]);
  } catch (e) {
    /* fail open */
  }
}

/** The 429 every caller that runs out of allowance gets. */
export function tooMany(retryAfter, message) {
  return Response.json(
    {
      error:
        message ||
        "Too many attempts. Wait a minute and try again.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfter || 60)),
        "Cache-Control": "no-store",
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 * Cross-site requests
 * ------------------------------------------------------------------ */

/**
 * True when a state-changing request did not come from our own pages.
 *
 * The session cookie is already SameSite=lax, which stops a form on someone
 * else's site from carrying it. This is the belt to that pair of braces, and it
 * costs one header read.
 *
 * A missing Origin is allowed: curl and the Discord bot do not send one, and a
 * browser always does on the requests this is meant to catch.
 */
export function crossSite(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const host = req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch (e) {
    return true;
  }
}

export function refuseCrossSite() {
  return Response.json(
    { error: "That request did not come from this site." },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

/* ------------------------------------------------------------------ *
 * Bodies
 * ------------------------------------------------------------------ */

/**
 * Read a JSON body with a ceiling on it. Returns `{ tooBig, body }`; a body
 * that will not parse comes back as `{}`, which is what every route here
 * already expected from `req.json().catch(() => ({}))`.
 */
export async function readJson(req, maxBytes = 16 * 1024) {
  let raw;
  try {
    raw = await req.text();
  } catch (e) {
    return { tooBig: false, body: {} };
  }

  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { tooBig: true, body: null };
  }

  try {
    const parsed = JSON.parse(raw);
    return { tooBig: false, body: parsed && typeof parsed === "object" ? parsed : {} };
  } catch (e) {
    return { tooBig: false, body: {} };
  }
}

export function refuseBody(maxBytes) {
  return Response.json(
    { error: `That was too large. Keep it under ${Math.round(maxBytes / 1024)} KB.` },
    { status: 413, headers: { "Cache-Control": "no-store" } }
  );
}

/* ------------------------------------------------------------------ *
 * Secrets
 * ------------------------------------------------------------------ */

/**
 * Compare two secrets without leaking their contents through how long the
 * comparison took. `===` on strings bails at the first differing byte.
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
