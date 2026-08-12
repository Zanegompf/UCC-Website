import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { levelOf, LEVEL, ASSIGNABLE_ROLES, effectiveRole } from "@/lib/roles";
import { crossSite, refuseCrossSite, readJson, refuseBody } from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024;

const safe = (users) =>
  (users || []).map(({ username, role, added }) => ({ username, role, added }));

const json = (payload, status) =>
  NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

async function requireExec() {
  const session = await getSession();
  const data = await ensureData();
  if (levelOf(effectiveRole(data, session)) < LEVEL.exec) return null;
  return session;
}

/** Anyone who can run the company: an executive or the chief executive. */
const runsTheCompany = (u) => levelOf(u?.role) >= LEVEL.exec;

async function callerLevel(session) {
  const data = await ensureData();
  return levelOf(effectiveRole(data, session));
}

/**
 * Whether this caller may hand out or take away the chief executive's seat.
 *
 * Only a chief executive can, with one exception: when the company has none,
 * an executive appoints the first. Without that a record that predates the
 * role could never gain one, since there would be nobody entitled to grant it.
 */
function refuseCeoChange({ level, users, targetRole, nextRole }) {
  const touchesCeo = targetRole === "ceo" || nextRole === "ceo";
  if (!touchesCeo) return null;
  if (level >= LEVEL.ceo) return null;

  const seated = (users || []).some((u) => u.role === "ceo");
  if (nextRole === "ceo" && targetRole !== "ceo" && !seated) return null;

  return json(
    { error: "Only the chief executive can change who holds that seat." },
    403
  );
}

export async function GET() {
  if (!(await requireExec()))
    return NextResponse.json({ error: "Executives only." }, { status: 403 });
  const data = await ensureData();
  return NextResponse.json({ users: safe(data.users) });
}

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await requireExec();
  if (!session) return json({ error: "Executives only." }, 403);

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { username = "", password = "", role = "client" } = body;
  const name = String(username).trim().toLowerCase();

  if (!name || String(password).length < 8) {
    return json(
      { error: "Give a username and a password of at least 8 characters." },
      400
    );
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return json({ error: "Unknown role." }, 400);
  }

  const data = await ensureData();
  const users = data.users || [];
  const existing = users.find((u) => u.username === name);

  // This route replaces an account wholesale, which makes it a back door around
  // the two guards on PATCH and DELETE unless they are repeated here. Without
  // them an executive could POST themselves down to member, or overwrite the
  // only remaining executive, and lock the company out of its own settings.
  if (existing && name === session.username && role !== existing.role) {
    return json(
      {
        error:
          "You cannot change your own access level. Ask another executive, so nobody locks themselves out.",
      },
      400
    );
  }

  // Replacing an account wholesale is also a way to hand out the chief
  // executive's seat, so the same rule applies here.
  const ceoRefusal = refuseCeoChange({
    level: await callerLevel(session),
    users,
    targetRole: existing?.role,
    nextRole: role,
  });
  if (ceoRefusal) return ceoRefusal;

  const record = {
    username: name,
    role,
    passwordHash: await hashPassword(password),
    added: existing?.added || new Date().toISOString().slice(0, 10),
    ...(existing?.self ? { self: true } : {}),
  };

  const updated = existing
    ? users.map((u) => (u.username === name ? record : u))
    : [...users, record];

  if (!updated.some(runsTheCompany)) {
    return json({ error: "The company needs at least one executive account." }, 400);
  }

  data.users = updated;
  await writeData(data);
  return json({ users: safe(data.users) });
}

/** Change one account's access level. No password needed, role only. */
export async function PATCH(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await requireExec();
  if (!session) return json({ error: "Executives only." }, 403);

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { username = "", role = "" } = body;
  const name = String(username).trim().toLowerCase();

  if (!ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Unknown access level." }, { status: 400 });
  }

  if (name === session.username) {
    return NextResponse.json(
      {
        error:
          "You cannot change your own access level. Ask another executive, so nobody locks themselves out.",
      },
      { status: 400 }
    );
  }

  const data = await ensureData();
  const users = data.users || [];
  const target = users.find((u) => u.username === name);
  if (!target) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  const refusal = refuseCeoChange({
    level: await callerLevel(session),
    users,
    targetRole: target.role,
    nextRole: role,
  });
  if (refusal) return refusal;

  const updated = users.map((u) => (u.username === name ? { ...u, role } : u));

  if (!updated.some(runsTheCompany)) {
    return NextResponse.json(
      { error: "The company needs at least one executive account." },
      { status: 400 }
    );
  }

  data.users = updated;
  await writeData(data);
  return NextResponse.json({ users: safe(data.users) });
}

export async function DELETE(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await requireExec();
  if (!session) return json({ error: "Executives only." }, 403);

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { username = "" } = body;
  const name = String(username).trim().toLowerCase();

  if (name === session.username) {
    return NextResponse.json(
      { error: "You cannot remove the account you are signed in with." },
      { status: 400 }
    );
  }

  const data = await ensureData();
  const users = data.users || [];
  const target = users.find((u) => u.username === name);

  if (target) {
    const refusal = refuseCeoChange({
      level: await callerLevel(session),
      users,
      targetRole: target.role,
      nextRole: null,
    });
    if (refusal) return refusal;
  }

  const remaining = users.filter((u) => u.username !== name);
  if (!remaining.some(runsTheCompany)) {
    return NextResponse.json(
      { error: "The company needs at least one executive account." },
      { status: 400 }
    );
  }

  data.users = remaining;
  await writeData(data);
  return NextResponse.json({ users: safe(data.users) });
}
