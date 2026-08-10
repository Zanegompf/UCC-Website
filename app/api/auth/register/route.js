import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { hashPassword, startSession } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

const USERNAME = /^[a-z0-9_]{3,20}$/;

export async function POST(req) {
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  const name = String(username).trim().toLowerCase();

  const data = await ensureData();

  if (data.settings?.signupOpen === false) {
    return NextResponse.json(
      { error: "Sign-ups are closed. Ask an executive to make you an account." },
      { status: 403 }
    );
  }

  if (!USERNAME.test(name)) {
    return NextResponse.json(
      {
        error:
          "Usernames are 3–20 characters, using letters, numbers and underscores only.",
      },
      { status: 400 }
    );
  }

  if (String(password).length < 8) {
    return NextResponse.json(
      { error: "Passwords need to be at least 8 characters." },
      { status: 400 }
    );
  }

  if ((data.users || []).some((u) => u.username === name)) {
    return NextResponse.json(
      { error: "That username is taken." },
      { status: 409 }
    );
  }

  // The role comes from company settings, never from the request body.
  const role = ASSIGNABLE_ROLES.includes(data.settings?.signupRole)
    ? data.settings.signupRole
    : "member";

  const user = {
    username: name,
    role,
    passwordHash: await hashPassword(password),
    added: new Date().toISOString().slice(0, 10),
    self: true,
  };

  data.users = [...(data.users || []), user];
  await writeData(data);

  await startSession(user);
  return NextResponse.json({ username: user.username, role: user.role });
}
