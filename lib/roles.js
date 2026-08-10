export const LEVEL = { public: 0, client: 1, staff: 2, exec: 3 };

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
    d.discord = { channel: d.discord?.channel || "" };
  }

  if (level < LEVEL.staff) {
    d.financials.balance = null;
    d.staff = (d.staff || []).map(({ internal, ...rest }) => rest);
    d.requests = [];
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
