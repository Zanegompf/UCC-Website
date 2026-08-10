import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { filterData, LEVEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * The endpoint the Discord bot talks to. Authenticated with a shared key
 * in the x-bot-key header, not a user session.
 */
function authorised(req) {
  const key = process.env.BOT_API_KEY;
  return Boolean(key) && req.headers.get("x-bot-key") === key;
}

export async function GET(req) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Bad or missing bot key." }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "public";
  const level = scope === "staff" ? LEVEL.staff : LEVEL.public;
  const data = await ensureData();

  return NextResponse.json({ data: filterData(data, level) });
}

export async function POST(req) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Bad or missing bot key." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
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
