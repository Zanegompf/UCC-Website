import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { boardBy, boardMin } from "@/lib/forum";
import { entryId } from "@/lib/ids";
import { CAPS, MAX_REPLIES } from "@/lib/caps";
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

// Threads are the heavier thing and the easier one to spam a board with, so
// they get the tighter allowance. Replies are ordinary conversation.
const THREAD_LIMIT = { limit: 10, windowSeconds: 3600 };
const REPLY_LIMIT = { limit: 40, windowSeconds: 3600 };

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const data = await ensureData();
  const role = effectiveRole(data, session);
  const level = levelOf(role);

  const bad = (error, status) =>
    NextResponse.json(
      { error },
      { status: status || 400, headers: { "Cache-Control": "no-store" } }
    );

  // Reading a public board takes no account; posting to one always does. That
  // is the only thing standing between the forum and an anonymous spam endpoint,
  // which is the same bargain the job application form makes — so it checks the
  // role name rather than the level, since `member` sits at level 0.
  if (role === "public") {
    return bad("Sign in to post on the forum.", 403);
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const threads = Array.isArray(data.forum) ? data.forum : [];

  /* ------------------------------- moderation ---------------------------- */

  /**
   * Removing a thread or a reply. Executives, who are the only people with any
   * standing to moderate — and unlike the rest of this route it is not limited
   * to the board's own level, because a mess in the client lounge still needs
   * clearing up by whoever is about.
   */
  if (body.action === "delete") {
    if (level < LEVEL.exec) {
      return bad("Only an executive can remove a post.", 403);
    }

    const id = String(body.id || "").trim();
    if (!id) return bad("Which post should go?");

    const at = threads.findIndex((t) => t && t.id === id);
    if (at >= 0) {
      const next = [...threads];
      next.splice(at, 1);
      data.forum = next;
      await writeData(data);
      return NextResponse.json({ ok: true, removed: "thread" }, { headers: { "Cache-Control": "no-store" } });
    }

    // Not a thread, so look for a reply with that id.
    const ti = threads.findIndex(
      (t) => t && (t.replies || []).some((r) => r && r.id === id)
    );
    if (ti < 0) return bad("That post is no longer on the record.", 404);

    const next = [...threads];
    next[ti] = {
      ...next[ti],
      replies: (next[ti].replies || []).filter((r) => r && r.id !== id),
    };
    data.forum = next;
    await writeData(data);
    return NextResponse.json({ ok: true, removed: "reply" }, { headers: { "Cache-Control": "no-store" } });
  }

  /**
   * Closing a thread to new replies, or reopening it. Executives, same as
   * removing a post — the reply handler already refuses a locked thread, so
   * this is the only thing that sets the flag it reads.
   */
  if (body.action === "lock") {
    if (level < LEVEL.exec) {
      return bad("Only an executive can close a thread.", 403);
    }

    const id = String(body.id || "").trim();
    const at = threads.findIndex((t) => t && t.id === id);
    if (at < 0) return bad("That thread is no longer on the record.", 404);

    const next = [...threads];
    next[at] = { ...next[at], locked: Boolean(body.locked) };
    data.forum = next;
    await writeData(data);

    return NextResponse.json(
      { ok: true, locked: next[at].locked },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  /* --------------------------------- replies ----------------------------- */

  if (body.action === "reply") {
    const limited = await rateLimit({ key: `forum:reply:${session.username}`, ...REPLY_LIMIT });
    if (!limited.ok) {
      return tooMany(limited.retryAfter, "You have posted a lot in the past hour. Take a breath.");
    }

    const id = String(body.id || "").trim();
    const text = String(body.body || "").slice(0, 4000).trim();
    if (!id) return bad("Which thread is this a reply to?");
    if (!text) return bad("Write something before you post it.");

    const at = threads.findIndex((t) => t && t.id === id);
    if (at < 0) return bad("That thread is no longer on the record.", 404);

    // The board's gate applies to replying as much as to reading. Without this
    // a member who learned a thread id could talk in the staff lounge.
    if (level < levelOf(boardMin(threads[at].board))) {
      return bad("That board is not open to your account.", 403);
    }

    if (threads[at].locked) {
      return bad("That thread is closed to new replies.", 409);
    }

    const reply = {
      id: entryId(),
      ts: new Date().toISOString().slice(0, 10),
      author: String(body.author || "").slice(0, 40).trim() || session.username,
      body: text,
      account: session.username,
    };

    const next = [...threads];
    next[at] = {
      ...next[at],
      replies: [...(next[at].replies || []), reply].slice(-MAX_REPLIES),
    };

    data.forum = next;
    await writeData(data);

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  /* --------------------------------- threads ----------------------------- */

  const board = String(body.board || "").trim();
  if (!boardBy(board)) return bad("Pick a board to post in.");

  if (level < levelOf(boardMin(board))) {
    return bad("That board is not open to your account.", 403);
  }

  const limited = await rateLimit({ key: `forum:thread:${session.username}`, ...THREAD_LIMIT });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of new threads in one hour.");
  }

  const title = String(body.title || "").slice(0, 160).trim();
  const text = String(body.body || "").slice(0, 8000).trim();
  if (!title) return bad("Give the thread a title.");
  if (!text) return bad("Say something in the first post.");

  const thread = {
    id: entryId(),
    ts: new Date().toISOString().slice(0, 10),
    board,
    title,
    body: text,
    author: String(body.author || "").slice(0, 40).trim() || session.username,
    account: session.username,
    locked: false,
    replies: [],
  };

  data.forum = [...threads, thread].slice(-CAPS.forum);
  await writeData(data);

  // No Discord post, as everywhere but a notice.

  return NextResponse.json(
    { ok: true, id: thread.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
