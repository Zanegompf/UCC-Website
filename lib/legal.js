/**
 * The legal department's vocabulary: what kinds of document it files, and what
 * states one can be in.
 *
 * Unlike HOOK_EVENTS, which Site.jsx keeps its own copy of, this module is
 * imported by both the route and the browser. That is safe because there is
 * nothing in here but constants — no posting code, no secrets, nothing that
 * would be dragged into the client bundle behind them. Two copies of a list
 * this long would drift.
 *
 * Each kind becomes its own section on the Legal Department page, so adding one
 * here adds a section there and an option in every picker. They live in code
 * rather than on the record because the kinds of document a legal department
 * files do not change the way the server's job list does.
 */
export const LEGAL_KINDS = [
  "Contract",
  "Court filing",
  "Licence application",
  "Legal opinion",
  "Compliance notice",
  "Company filing",
];

/**
 * What each kind of document is for, shown under its section heading so nobody
 * has to guess which one a thing belongs in.
 */
export const LEGAL_KIND_BLURBS = {
  Contract: "Agreements the company has signed or is negotiating.",
  "Court filing": "Anything lodged with or served on us by a court.",
  "Licence application": "Applications for the licences the trades need.",
  "Legal opinion": "Written advice from counsel, and the question it answered.",
  "Compliance notice": "Notices received or issued about rules and breaches.",
  "Company filing": "Registrations, amendments and anything filed as the company.",
};

/**
 * Section headings. Written out rather than derived, because pluralising English
 * in code is a rule with exceptions and this is a list of six things.
 */
export const LEGAL_KIND_PLURALS = {
  Contract: "Contracts",
  "Court filing": "Court filings",
  "Licence application": "Licence applications",
  "Legal opinion": "Legal opinions",
  "Compliance notice": "Compliance notices",
  "Company filing": "Company filings",
};

/** The heading for a kind's section. Falls back for a kind added without one. */
export function kindPlural(kind) {
  return LEGAL_KIND_PLURALS[kind] || kind + "s";
}

export const LEGAL_STATUSES = [
  "Drafting",
  "Filed",
  "In review",
  "Agreed",
  "Closed",
  "Withdrawn",
];

/** The default a new filing opens in. */
export const LEGAL_STATUS_DEFAULT = "Drafting";

/**
 * A filing needs an id of its own because comments attach to it.
 *
 * An index would not do: the control room's list editor can reorder and delete
 * rows, and the whole record is read, modified and written as one object, so a
 * comment addressed by position could end up under a different filing entirely.
 */
export function filingId() {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}
