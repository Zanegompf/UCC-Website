import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { filterData, levelOf, LEVEL, effectiveRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const data = await ensureData();
    const role = effectiveRole(data, session);
    return NextResponse.json({
      session: { username: role === "public" ? null : session.username, role },
      data: filterData(data, levelOf(role)),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const session = await getSession();
  const current = await ensureData();

  if (levelOf(effectiveRole(current, session)) < LEVEL.exec) {
    return NextResponse.json(
      { error: "Only executives can change the company record." },
      { status: 403 }
    );
  }

  const incoming = await req.json().catch(() => null);
  if (!incoming || !incoming.company) {
    return NextResponse.json({ error: "That did not look like a company record." }, { status: 400 });
  }

  // Accounts are managed only through /api/users, never through a page save.
  const next = { ...current, ...incoming, users: current.users };
  await writeData(next);

  return NextResponse.json({ data: filterData(next, LEVEL.exec) });
}
