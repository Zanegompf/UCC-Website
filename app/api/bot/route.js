import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { filterData, LEVEL } from "@/lib/roles";
import {
  clientIp,
  peekLimit,
  bumpLimit,
  tooMany,
  readJson,
  refuseBody,
  safeEqual,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;

// Only wrong keys are counted. The whole Discord server's traffic arrives from
// one Railway address, so counting successful calls would throttle the bot
// itself on a busy evening; counting failures throttles only a guesser.
const PER_IP = { limit: 10, windowSeconds: 600 };

/**
 * The endpoint the Discord bot talks to. Authenticated with a shared key in the
 * x-bot-key header, not a user session.
 *
 * `safeEqual` rather than `===`: string comparison stops at the first byte that
 * differs, which turns response time into a very slow oracle for the key.
 */
function authorised(req) {
  const key = process.env.BOT_API_KEY;
  return Boolean(key) && safeEqual(req.headers.get("x-bot-key"), key);
}

/**
 * Checks the key, counting only the wrong answers. Returns a 401 to send back,
 * or null when the caller is genuine.
 */
async function reject(req) {
  const key = `bot:${clientIp(req)}`;

  const limited = await peekLimit({ key, ...PER_IP });
  if (!limited.ok) return tooMany(limited.retryAfter);

  if (!authorised(req)) {
    await bumpLimit({ key, windowSeconds: PER_IP.windowSeconds });
    return NextResponse.json(
      { error: "Bad or missing bot key." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}

export async function GET(req) {
  const denied = await reject(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "public";
  const level = scope === "staff" ? LEVEL.staff : LEVEL.public;
  const data = await ensureData();

  return NextResponse.json({ data: filterData(data, level) });
}

export async function POST(req) {
  const denied = await reject(req);
  if (denied) return denied;

  const { tooBig, body } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  const data = await ensureData();

  if (body.action === "price") {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Give a price as a number." }, { status: 400 });
    }
    data.stock.prevClose = data.stock.price;
    data.stock.price = price;
    data.stock.updated =
      body.label ||
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    data.stock.history = [
      ...data.stock.history,
      { label: data.stock.updated, price },
    ].slice(-120);
    await writeData(data);
    return NextResponse.json({ ok: true, price, prevClose: data.stock.prevClose });
  }

  if (body.action === "announce") {
    const title = String(body.title || "").slice(0, 120).trim();
    if (!title) return NextResponse.json({ error: "Give a headline." }, { status: 400 });
    data.announcements = [
      {
        ts: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
        author: body.author || "Discord",
        audience: ["public", "client", "staff"].includes(body.audience)
          ? body.audience
          : "public",
        title,
        body: String(body.body || "").slice(0, 2000),
      },
      ...(data.announcements || []),
    ].slice(0, 60);
    await writeData(data);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
