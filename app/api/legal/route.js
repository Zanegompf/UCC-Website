import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import {
  LEGAL_KINDS,
  LEGAL_STATUSES,
  LEGAL_STATUS_DEFAULT,
  filingId,
} from "@/lib/legal";
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

// One bucket covers both filing and commenting. A comment is much lighter than
// a filing, but splitting them would mean two counters to reason about for a
// department that files a handful of things an evening.
const PER_ACCOUNT = { limit: 40, windowSeconds: 3600 };

// Same rolling window as the other logs.
const MAX_FILINGS = 200;

// Per filing, so one long-running argument cannot grow the record without
// bound. The whole record is read and written as one object, so an unbounded
// thread would eventually slow every page load on the site.
const MAX_COMMENTS = 50;

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const stored = await ensureData();

  // Legal and above. An executive clears this too — they see everything else,
  // and somebody has to be able to read the files when counsel is offline.
  if (levelOf(effectiveRole(stored, session)) < LEVEL.legal) {
    return NextResponse.json(
      { error: "The legal department only." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `legal:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "That is a lot of filing in one hour. Pause a moment."
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
  const filings = Array.isArray(data.legalFilings) ? data.legalFilings : [];

  /* ------------------------------ commenting ----------------------------- */

  if (body.action === "comment") {
    const id = String(body.id || "").trim();
    const text = String(body.body || "").slice(0, 2000).trim();

    if (!id) return bad("Which filing is this about?");
    if (!text) return bad("Write something before you post it.");

    const at = filings.findIndex((f) => f && f.id === id);
    if (at < 0) {
      return bad("That filing is no longer on the record.", 404);
    }

    const existing = Array.isArray(filings[at].comments)
      ? filings[at].comments
      : [];

    const comment = {
      ts: new Date().toISOString().slice(0, 10),
      author: String(body.author || "").slice(0, 40).trim() || session.username,
      body: text,
      // Who was signed in, which is not necessarily the in-game name above.
      account: session.username,
    };

    const next = [...filings];
    next[at] = {
      ...next[at],
      comments: [...existing, comment].slice(-MAX_COMMENTS),
    };

    data.legalFilings = next;
    await writeData(data);

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  /* -------------------------------- filing ------------------------------- */

  const kind = String(body.kind || "").trim();
  if (!LEGAL_KINDS.includes(kind)) {
    return bad("Pick what kind of document this is.");
  }

  const title = String(body.title || "").slice(0, 160).trim();
  if (!title) return bad("Give the filing a title.");

  // An unrecognised status would sit on the record matching no filter and
  // showing as something nobody chose, so fall back rather than trust the body.
  const status = LEGAL_STATUSES.includes(body.status)
    ? body.status
    : LEGAL_STATUS_DEFAULT;

  const entry = {
    id: filingId(),
    ts: new Date().toISOString().slice(0, 10),
    kind,
    title,
    party: String(body.party || "").slice(0, 120).trim(),
    reference: String(body.reference || "").slice(0, 80).trim(),
    status,
    detail: String(body.detail || "").slice(0, 4000).trim(),
    author: String(body.author || "").slice(0, 40).trim() || session.username,
    // The account that filed it, as everywhere else.
    account: session.username,
    comments: [],
  };

  data.legalFilings = [...filings, entry].slice(-MAX_FILINGS);
  await writeData(data);

  // No Discord post. Posting a notice is the only thing on this site that
  // reaches a webhook, and a filing names the other party to a dispute.

  return NextResponse.json(
    { ok: true, id: entry.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
