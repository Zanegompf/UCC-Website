import { readData, writeData } from "./store";
import { hashPassword } from "./auth";

export const SEED = {
  version: 1,
  company: {
    name: "The United Commerce Corporation",
    short: "United Commerce",
    ticker: "UCC",
    exchange: "The Exchange",
    founded: "2026",
    hq: "Reveille, Redmont",
    ceo: "your_username",
    tagline: "Four trades. One ledger. Every corner of Redmont.",
    mission:
      "United Commerce exists to make Redmont's economy easier to build in. We supply the materials, move the freight, hold the land and lend the capital that smaller firms need to start — and we take a share of what they become instead of a cut of what they can barely afford. Every contract we sign is priced to survive a downturn, every book we publish is one an auditor could read cold, and every share we issue is backed by assets a shareholder could walk to. We would rather grow slowly and be here in a year.",
    discordInvite: "",
    serverIp: "play.democracycraft.net",
  },
  /**
   * The company tree. `parent` names the entry above; an empty one is the top.
   *
   * Governing bodies carry no `code`, and that is what separates them from an
   * operating division — the front page counts the divisions by looking for a
   * coded entry whose parent is uncoded.
   */
  divisions: [
    { name: "Board of Directors", code: "", parent: "", lead: "Vacant", blurb: "Elected by the shareholders. Sets policy, approves anything that changes the share count, and appoints the executive." },
    { name: "Executive Committee", code: "", parent: "Board of Directors", lead: "Vacant", blurb: "The officers who run the company day to day and answer to the board for it." },
    { name: "Legal Department", code: "", parent: "Executive Committee", lead: "Vacant", blurb: "Contracts, filings and disputes. Every agreement the company signs goes through here before it is signed." },
    { name: "Logistics", code: "UCC-L", parent: "Legal Department", lead: "Vacant", blurb: "Bulk freight, warehousing and restock contracts across the city." },
    { name: "Retail", code: "UCC-R", parent: "Legal Department", lead: "Vacant", blurb: "Storefronts and chest shops in downtown Reveille and the districts." },
    { name: "Property", code: "UCC-P", parent: "Legal Department", lead: "Vacant", blurb: "Plot acquisition, commercial leasing and development." },
    { name: "Capital", code: "UCC-C", parent: "Legal Department", lead: "Vacant", blurb: "Banking, bonds, underwriting and minority stakes in growing firms. Everything on the money side except lending, which runs as its own desk below." },
    { name: "Lending", code: "UCC-CL", parent: "Capital", lead: "Vacant", blurb: "Loans to firms and to individuals, secured against plots, stock or a share of the takings." },
  ],
  stock: {
    price: 24.8,
    prevClose: 23.95,
    shares: 500000,
    listed: true,
    history: [
      { label: "Apr 1", price: 18.4 },
      { label: "Apr 8", price: 18.1 },
      { label: "Apr 15", price: 19.25 },
      { label: "Apr 22", price: 19.05 },
      { label: "Apr 29", price: 20.1 },
      { label: "May 6", price: 20.75 },
      { label: "May 13", price: 20.4 },
      { label: "May 20", price: 21.6 },
      { label: "May 27", price: 22.15 },
      { label: "Jun 3", price: 21.9 },
      { label: "Jun 10", price: 22.8 },
      { label: "Jun 17", price: 23.45 },
      { label: "Jun 24", price: 23.1 },
      { label: "Jul 1", price: 23.95 },
      { label: "Jul 8", price: 24.8 },
    ],
    updated: "8 July",
  },
  financials: {
    periods: [
      { label: "March", revenue: 980000, expenses: 815000 },
      { label: "April", revenue: 1120000, expenses: 890000 },
      { label: "May", revenue: 1340000, expenses: 1020000 },
      { label: "June", revenue: 1510000, expenses: 1090000 },
      { label: "July", revenue: 1680000, expenses: 1140000 },
    ],
    balance: {
      cash: 2150000,
      inventory: 640000,
      property: 4900000,
      investments: 1250000,
      liabilities: 1340000,
    },
    note:
      "Books close on the last day of each month and are posted here within 48 hours. Figures are unaudited unless marked otherwise.",
  },
  staff: [
    { name: "your_username", role: "Chief Executive Officer", dept: "Executive", joined: "2026", note: "Founder. Signs off on anything over $250,000.", internal: "Holds 62% of issued shares." },
    { name: "Vacant", role: "Chief Financial Officer", dept: "Executive", joined: "—", note: "Owns the books, the filings and the dividend schedule.", internal: "Open role — hiring." },
    { name: "Vacant", role: "Head of Logistics", dept: "Logistics", joined: "—", note: "Runs freight contracts and the distribution hub.", internal: "Open role — hiring." },
    { name: "Vacant", role: "Retail Manager", dept: "Retail", joined: "—", note: "Stocking, pricing and storefront staff.", internal: "Open role — hiring." },
    { name: "Vacant", role: "Investor Relations", dept: "Capital", joined: "—", note: "First point of contact for shareholders and The Exchange.", internal: "Open role — hiring." },
  ],
  projects: [
    { name: "Reveille Distribution Hub", status: "Building", visibility: "public", progress: 65, target: "Q3", summary: "Central warehouse and loading yard so restock runs stop depending on one person being online." },
    { name: "Retail Line — Phase II", status: "Building", visibility: "public", progress: 40, target: "Q3", summary: "Three more storefronts across the districts, stocked from the hub." },
    { name: "Willow District Land Acquisition", status: "Negotiating", visibility: "client", progress: 25, target: "Q4", summary: "Assembling adjacent commercial plots for a leasing block. Terms available to contracted clients." },
    { name: "UCC-1 Bond Series", status: "Drafting", visibility: "staff", progress: 10, target: "Q4", summary: "Fixed-coupon bond issue to fund the property arm without diluting shareholders." },
    { name: "Exchange Listing Uplift", status: "In review", visibility: "staff", progress: 80, target: "Q3", summary: "Audit-ready books and a full filing history for the exchange." },
  ],
  services: [
    { name: "Bulk supply contract", price: "From $12,000 / week", detail: "Standing order of ores, wood or food, delivered on a fixed schedule." },
    { name: "Warehousing", price: "$3,500 / month per bay", detail: "Secure storage at the hub with named access for your staff." },
    { name: "Storefront lease", price: "From $18,000 / month", detail: "Fitted retail space in a UCC-owned building, foot traffic included." },
    { name: "Capital & underwriting", price: "Negotiated", detail: "Loans, bond underwriting or a minority stake in your firm." },
  ],
  announcements: [
    { ts: "8 July", author: "Investor Relations", audience: "public", title: "Share price closes at $24.80", body: "Up 3.5% on the week, carried by the first full month of hub revenue. July books post at the end of the month." },
    { ts: "2 July", author: "Executive", audience: "client", title: "Warehousing bays open for booking", body: "Four bays are available at the Reveille hub from mid-July. Contracted clients get first refusal — reply on the client desk to hold one." },
    { ts: "28 June", author: "Executive", audience: "staff", title: "Shift log moves to the site", body: "Clock in and out in the staff room, not in Discord. Payroll is calculated from that log at the end of each week, so if it isn't logged it isn't paid." },
  ],
  requests: [],
  shifts: [],
  applications: [],
  /**
   * The server's job list, as published on the DemocracyCraft wiki. It lives in
   * the record rather than in code because the server changes it from time to
   * time and an executive should be able to follow along without a deploy.
   * Categories match the wiki's own grouping.
   */
  jobs: [
    ...["Brewer", "Carpenter", "Chef", "Contractor", "Designer", "Farmer", "Fisher", "Journalist", "Lumberjack", "Miner", "Hunter"].map((name) => ({ name, category: "Trade" })),
    ...["Armourer", "Jeweller", "Mason", "Mechanic", "Realtor"].map((name) => ({ name, category: "Profession" })),
    ...["Archivist", "Auditor", "Building inspector", "Captain", "Compliance officer", "Constructor", "Detective", "Doctor", "Economist", "Electoral officer", "Epidemiologist", "Education Manager", "Event coordinator", "Guide", "Investigator", "Magistrate", "Media advisor", "Media Manager", "Medical specialist", "Paramedic", "Police officer", "Professor", "Prosecutor", "Ranger", "Supply officer"].map((name) => ({ name, category: "Government" })),
    ...["Accountant", "Driver's", "Entrepreneur's", "Pharmacist", "Pilot's", "Developer"].map((name) => ({ name, category: "Licence" })),
    ...["Solicitor", "Barrister", "Attorney"].map((name) => ({ name, category: "Legal licence" })),
  ],
  // `webhook` is the legacy single URL, kept so older records keep working.
  // New URLs go in `hooks`; ensureData() migrates the old one into the list.
  discord: { webhook: "", channel: "#announcements", guild: "", hooks: [] },
  users: [],
  settings: {
    // Whether the sign-up button appears at all.
    signupOpen: true,
    // What a self-registered account gets. Deliberately "member" — an account
    // that can sign in but sees exactly what a visitor sees, until an
    // executive promotes it.
    signupRole: "member",
  },
};

/**
 * Returns the stored record, creating it (and the founding executive) on first run.
 */
export async function ensureData() {
  let data = await readData();
  if (data && data.company) {
    if (!Array.isArray(data.users)) data.users = [];
    if (!data.settings) {
      data.settings = { signupOpen: true, signupRole: "member" };
    }
    if (!Array.isArray(data.shifts)) data.shifts = [];
    if (!Array.isArray(data.applications)) data.applications = [];

    // Records written before the front page showed a tree hold a flat list of
    // divisions with no `parent` on any of them. Hang the existing entries off
    // a governing chain rather than replacing them, so names, leads and blurbs
    // an executive has already edited survive.
    const divisions = Array.isArray(data.divisions) ? data.divisions : [];
    if (divisions.length && !divisions.some((d) => d && d.parent)) {
      const governance = SEED.divisions.filter((d) => !d.code);
      const top = governance[governance.length - 1]?.name || "";

      const promoted = divisions.map((d) => ({ ...d, parent: top }));

      // Lending is a desk under Capital rather than a division in its own
      // right, so it only appears if Capital does and nothing already claims
      // the name.
      const capital = promoted.find((d) => d.name === "Capital");
      const lending = SEED.divisions.find((d) => d.name === "Lending");
      if (capital && lending && !promoted.some((d) => d.name === lending.name)) {
        promoted.push({ ...lending, parent: capital.name });
      }

      data.divisions = [...JSON.parse(JSON.stringify(governance)), ...promoted];
    }
    // Seeded rather than left empty: an empty list would leave the application
    // form with nothing to pick from on every record written before hiring
    // existed.
    if (!Array.isArray(data.jobs) || !data.jobs.length) {
      data.jobs = JSON.parse(JSON.stringify(SEED.jobs));
    }

    if (!data.discord) data.discord = { webhook: "", channel: "", guild: "" };
    if (!Array.isArray(data.discord.hooks)) {
      // Records written before webhooks became a list held exactly one URL.
      // Promote it so nothing stops posting the moment this ships.
      const legacy = String(data.discord.webhook || "").trim();
      data.discord.hooks = legacy
        ? [
            {
              name: "Main",
              url: legacy,
              channel: data.discord.channel || "",
              events: "All posts",
            },
          ]
        : [];
    }
    return data;
  }

  data = JSON.parse(JSON.stringify(SEED));

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    data.users = [
      {
        username: username.toLowerCase(),
        role: "exec",
        passwordHash: await hashPassword(password),
        added: new Date().toISOString().slice(0, 10),
      },
    ];
    data.company.ceo = username;
    data.staff[0].name = username;
  }

  await writeData(data);
  return data;
}
