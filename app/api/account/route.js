import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import {
  getSession,
  checkPassword,
  hashPassword,
  startSession,
} from "@/lib/auth";
import {
  clientIp,
  peekLimit,
  bumpLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024;

// Guessing the current password is the same attack as guessing it at the sign-in
// form, except the attacker already has the cookie. Counted the same way:
// failures only.
const PER_ACCOUNT = { limit: 10, windowSeconds: 900 };

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

  return NextResponse.json(
    {
      username: user.username,
      role: user.role,
      added: user.added || null,
      self: Boolean(user.self),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Change your own password. Requires the current one. */
export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { currentPassword = "", newPassword = "" } = body;

  const key = `pwchange:${session.username}:${clientIp(req)}`;
  const limited = await peekLimit({ key, ...PER_ACCOUNT });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "Too many failed attempts. Wait a few minutes before trying again."
    );
  }

  if (String(newPassword).length < 8) {
    return NextResponse.json(
      { error: "New passwords need to be at least 8 characters." },
      { status: 400 }
    );
  }

  if (String(newPassword) === String(currentPassword)) {
    return NextResponse.json(
      { error: "That is the password you already have." },
      { status: 400 }
    );
  }

  const data = await ensureData();
  const user = (data.users || []).find((u) => u.username === session.username);
  if (!user) {
    return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });
  }

  if (!(await checkPassword(currentPassword, user.passwordHash))) {
    await bumpLimit({ key, windowSeconds: PER_ACCOUNT.windowSeconds });
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

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
