/**
 * The company forum's boards.
 *
 * Each carries the access level needed to read or post in it, using the same
 * role names as everything else — so a board is gated exactly the way a project
 * or an announcement is, rather than inventing a second idea of who sees what.
 *
 * Constants only, like lib/legal.js, so both the route and Site.jsx import this
 * rather than keeping copies that drift.
 */
export const FORUM_BOARDS = [
  {
    key: "general",
    name: "General discussion",
    min: "public",
    blurb: "The company, the server, and anything that does not fit below.",
  },
  {
    key: "market",
    name: "The trading floor",
    min: "public",
    blurb: "The share price, the books, and what anyone makes of them.",
  },
  {
    key: "trade",
    name: "Contracts and trade",
    min: "public",
    blurb: "Supply, freight, land and who is buying. Deals start here.",
  },
  {
    key: "clients",
    name: "Client lounge",
    min: "client",
    blurb: "For contracted clients: terms, scheduling and standing orders.",
  },
  {
    key: "staff",
    name: "Staff lounge",
    min: "staff",
    blurb: "Shop talk for people on the books. Not visible outside the company.",
  },
];

export function boardBy(key) {
  return FORUM_BOARDS.find((b) => b.key === key) || null;
}

/**
 * The level a board needs.
 *
 * An unrecognised board answers `exec` rather than `public`. This gate fails
 * closed on purpose: a thread whose board has been renamed or removed should
 * become invisible and wait for an executive to sort out, not fall open to
 * everybody because its key no longer matches anything.
 */
export function boardMin(key) {
  const b = boardBy(key);
  return b ? b.min : "exec";
}

/** Newest activity first — a reply counts, which is what a forum sorts on. */
export function lastActivity(thread) {
  const replies = Array.isArray(thread?.replies) ? thread.replies : [];
  const last = replies.length ? replies[replies.length - 1] : null;
  return String((last && last.ts) || thread?.ts || "");
}
