/**
 * The register: who votes the company, and who it owes.
 *
 * Two classes. **Voters** are the slice of the vote somebody holds, counted
 * against `voterShares` here. **Bond holders** are the company's creditors,
 * counted against `bondsIssued` — the same shape, a different thing: a bond is
 * debt, not ownership, which is why it has its own denominator rather than
 * sharing one with the votes.
 *
 * There was a third once — equity, the slice of the company somebody paid for,
 * counted against `stock.shares`. It was removed from the site, and nothing
 * here counts against `stock.shares` any more. Each class carries its own
 * total because nothing else on the record knows how many votes or bonds
 * exist.
 *
 * `stock.shares` stays where it was: the market capital on the share page is
 * still price × shares, and it is still edited from the control room. It is no
 * longer anything the register counts against.
 *
 * A row is `{id, name, shares}` in both classes. `shares` is the unit count,
 * whatever the class counts in — reusing the field is what lets the save
 * route, the pie and the table take either list without a second copy of each.
 *
 * Constants and normalising only, like lib/legal.js, so the route and Site.jsx
 * can both import it rather than keeping copies that drift. The colours live
 * with the rest of the palette in Site.jsx.
 */
import { MAX_SHAREHOLDERS } from "./caps";

export const EMPTY_REGISTER = { voterShares: 0, voters: [], bondsIssued: 0, bonds: [] };

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
 * — one with no bond class, or one that still carries the retired `equity` list
 * — reads as a plain register of voters and bond holders rather than as a crash
 * or a stale third class. That is why the page does not have to guard each of
 * these itself.
 */
export function readRegister(data) {
  const r = data?.shareholders || {};
  return {
    voterShares: num(r.voterShares),
    voters: readList(r.voters),
    bondsIssued: num(r.bondsIssued),
    bonds: readList(r.bonds),
  };
}

export function totalHeld(list) {
  return (Array.isArray(list) ? list : []).reduce((sum, h) => sum + num(h?.shares), 0);
}
