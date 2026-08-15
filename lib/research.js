/**
 * The research department's vocabulary: what it files, and what state a piece
 * of work can be in.
 *
 * Constants only, like lib/legal.js, so the route and Site.jsx share them
 * rather than keeping copies that drift. Each kind becomes its own section on
 * the department's page, so adding one here adds a section and a button.
 *
 * Note what these three are: what the company is looking at, who it is up
 * against, and who it might buy. Any one of them says what the company is about
 * to do, which is why `filterData` stops the whole list at `rnd` rather than at
 * staff, and why nothing here ever reaches Discord.
 */
export const RESEARCH_KINDS = [
  "Market research",
  "Competitor analysis",
  "Acquisition target",
];

export const RESEARCH_KIND_BLURBS = {
  "Market research": "What a market is worth, who is buying, and where the gaps are.",
  "Competitor analysis": "Who we are up against, what they charge, and how they are placed.",
  "Acquisition target": "Firms worth buying or merging with, and what they would cost.",
};

/**
 * Section headings, written out rather than derived — "Acquisition targets" is
 * fine but "Market researchs" is not, and pluralising English in code is a rule
 * made of exceptions.
 */
export const RESEARCH_KIND_PLURALS = {
  "Market research": "Market research",
  "Competitor analysis": "Competitor analysis",
  "Acquisition target": "Acquisition and merger targets",
};

/** The heading for a kind's section. Falls back for a kind added without one. */
export function researchPlural(kind) {
  return RESEARCH_KIND_PLURALS[kind] || kind + "s";
}

/**
 * Where a piece of work has got to.
 *
 * "Approached" and "Dropped" only really mean anything for an acquisition
 * target, but one list of states across all three kinds beats three lists that
 * have to be looked up by kind before anything can be rendered.
 */
export const RESEARCH_STATUSES = [
  "Scoping",
  "In progress",
  "Watching",
  "Approached",
  "Concluded",
  "Dropped",
];

/** The state a new entry opens in. */
export const RESEARCH_STATUS_DEFAULT = "Scoping";

/**
 * An entry's id comes from `entryId()` in lib/ids.js, the same one the archive
 * and the other tracked lists use. It is load-bearing twice: comments attach to
 * an entry by id, and the archive notices a deletion by an id going missing.
 */
