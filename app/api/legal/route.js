import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import {
  LEGAL_KINDS,
  LEGAL_STATUSES,
  LEGAL_STATUS_DEFAULT,
} from "@/lib/legal";
import { entryId } from "@/lib/ids";
import { archiveEntry } from "@/lib/archive";
import { CAPS, MAX_COMMENTS } from "@/lib/caps";
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

// Both caps live in lib/caps.js: CAPS.legalFilings is the same rolling window
// the other logs get, and MAX_COMMENTS bounds one filing's thread — the whole
// record is read and written as one object, so an unbounded argument would
// eventually slow every page load on the site.

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

  /* ------------------------------- templates ----------------------------- */

  /**
   * Boilerplate the department drafts from. Its own action rather than a page
   * save because `legal` cannot PUT /api/data — that is exec only — and the
   * people who write the templates are the ones who use them.
   *
   * Correcting or removing one is left to the control room, like the job list.
   */
  if (body.action === "template") {
    const kind = String(body.kind || "").trim();
    if (!LEGAL_KINDS.includes(kind)) {
      return bad("Say which kind of document this is a template for.");
    }

    const name = String(body.name || "").slice(0, 120).trim();
    if (!name) return bad("Give the template a name.");

    const text = String(body.body || "").slice(0, 8000).trim();
    if (!text) return bad("A template needs some wording to be worth keeping.");

    const template = {
      id: entryId(),
      ts: new Date().toISOString().slice(0, 10),
      name,
      kind,
      body: text,
      notes: String(body.notes || "").slice(0, 1000).trim(),
      author: String(body.author || "").slice(0, 40).trim() || session.username,
      account: session.username,
    };

    const templates = Array.isArray(data.legalTemplates) ? data.legalTemplates : [];
    data.legalTemplates = [...templates, template].slice(-CAPS.legalTemplates);
    await writeData(data);

    return NextResponse.json(
      { ok: true, id: template.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  /* ------------------------------- deleting ------------------------------ */

  /**
   * Taking a filing off the record entirely. Chief executive only.
   *
   * The outer gate above lets the whole department in, so this needs its own
   * check: everyone in legal can file and comment, but a filing and the thread
   * under it are the only copy, and unlike every other edit here retyping does
   * not bring them back.
   *
   * Note this is not the only way a filing can be removed — `legalFilings` is in
   * EDITABLE, so an executive can still delete a row in the control room. This
   * gates the department's own page, where the filings are actually read.
   */
  if (body.action === "delete") {
    if (levelOf(effectiveRole(stored, session)) < LEVEL.ceo) {
      return bad("Only the chief executive can delete a filing.", 403);
    }

    const id = String(body.id || "").trim();
    if (!id) return bad("Which filing should go?");

    const at = filings.findIndex((f) => f && f.id === id);
    if (at < 0) {
      return bad("That filing is no longer on the record.", 404);
    }

    const next = [...filings];
    const [gone] = next.splice(at, 1);

    data.legalFilings = next;
    // Keep it, the same as a filing removed through a page save. This is the one
    // deletion the archive cannot notice by diffing, because it never goes
    // through PUT /api/data.
    data.deleted = [
      ...(Array.isArray(data.deleted) ? data.deleted : []),
      archiveEntry("legalFilings", gone, session.username),
    ].slice(-CAPS.deleted);
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
    id: entryId(),
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

  data.legalFilings = [...filings, entry].slice(-CAPS.legalFilings);
  await writeData(data);

  // No Discord post. Posting a notice is the only thing on this site that
  // reaches a webhook, and a filing names the other party to a dispute.

  return NextResponse.json(
    { ok: true, id: entry.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
