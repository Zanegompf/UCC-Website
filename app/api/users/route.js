import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { levelOf, LEVEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

const safe = (users) =>
  (users || []).map(({ username, role, added }) => ({ username, role, added }));

async function requireExec() {
  const session = await getSession();
  if (levelOf(session.role) < LEVEL.exec) return null;
  return session;
}

export async function GET() {
  if (!(await requireExec()))
    return NextResponse.json({ error: "Executives only." }, { status: 403 });
  const data = await ensureData();
  return NextResponse.json({ users: safe(data.users) });
}

export async function POST(req) {
  const session = await requireExec();
  if (!session) return NextResponse.json({ error: "Executives only." }, { status: 403 });

  const { username = "", password = "", role = "client" } = await req.json().catch(() => ({}));
  const name = String(username).trim().toLowerCase();

  if (!name || password.length < 8) {
    return NextResponse.json(
      { error: "Give a username and a password of at least 8 characters." },
      { status: 400 }
    );
  }
  if (!["client", "staff", "exec"].includes(role)) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }

  const data = await ensureData();
  const users = data.users || [];
  const existing = users.find((u) => u.username === name);
  const record = {
    username: name,
    role,
    passwordHash: await hashPassword(password),
    added: new Date().toISOString().slice(0, 10),
  };

  data.users = existing
    ? users.map((u) => (u.username === name ? record : u))
    : [...users, record];

  await writeData(data);
  return NextResponse.json({ users: safe(data.users) });
}

export async function DELETE(req) {
  const session = await requireExec();
  if (!session) return NextResponse.json({ error: "Executives only." }, { status: 403 });

  const { username = "" } = await req.json().catch(() => ({}));
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
