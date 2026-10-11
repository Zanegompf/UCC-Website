import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { getSession } from "@/lib/auth";
import { levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { entryId } from "@/lib/ids";
import { MAX_MAIL_MESSAGES } from "@/lib/caps";
import {
  MAIL_ROLES,
  readMail,
  writeMail,
  readMarks,
  writeMarks,
  canSee,
  isUnread,
} from "@/lib/mail";
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

// Starting a thread and replying share a bucket, the way filing and commenting
// do on the legal route.
const PER_ACCOUNT = { limit: 30, windowSeconds: 3600 };
// Opening a thread is a write too, but a cheap one that never touches the mail
// itself. Generous, so reading through an inbox never runs into it.
const READ_MARKS = { limit: 300, windowSeconds: 3600 };

const reply = (payload, status) =>
  NextResponse.json(payload, {
    status: status || 200,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * Who the caller is, from the stored account. Mail is for account holders, so a
 * visitor gets nothing — including a member, who is level 0 like a visitor but
 * does have an account, which is why this tests the role and not a level.
 */
async function caller() {
  const session = await getSession();
  const data = await ensureData();
  const role = effectiveRole(data, session);
  if (role === "public") return null;
  return { account: session.username, role, level: levelOf(role), data };
}

/**
 * The people list for the "To" box.
 *
 * Client and above only. It is every account name on the site with its access
 * level, and a self-registered member is one click away from being anybody —
 * handing them a list of which accounts are the executives would undo the work
 * the sign-in route does to avoid revealing which names exist. Members can still
 * write to a role, and the send route enforces the same line.
 */
function directoryFor(me) {
  if (me.level < LEVEL.client) return null;
  return (me.data.users || [])
    .filter((u) => u.username !== me.account)
    .map(({ username, role }) => ({ username, role }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** Roles somebody other than the caller actually holds — writing to an empty seat helps nobody. */
function rolesFor(me) {
  const users = me.data.users || [];
  return MAIL_ROLES.filter((r) =>
    users.some((u) => u.role === r && u.username !== me.account)
  );
}

export async function GET(req) {
  const me = await caller();
  if (!me) return reply({ error: "Sign in to read your messages." }, 401);

  const mail = await readMail();
  const marks = await readMarks(me.account);

  const threads = mail.threads
    .filter((t) => canSee(t, me.account, me.role))
    .map((t) => ({ ...t, unread: isUnread(t, me.account, marks) }));
  const unread = threads.filter((t) => t.unread).length;

  // The masthead polls for the badge. It needs the number and nothing else, so
  // it does not pull every conversation down once a minute.
  if (new URL(req.url).searchParams.get("count")) return reply({ unread });

  return reply({
    threads,
    unread,
    roles: rolesFor(me),
    directory: directoryFor(me),
  });
}

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const me = await caller();
  if (!me) return reply({ error: "Sign in to send messages." }, 401);

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const bad = (error, status) => reply({ error }, status || 400);

  /* ------------------------------ marking read --------------------------- */

  if (body.action === "read") {
    const limited = await rateLimit({ key: `mail-read:${me.account}`, ...READ_MARKS });
    if (!limited.ok) return tooMany(limited.retryAfter);

    const id = String(body.id || "").trim();
    const mail = await readMail();
    const thread = mail.threads.find((t) => t.id === id);
    // Not found and not yours read the same, so this cannot be used to test
    // whether somebody else's thread exists.
    if (!thread || !canSee(thread, me.account, me.role)) {
      return bad("That conversation is not in your inbox.", 404);
    }

    const marks = await readMarks(me.account);
    const live = new Set(mail.threads.map((t) => t.id));
    // Prune marks for threads that have rolled off, so the key cannot grow forever.
    const next = Object.fromEntries(Object.entries(marks).filter(([k]) => live.has(k)));
    next[id] = new Date().toISOString();
    await writeMarks(me.account, next);
    return reply({ ok: true });
  }

  if (body.action !== "send" && body.action !== "reply") {
    return bad("Unknown action.");
  }

  const limited = await rateLimit({ key: `mail:${me.account}`, ...PER_ACCOUNT });
  if (!limited.ok) {
    return tooMany(limited.retryAfter, "That is a lot of messages in one hour.");
  }

  const text = String(body.body || "").slice(0, 2000).trim();
  if (!text) return bad("Write something before you send it.");

  const now = new Date().toISOString();
  const message = { id: entryId(), ts: now, from: me.account, body: text };

  /* -------------------------------- replying ----------------------------- */

  if (body.action === "reply") {
    const id = String(body.id || "").trim();
    const mail = await readMail();
    const at = mail.threads.findIndex((t) => t.id === id);
    if (at < 0 || !canSee(mail.threads[at], me.account, me.role)) {
      return bad("That conversation is not in your inbox.", 404);
    }

    const t = mail.threads[at];
    mail.threads[at] = {
      ...t,
      updated: now,
      messages: [...(t.messages || []), message].slice(-MAX_MAIL_MESSAGES),
    };
    await writeMail(mail);
    return reply({ ok: true, id });
  }

  /* ------------------------------ a new thread --------------------------- */

  const subject = String(body.subject || "").slice(0, 120).trim();
  if (!subject) return bad("Give the message a subject.");

  const [kind, ...rest] = String(body.to || "").split(":");
  const value = rest.join(":").trim().toLowerCase();
  const users = me.data.users || [];
  let to;

  if (kind === "role") {
    if (!MAIL_ROLES.includes(value)) return bad("Pick who this is for.");
    if (!users.some((u) => u.role === value && u.username !== me.account)) {
      return bad("Nobody else holds that role at the moment.");
    }
    to = { kind: "role", value };
  } else if (kind === "user") {
    // The same line the directory draws. Without it a member could find out
    // which account names exist by trying them here one at a time.
    if (me.level < LEVEL.client) {
      return bad("Members can write to a role in the company. Writing to a person needs client access.", 403);
    }
    if (value === me.account) return bad("That is your own account.");
    if (!users.some((u) => u.username === value)) return bad("There is no account by that name.", 404);
    to = { kind: "user", value };
  } else {
    return bad("Pick who this is for.");
  }

  const thread = {
    id: entryId(),
    subject,
    from: me.account,
    to,
    ts: now,
    updated: now,
    messages: [message],
  };

  const mail = await readMail();
  mail.threads.push(thread);
  await writeMail(mail);

  // No Discord post: a notice is the only thing on this site that reaches a
  // webhook, and these are private by definition.

  return reply({ ok: true, id: thread.id });
}
