/**
 * How long each list on the record is allowed to get.
 *
 * These used to be written out wherever a list was trimmed — the save route,
 * the append routes, and the control room's own client-side trims — and they
 * drifted: publishing a notice cut the list to 40 against a cap of 60, and
 * recording a price cut history to 60 against 120, so posting on the site threw
 * away entries that posting from Discord kept.
 *
 * One home now. Import it rather than writing the number again.
 */
export const CAPS = {
  requests: 200,
  announcements: 60,
  shifts: 200,
  transactions: 200,
  applications: 200,
  legalFilings: 200,
  // Boilerplate the department reuses, so there are a handful, not hundreds.
  legalTemplates: 60,
  forum: 200,
  // Written only by the server; see "Deleted records" in CLAUDE.md.
  deleted: 200,
};

/** Per legal filing, so one long argument cannot grow the record without bound. */
export const MAX_COMMENTS = 50;

/** Per forum thread. Same reasoning, and a thread that long wants a new one. */
export const MAX_REPLIES = 100;

/** Price points kept on the chart. */
export const STOCK_HISTORY_CAP = 120;
