/**
 * The share register: who owns the company, and who votes it.
 *
 * Two classes, because on the server they are two different things. Equity is
 * money — the slice of the company somebody paid for, counted against
 * `stock.shares`, the same figure the market capital is worked out from. Votes
 * are control, counted against `voterShares` here, because nothing else on the
 * record knows how many votes exist. Deliberately not one list with a flag: a
 * holder can appear in both with different numbers, and usually does.
 *
 * Constants and normalising only, like lib/legal.js and lib/forum.js, so the
 * route and Site.jsx can both import it rather than keeping copies that drift.
 * The colours live with the rest of the palette in Site.jsx.
 */
import { MAX_SHAREHOLDERS } from "./caps";

export const EMPTY_REGISTER = { voterShares: 0, equity: [], voters: [] };

/** The two classes, in the order the share page shows them. */
export const SHARE_CLASSES = [
  {
    key: "equity",
    name: "Equity shareholders",
    /** Equity is counted against the issued share count, not its own total. */
    issuedFrom: "stock",
    blurb: "Who owns the company, by paid-up shares.",
  },
  {
    key: "voters",
    name: "Voter shareholders",
    issuedFrom: "register",
    blurb: "Who votes the company, by voting shares.",
  },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** One row, trimmed and bounded. Keeps its id: the editor addresses rows by it. */
function readHolder(h) {
  if (!h) return null;
  const name = String(h.name || "").slice(0, 60).trim();
  if (!name) return null;
  return { id: String(h.id || ""), name, shares: num(h.shares) };
}

function readList(list) {
  return (Array.isArray(list) ? list : [])
    .map(readHolder)
    .filter(Boolean)
    .slice(0, MAX_SHAREHOLDERS);
}

/**
 * The register as the rest of the code may assume it looks.
 *
 * Every read goes through this, so a record written before the register existed
 * — or one an executive has never saved since — reads as an empty register
 * rather than as a crash. That is why the page does not have to guard each of
 * these itself.
 */
export function readRegister(data) {
  const r = data?.shareholders || {};
  return {
    voterShares: num(r.voterShares),
    equity: readList(r.equity),
    voters: readList(r.voters),
  };
}

export function totalHeld(list) {
  return (Array.isArray(list) ? list : []).reduce((sum, h) => sum + num(h?.shares), 0);
}
