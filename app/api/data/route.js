import { NextResponse } from "next/server";
import { ensureData } from "@/lib/seed";
import { writeData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { filterData, levelOf, LEVEL, effectiveRole } from "@/lib/roles";
import { crossSite, refuseCrossSite, readJson, refuseBody } from "@/lib/guard";

export const dynamic = "force-dynamic";

// The whole company record travels in this body. Generous, but not unbounded.
const MAX_BODY = 1024 * 1024;

/**
 * The only top-level keys a page save is allowed to set.
 *
 * Anything else in the body is dropped rather than merged. `users` and `codes`
 * are carried over from the stored record untouched: accounts are managed only
 * through /api/users, and dropping an unknown key beats letting a save write
 * arbitrary structure into the one blob everything else reads.
 *
 * If you add a field to the record, add it here and give it a decision in
 * filterData — the same change, both places.
 */
const EDITABLE = [
  "company",
  "divisions",
  "stock",
  "financials",
  "staff",
  "projects",
  "services",
  "announcements",
  "requests",
  "shifts",
  "transactions",
  "applications",
  "jobs",
  "discord",
  "settings",
];

// PUT replaces these lists wholesale, so the caps that the append routes apply
// have to be reapplied here too.
const CAPS = {
  requests: 200,
  announcements: 60,
  shifts: 200,
  transactions: 200,
  applications: 200,
};

export async function GET() {
  try {
    const session = await getSession();
    const data = await ensureData();
    const role = effectiveRole(data, session);
    return NextResponse.json(
      {
        session: { username: role === "public" ? null : session.username, role },
        data: filterData(data, levelOf(role)),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  if (crossSite(req)) return refuseCrossSite();

  const session = await getSession();
  const current = await ensureData();

  if (levelOf(effectiveRole(current, session)) < LEVEL.exec) {
    return NextResponse.json(
      { error: "Only executives can change the company record." },
      { status: 403 }
    );
  }

  const { tooBig, body: incoming } = await readJson(req, MAX_BODY);
  if (tooBig) return refuseBody(MAX_BODY);

  if (!incoming || !incoming.company) {
    return NextResponse.json(
      { error: "That did not look like a company record." },
      { status: 400 }
    );
  }

  const next = { ...current };
  for (const key of EDITABLE) {
    if (key in incoming) next[key] = incoming[key];
  }

  // Accounts are managed only through /api/users, never through a page save.
  next.users = current.users;
  if ("codes" in current) next.codes = current.codes;

  for (const [key, cap] of Object.entries(CAPS)) {
    if (Array.isArray(next[key]) && next[key].length > cap) {
      next[key] = next[key].slice(-cap);
    }
  }

  if (Array.isArray(next.stock?.history) && next.stock.history.length > 120) {
    next.stock.history = next.stock.history.slice(-120);
  }

  await writeData(next);

  return NextResponse.json(
    { data: filterData(next, LEVEL.exec) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
