import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import {
  RESEARCH_KINDS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_DEFAULT,
} from "@/lib/research";
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

// One bucket for filing and commenting, the same bargain the legal route makes:
// a comment is lighter than an entry, but two counters would be two things to
// reason about for a department that files a handful of things an evening.
const PER_ACCOUNT = { limit: 40, windowSeconds: 3600 };

/**
 * The research department's files — market research, competitor analysis, and
 * which firms the company might buy.
 *
 * `rnd` and above. The legal department and the executive clear this gate as
 * well: legal has to paper an acquisition, and an executive already sees
 * everything else. Staff do not, which is the whole point — a target list says
 * what the company is about to do, and it names firms that have not been told.
 */
export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const data = await ensureData();
  const level = levelOf(effectiveRole(data, session));

  if (level < LEVEL.rnd) {
    return NextResponse.json(
      { error: "The research department only." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const limited = await rateLimit({
    key: `research:${session.username}`,
    ...PER_ACCOUNT,
  });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of filing in one hour.");
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const bad = (error, status) =>
    NextResponse.json(
      { error },
      { status: status || 400, headers: { "Cache-Control": "no-store" } }
    );

  const entries = Array.isArray(data.research) ? data.research : [];

  /* ------------------------------ commenting ----------------------------- */

  if (body.action === "comment") {
    const id = String(body.id || "").trim();
    const text = String(body.body || "").slice(0, 2000).trim();

    if (!id) return bad("Which file is this about?");
    if (!text) return bad("Write something before you post it.");

    const at = entries.findIndex((e) => e && e.id === id);
    if (at < 0) return bad("That file is no longer on the record.", 404);

    const existing = Array.isArray(entries[at].comments) ? entries[at].comments : [];

    const comment = {
      ts: new Date().toISOString().slice(0, 10),
      author: String(body.author || "").slice(0, 40).trim() || session.username,
      body: text,
      // Who was signed in, which is not necessarily the in-game name above.
      account: session.username,
    };

    const next = [...entries];
    next[at] = { ...next[at], comments: [...existing, comment].slice(-MAX_COMMENTS) };

    data.research = next;
    await writeData(data);

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  /* ------------------------------- deleting ------------------------------ */

  /**
   * Chief executive only, checked inside the branch rather than at the top —
   * the outer gate admits the whole department and everyone in it may file and
   * comment. Same bargain as a legal filing: this is the one action here that
   * retyping cannot undo, and the thread goes with the file.
   *
   * It is not the only way one can be removed. `research` is in EDITABLE, so an
   * executive can still delete a row on the control room's Research files page.
   * This gates the department's own page, where the files are actually read.
   */
  if (body.action === "delete") {
    if (level < LEVEL.ceo) {
      return bad("Only the chief executive can delete a research file.", 403);
    }

    const id = String(body.id || "").trim();
    if (!id) return bad("Which file should go?");

    const at = entries.findIndex((e) => e && e.id === id);
    if (at < 0) return bad("That file is no longer on the record.", 404);

    const next = [...entries];
    const [gone] = next.splice(at, 1);

    data.research = next;
    // Keep it, like a row removed through a page save. This is a deletion the
    // save-time diff cannot see, because it never goes through PUT /api/data.
    data.deleted = [
      ...(Array.isArray(data.deleted) ? data.deleted : []),
      archiveEntry("research", gone, session.username),
    ].slice(-CAPS.deleted);
    await writeData(data);

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  /* -------------------------------- filing ------------------------------- */

  const kind = String(body.kind || "").trim();
  if (!RESEARCH_KINDS.includes(kind)) {
    return bad("Pick what kind of research this is.");
  }

  const title = String(body.title || "").slice(0, 160).trim();
  if (!title) return bad("Give the file a title.");

  // An unrecognised status would sit on the record matching no filter and
  // showing as something nobody chose, so fall back rather than trust the body.
  const status = RESEARCH_STATUSES.includes(body.status)
    ? body.status
    : RESEARCH_STATUS_DEFAULT;

  const entry = {
    id: entryId(),
    ts: new Date().toISOString().slice(0, 10),
    kind,
    title,
    // Who or what it is about: a market, a rival, or the firm being looked at.
    subject: String(body.subject || "").slice(0, 120).trim(),
    // Room for a number without pretending it is one — a valuation here is as
    // often "about two stacks of diamond" as a figure, the same call the
    // transaction log makes.
    valuation: String(body.valuation || "").slice(0, 80).trim(),
    status,
    detail: String(body.detail || "").slice(0, 4000).trim(),
    author: String(body.author || "").slice(0, 40).trim() || session.username,
    account: session.username,
    comments: [],
  };

  data.research = [...entries, entry].slice(-CAPS.research);
  await writeData(data);

  // No Discord post, and emphatically so: a notice is the only thing on this
  // site that reaches a webhook, and this list names firms we have not
  // approached yet.

  return NextResponse.json(
    { ok: true, id: entry.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
