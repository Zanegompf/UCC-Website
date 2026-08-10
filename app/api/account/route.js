import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import {
  getSession,
  checkPassword,
  hashPassword,
  startSession,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const data = await ensureData();
  const user = (data.users || []).find((u) => u.username === session.username);
  if (!user) {
    return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });
  }

  return NextResponse.json({
    username: user.username,
    role: user.role,
    added: user.added || null,
    self: Boolean(user.self),
  });
}

/** Change your own password. Requires the current one. */
export async function POST(req) {
  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { currentPassword = "", newPassword = "" } = await req
    .json()
    .catch(() => ({}));

  if (String(newPassword).length < 8) {
    return NextResponse.json(
      { error: "New passwords need to be at least 8 characters." },
      { status: 400 }
    );
  }

  const data = await ensureData();
  const user = (data.users || []).find((u) => u.username === session.username);
  if (!user) {
    return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });
  }

  if (!(await checkPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json(
      { error: "Your current password is not right." },
      { status: 403 }
    );
  }

  user.passwordHash = await hashPassword(newPassword);
  data.users = (data.users || []).map((u) =>
    u.username === user.username ? user : u
  );
  await writeData(data);

  // Re-issue this session so the change takes effect cleanly here.
  await startSession(user);

  return NextResponse.json({ ok: true });
}
