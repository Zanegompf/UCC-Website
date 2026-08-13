import { entryId } from "./ids";

/**
 * What happens to a row when somebody removes it.
 *
 * Deleting used to be final: the control room's list editor spliced the row out
 * and the save overwrote the list, so a mis-click took an application or a
 * client's request with it and nothing on the record remembered. These four
 * lists now keep what was removed, on `deleted`, so an executive can at least
 * read back what used to be there.
 *
 * Only four, deliberately. The whole record is one blob that every page load
 * reads, so archiving `shifts` and `transactions` — the two that turn over
 * fastest and matter least individually — would grow it for little gain.
 */
export const ARCHIVED_LISTS = {
  applications: "Job applications",
  legalFilings: "Legal filings",
  requests: "Client requests",
  projects: "Projects",
};

// The archive is a rolling window like every other list here; its cap lives in
// lib/caps.js with the rest. Re-exported so callers that only care about the
// archive do not need both imports.
export { CAPS as LIST_CAPS } from "./caps";

/**
 * Gives every row in a list an id, leaving the ones that have one alone.
 *
 * The archive works by noticing that an id stopped appearing, so these have to
 * be stable across reads. That is why ensureData() *writes* after minting them
 * rather than recomputing on each load the way its other back-fills do — ids
 * regenerated per request would look like the whole list had been deleted and
 * replaced on every save.
 */
export function withIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) =>
    entry && typeof entry === "object" && !entry.id
      ? { ...entry, id: entryId() }
      : entry
  );
}

/** True when any row in the list is still missing an id. */
export function needsIds(list) {
  return Array.isArray(list) && list.some((e) => e && typeof e === "object" && !e.id);
}

/** One row of the archive. `entry` holds the thing itself, untouched. */
export function archiveEntry(key, entry, actor) {
  return {
    id: entryId(),
    kind: key,
    label: ARCHIVED_LISTS[key] || key,
    ts: new Date().toISOString().slice(0, 10),
    by: actor || "",
    entry,
  };
}

/**
 * The rows that a save is about to drop.
 *
 * Matched **by id, never by value**. The control room saves on every keystroke,
 * so a value comparison would see the half-typed version of a field as a
 * deletion and archive a copy per character. An id survives an edit and vanishes
 * on a removal, which is exactly the difference that matters.
 *
 * Two things are deliberately skipped rather than archived:
 *
 * - a list the save does not mention at all, which is not a deletion of
 *   everything in it;
 * - a list whose incoming rows carry no ids, which means the browser is holding
 *   a copy from before ids existed. Trusting that would archive the entire list
 *   on the first save from a stale tab.
 */
export function archiveRemoved(current, incoming, actor) {
  const removed = [];

  for (const key of Object.keys(ARCHIVED_LISTS)) {
    const after = incoming[key];
    if (!Array.isArray(after)) continue;

    const before = Array.isArray(current[key]) ? current[key] : [];
    if (!before.length) continue;

    const idsBefore = before.filter((e) => e && e.id).length;
    const idsAfter = after.filter((e) => e && e.id).length;
    // A stale tab: rows exist on both sides but the incoming ones have no ids.
    if (idsBefore && after.length && !idsAfter) continue;

    const kept = new Set(after.map((e) => e && e.id).filter(Boolean));

    for (const entry of before) {
      // Without an id there is no way to tell an edit from a removal, so leave
      // it be. ensureData() back-fills these, so it is a one-load window.
      if (!entry || !entry.id) continue;
      if (!kept.has(entry.id)) removed.push(archiveEntry(key, entry, actor));
    }
  }

  return removed;
}
