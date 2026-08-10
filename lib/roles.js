// "member" is a signed-in account with no elevated access. It sits at the same
// level as a visitor on purpose: making an account should not, by itself, hand
// someone the rate card or the internal project list.
export const LEVEL = { public: 0, member: 0, client: 1, staff: 2, exec: 3 };

export const ASSIGNABLE_ROLES = ["member", "client", "staff", "exec"];

export function levelOf(role) {
  return LEVEL[role] ?? 0;
}

/**
 * Strips anything the viewer is not allowed to see BEFORE it leaves the server.
 * This is the real permission boundary — the interface only mirrors it.
 */
export function filterData(data, level) {
  const d = JSON.parse(JSON.stringify(data));

  // Never leaves the server under any circumstances.
  delete d.users;
  delete d.codes;

  const b = d.financials?.balance || {};
  const assets =
    (b.cash || 0) + (b.inventory || 0) + (b.property || 0) + (b.investments || 0);
  d.financials.assets = assets;
  d.financials.equity = assets - (b.liabilities || 0);

  if (level < LEVEL.exec) {
    // Replacing the object wholesale is what keeps `webhook` AND every URL in
    // `hooks` off the wire. Do not soften this into deleting named keys.
    d.discord = { channel: d.discord?.channel || "" };
    // Visitors need to know whether the sign-up button should appear, and
    // nothing else about how accounts are configured.
    d.settings = { signupOpen: d.settings?.signupOpen !== false };
  }

  if (level < LEVEL.staff) {
    d.financials.balance = null;
    d.staff = (d.staff || []).map(({ internal, ...rest }) => rest);
    d.requests = [];
    // The shift log is a payroll record: who worked, when, and on what. It
    // names people, so it stops at staff along with the internal notes.
    d.shifts = [];
  }

  if (level < LEVEL.client) {
    d.services = [];
  }

  d.projects = (d.projects || []).filter((p) => levelOf(p.visibility) <= level);
  d.announcements = (d.announcements || []).filter(
    (a) => levelOf(a.audience) <= level
  );

  return d;
}

/**
 * The role that actually counts, read from the stored account rather than the
 * session cookie. Cookies are signed but stateless: a role baked into one stays
 * valid until it expires, so an executive demoting or removing somebody would
 * not take effect for up to a week. Resolving it per request makes both
 * promotions and demotions immediate.
 */
export function effectiveRole(data, session) {
  if (!session?.username) return "public";
  const user = (data?.users || []).find((u) => u.username === session.username);
  return user ? user.role : "public";
}
