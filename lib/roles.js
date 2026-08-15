import { boardMin } from "./forum";

// "member" is a signed-in account with no elevated access. It sits at the same
// level as a visitor on purpose: making an account should not, by itself, hand
// someone the rate card or the internal project list.
// `rnd` and `legal` sit between `staff` and `exec`: everything a staff member
// sees, plus their own department's files, and none of the executive's control.
// Both are departments rather than promotions — a solicitor needs the case
// files and a researcher needs the target list, neither needs the webhooks or
// the hiring board.
// `rnd` is the lower of the two, so the legal department can read the research
// department's work and not the other way round. That is deliberate: legal has
// to see an acquisition before it can paper it.
// `ceo` sits above `exec`: same sight of everything, plus the ability to
// rearrange the company chart in place and to appoint other executives.
export const LEVEL = {
  public: 0,
  member: 0,
  client: 1,
  staff: 2,
  rnd: 3,
  legal: 4,
  exec: 5,
  ceo: 6,
};

export const ASSIGNABLE_ROLES = ["member", "client", "staff", "rnd", "legal", "exec", "ceo"];

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

  // `jobs` is never stripped: the application form on the public front page
  // has to render its dropdown for people who do not work here yet.

  // `shareholders` is never stripped either. Who owns a listed company and who
  // votes it is the one thing a shareholder register is for, and the share page
  // is the public investor page. The equity chart hides the names until they are
  // hovered, but that is a reading decision made in the browser and not a
  // permission — anybody can hover. If this should ever become restricted, gate
  // it here, because doing it in Site.jsx would only hide what was still sent.

  const b = d.financials?.balance || {};
  const assets =
    (b.cash || 0) + (b.inventory || 0) + (b.property || 0) + (b.investments || 0);
  d.financials.assets = assets;
  d.financials.equity = assets - (b.liabilities || 0);

  if (level < LEVEL.exec) {
    // Replacing the object wholesale is what keeps `webhook` AND every URL in
    // `hooks` off the wire. Do not soften this into deleting named keys.
    d.discord = { channel: d.discord?.channel || "" };
    // Hiring is an executive matter. An application carries someone's handle,
    // their references and what they expect to be paid, and staff have no
    // reason to read each other's asking price.
    d.applications = [];
    // What has been deleted. It holds removed applications and legal filings
    // among other things, so it takes the tightest gate of anything in it
    // rather than one per kind — an archive of exec-only material is exec-only.
    d.deleted = [];
    // Visitors need to know whether the sign-up button should appear, and
    // nothing else about how accounts are configured.
    d.settings = { signupOpen: d.settings?.signupOpen !== false };
  }

  if (level < LEVEL.legal) {
    // The legal department's filings. A filing names the other party, what was
    // agreed and what is being argued, and the comment threads under it are the
    // department talking among itself — so it stops at legal rather than being
    // readable by every member of staff. Executives clear this gate and see them.
    d.legalFilings = [];
    // The templates go with them: they are the terms the company intends to
    // argue for, which is not something to hand to the other side.
    d.legalTemplates = [];
  }

  if (level < LEVEL.rnd) {
    // What the research department is actually working on: market research,
    // competitor analysis, and which firms the company might buy or merge with.
    // Any one of those leaking says what the company is about to do, so the
    // whole list stops here rather than at staff. The legal department and above
    // clear this gate — they have to paper what research finds.
    d.research = [];
    // The department's remit goes with them. The block stays on the chart with
    // its public description; what it is for does not.
    d.divisions = (d.divisions || []).map(({ remit, ...rest }) => rest);
  }

  if (level < LEVEL.staff) {
    d.financials.balance = null;
    d.staff = (d.staff || []).map(({ internal, ...rest }) => rest);
    d.requests = [];
    // The shift log is a payroll record: who worked, when, and on what. It
    // names people, so it stops at staff along with the internal notes.
    d.shifts = [];
    // Transactions name the other party and what was paid, which is the
    // company's trading book. Staff log them, so staff can read them.
    d.transactions = [];
  }

  if (level < LEVEL.client) {
    d.services = [];
  }

  // Forum threads are gated by the board they sit in, the same way a project is
  // gated by its `visibility`. `boardMin` answers "exec" for a board it does not
  // recognise, so a thread whose board was renamed goes quiet rather than
  // falling open to everyone.
  d.forum = (d.forum || []).filter((t) => levelOf(boardMin(t?.board)) <= level);

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
