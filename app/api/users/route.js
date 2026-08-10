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

  if (!updated.some((u) => u.role === "exec")) {
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
  if (!users.some((u) => u.username === name)) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  const updated = users.map((u) => (u.username === name ? { ...u, role } : u));

  if (!updated.some((u) => u.role === "exec")) {
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
  const remaining = (data.users || []).filter((u) => u.username !== name);
  if (!remaining.some((u) => u.role === "exec")) {
    return NextResponse.json(
      { error: "The company needs at least one executive account." },
      { status: 400 }
    );
  }

  data.users = remaining;
  await writeData(data);
  return NextResponse.json({ users: safe(data.users) });
}
