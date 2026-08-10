import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureData } from "@/lib/seed";
import { effectiveRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Reports the role from the stored account, not the one baked into the cookie.
 *
 * The cookie's copy goes stale the moment an executive changes somebody's
 * access, and lives for a week. Every other privileged route already resolves
 * the role properly; this one used to hand the browser the cookie's version,
 * which meant a demoted user kept seeing controls that the server would then
 * refuse. Harmless but confusing, and it read like a hole even though it wasn't.
 */
export async function GET() {
  const session = await getSession();
  const data = await ensureData();
  const role = effectiveRole(data, session);

  return NextResponse.json(
    { username: role === "public" ? null : session.username, role },
    { headers: { "Cache-Control": "no-store" } }
  );
}
