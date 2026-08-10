import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { checkPassword, startSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  const data = await ensureData();
  const user = (data.users || []).find(
    (u) => u.username === String(username).trim().toLowerCase()
  );

  const ok = user && (await checkPassword(password, user.passwordHash));
  if (!ok) {
    return NextResponse.json(
      { error: "That username and password do not match an account." },
      { status: 401 }
    );
  }

  await startSession(user);
  return NextResponse.json({ username: user.username, role: user.role });
}
