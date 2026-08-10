import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ucc_session";
const MAX_AGE = 60 * 60 * 24 * 7; // one week

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function checkPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function startSession(user) {
  const token = await new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function endSession() {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return { username: null, role: "public" };
  try {
    const { payload } = await jwtVerify(token, secret());
    return { username: payload.username, role: payload.role || "public" };
  } catch (e) {
    return { username: null, role: "public" };
  }
}
