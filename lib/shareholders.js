/**
 * The share register: who votes the company.
 *
 * One class now. It used to carry two — equity, the slice of the company
 * somebody paid for, counted against `stock.shares`; and votes, counted against
 * `voterShares` here. Equity was removed from the site, so the register is
 * votes alone and `voterShares` is the only denominator it has. Nothing else on
 * the record knows how many votes exist, which is why that total lives here
 * rather than being derived from `stock`.
 *
 * `stock.shares` stays where it was: the market capital on the share page is
 * still price × shares, and it is still edited from the control room. It is no
 * longer anything the register counts against.
 *
 * Constants and normalising only, like lib/legal.js, so the route and Site.jsx
 * can both import it rather than keeping copies that drift. The colours live
 * with the rest of the palette in Site.jsx.
 */
import { MAX_SHAREHOLDERS } from "./caps";

export const EMPTY_REGISTER = { voterShares: 0, voters: [] };

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
 * — or one that still carries the retired `equity` list — reads as a plain
 * register of voters rather than as a crash or a stale second class. That is
 * why the page does not have to guard each of these itself.
 */
export function readRegister(data) {
  const r = data?.shareholders || {};
  return {
    voterShares: num(r.voterShares),
    voters: readList(r.voters),
  };
}

export function totalHeld(list) {
  return (Array.isArray(list) ? list : []).reduce((sum, h) => sum + num(h?.shares), 0);
}
