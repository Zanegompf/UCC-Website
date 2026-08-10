import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { hashPassword, startSession } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import {
  clientIp,
  rateLimit,
  tooMany,
  crossSite,
  refuseCrossSite,
  readJson,
  refuseBody,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const USERNAME = /^[a-z0-9_]{3,20}$/;
const MAX_BODY = 2 * 1024;

// Every account is a permanent row in a record that gets read and rewritten
// whole, so sign-ups are throttled harder than sign-ins.
const PER_IP = { limit: 5, windowSeconds: 3600 };

// A backstop against the record being inflated by a patient script.
const MAX_ACCOUNTS = 500;

// The passwords a griefer tries first. Not a security control on its own —
// just enough to stop the worst of it. See also the warning in the UI about
// not reusing a real password on a Minecraft roleplay site.
const OBVIOUS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyui",
  "qwerty123",
  "letmein1",
  "iloveyou",
  "minecraft",
  "democracycraft",
  "abc12345",
  "11111111",
  "changeme",
]);

export async function POST(req) {
  if (crossSite(req)) return refuseCrossSite();

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const { username = "", password = "" } = body;
  const name = String(username).trim().toLowerCase();
  const pass = String(password);

  const limited = await rateLimit({ key: `register:ip:${clientIp(req)}`, ...PER_IP });
  if (!limited.ok) {
    return tooMany(
      limited.retryAfter,
      "That is a lot of new accounts from one connection. Try again later."
    );
  }

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

  if (pass.length < 8) {
    return NextResponse.json(
      { error: "Passwords need to be at least 8 characters." },
      { status: 400 }
    );
  }

  if (OBVIOUS.has(pass.toLowerCase())) {
    return NextResponse.json(
      { error: "That password is one of the first anybody guesses. Pick another." },
      { status: 400 }
    );
  }

  if (pass.toLowerCase().includes(name)) {
    return NextResponse.json(
      { error: "Keep your username out of your password." },
      { status: 400 }
    );
  }

  if ((data.users || []).length >= MAX_ACCOUNTS) {
    return NextResponse.json(
      {
        error:
          "The company is not taking new accounts at the moment. Ask an executive.",
      },
      { status: 503 }
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
    passwordHash: await hashPassword(pass),
    added: new Date().toISOString().slice(0, 10),
    self: true,
  };

  data.users = [...(data.users || []), user];
  await writeData(data);

  await startSession(user);
  return NextResponse.json(
    { username: user.username, role: user.role },
    { headers: { "Cache-Control": "no-store" } }
  );
}
