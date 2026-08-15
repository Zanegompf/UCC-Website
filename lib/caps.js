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
  // The research department's files, on the same rolling window as legal's.
  research: 200,
  forum: 200,
  // Written only by the server; see "Deleted records" in CLAUDE.md.
  deleted: 200,
};

/**
 * Per filing or research entry, so one long argument cannot grow the record
 * without bound. Both departments' threads take the same allowance — they are
 * the same thing, a department talking about one document.
 */
export const MAX_COMMENTS = 50;

/** Per forum thread. Same reasoning, and a thread that long wants a new one. */
export const MAX_REPLIES = 100;

/**
 * Per share class on the register.
 *
 * Not in CAPS: the register is an object holding two lists, and the trim loop in
 * the save route only walks top-level arrays. It is applied in lib/shareholders
 * where the lists are read instead.
 */
export const MAX_SHAREHOLDERS = 60;

/** Price points kept on the chart. */
export const STOCK_HISTORY_CAP = 120;
