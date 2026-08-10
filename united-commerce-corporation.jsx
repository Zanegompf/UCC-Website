import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ *
 * The United Commerce Corporation — DemocracyCraft corporate site
 * Design direction: engraved share certificate + accounting ledger.
 * ------------------------------------------------------------------ */

const C = {
  paper: "#EFEAE0",
  paperDeep: "#E5DDCD",
  paperLine: "#DCD2BF",
  ink: "#10233F",
  inkSoft: "#41536E",
  ledger: "#1E6A4F",
  seal: "#8C2F2A",
  gold: "#B8892B",
  rule: "#C6BAA6",
};

const F = {
  display: "'Bodoni Moda', 'Didot', Georgia, serif",
  body: "'Archivo', 'Helvetica Neue', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};

const STORE_KEY = "ucc:company:v1";
const SESSION_KEY = "ucc:session:v1";

const LEVEL = { public: 0, client: 1, staff: 2, exec: 3 };
const ROLE_NAME = {
  public: "Visitor",
  client: "Client",
  staff: "Staff",
  exec: "Executive",
};

/* ----------------------------- seed data ----------------------------- */

const SEED = {
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
  divisions: [
    {
      name: "Logistics",
      code: "UCC-L",
      lead: "Vacant",
      blurb: "Bulk freight, warehousing and restock contracts across the city.",
    },
    {
      name: "Retail",
      code: "UCC-R",
      lead: "Vacant",
      blurb: "Storefronts and chest shops in downtown Reveille and the districts.",
    },
    {
      name: "Property",
      code: "UCC-P",
      lead: "Vacant",
      blurb: "Plot acquisition, commercial leasing and development.",
    },
    {
      name: "Capital",
      code: "UCC-C",
      lead: "Vacant",
      blurb: "Underwriting, bonds and minority stakes in growing firms.",
    },
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
    {
      name: "your_username",
      role: "Chief Executive Officer",
      dept: "Executive",
      joined: "2026",
      note: "Founder. Signs off on anything over $250,000.",
      internal: "Holds 62% of issued shares.",
    },
    {
      name: "Vacant",
      role: "Chief Financial Officer",
      dept: "Executive",
      joined: "—",
      note: "Owns the books, the filings and the dividend schedule.",
      internal: "Open role — hiring.",
    },
    {
      name: "Vacant",
      role: "Head of Logistics",
      dept: "Logistics",
      joined: "—",
      note: "Runs freight contracts and the distribution hub.",
      internal: "Open role — hiring.",
    },
    {
      name: "Vacant",
      role: "Retail Manager",
      dept: "Retail",
      joined: "—",
      note: "Stocking, pricing and storefront staff.",
      internal: "Open role — hiring.",
    },
    {
      name: "Vacant",
      role: "Investor Relations",
      dept: "Capital",
      joined: "—",
      note: "First point of contact for shareholders and The Exchange.",
      internal: "Open role — hiring.",
    },
  ],
  projects: [
    {
      name: "Reveille Distribution Hub",
      status: "Building",
      visibility: "public",
      progress: 65,
      target: "Q3",
      summary:
        "Central warehouse and loading yard so restock runs stop depending on one person being online.",
    },
    {
      name: "Retail Line — Phase II",
      status: "Building",
      visibility: "public",
      progress: 40,
      target: "Q3",
      summary: "Three more storefronts across the districts, stocked from the hub.",
    },
    {
      name: "Willow District Land Acquisition",
      status: "Negotiating",
      visibility: "client",
      progress: 25,
      target: "Q4",
      summary:
        "Assembling adjacent commercial plots for a leasing block. Terms available to contracted clients.",
    },
    {
      name: "UCC-1 Bond Series",
      status: "Drafting",
      visibility: "staff",
      progress: 10,
      target: "Q4",
      summary:
        "Fixed-coupon bond issue to fund the property arm without diluting shareholders.",
    },
    {
      name: "Exchange Listing Uplift",
      status: "In review",
      visibility: "staff",
      progress: 80,
      target: "Q3",
      summary: "Audit-ready books and a full filing history for the exchange.",
    },
  ],
  services: [
    {
      name: "Bulk supply contract",
      price: "From $12,000 / week",
      detail: "Standing order of ores, wood or food, delivered on a fixed schedule.",
    },
    {
      name: "Warehousing",
      price: "$3,500 / month per bay",
      detail: "Secure storage at the hub with named access for your staff.",
    },
    {
      name: "Storefront lease",
      price: "From $18,000 / month",
      detail: "Fitted retail space in a UCC-owned building, foot traffic included.",
    },
    {
      name: "Capital & underwriting",
      price: "Negotiated",
      detail: "Loans, bond underwriting or a minority stake in your firm.",
    },
  ],
  announcements: [
    {
      ts: "8 July",
      author: "Investor Relations",
      audience: "public",
      title: "Share price closes at $24.80",
      body:
        "Up 3.5% on the week, carried by the first full month of hub revenue. July books post at the end of the month.",
    },
    {
      ts: "2 July",
      author: "Executive",
      audience: "client",
      title: "Warehousing bays open for booking",
      body:
        "Four bays are available at the Reveille hub from mid-July. Contracted clients get first refusal — reply on the client desk to hold one.",
    },
    {
      ts: "28 June",
      author: "Executive",
      audience: "staff",
      title: "Shift log moves to Discord",
      body:
        "Clock in and out with the bot in #operations. Payroll is calculated from the log at the end of each week, so if it isn't logged it isn't paid.",
    },
  ],
  requests: [],
  discord: {
    webhook: "",
    channel: "#announcements",
    guild: "",
  },
  codes: { client: "ucc-client", staff: "ucc-staff", exec: "ucc-exec" },
};

/* ----------------------------- utilities ----------------------------- */

const money = (n) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
};

const dec = (n) => (Number(n) || 0).toFixed(2);

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

async function readShared() {
  try {
    const r = await window.storage.get(STORE_KEY, true);
    if (!r || !r.value) return null;
    return JSON.parse(r.value);
  } catch (e) {
    return null;
  }
}

async function writeShared(data) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(data), true);
    return true;
  } catch (e) {
    return false;
  }
}

/* ----------------------------- primitives ----------------------------- */

function Eyebrow({ children, color }) {
  return (
    <div
      style={{
        fontFamily: F.mono,
        fontSize: 10.5,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: color || C.inkSoft,
      }}
    >
      {children}
    </div>
  );
}

function Rule({ heavy }) {
  return (
    <div
      style={{
        height: heavy ? 3 : 1,
        background: heavy ? C.ink : C.rule,
        width: "100%",
      }}
    />
  );
}

function Panel({ children, style, tone }) {
  return (
    <div
      style={{
        background: tone === "deep" ? C.paperDeep : "rgba(255,255,255,0.42)",
        border: `1px solid ${C.rule}`,
        boxShadow: "2px 2px 0 rgba(16,35,63,0.07)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionHead({ index, title, note }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-3">
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 11,
            color: C.gold,
            letterSpacing: "0.12em",
          }}
        >
          {index}
        </span>
        <h2
          style={{
            fontFamily: F.display,
            fontSize: 30,
            lineHeight: 1.05,
            color: C.ink,
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
      </div>
      {note && (
        <p
          className="mt-2 max-w-2xl"
          style={{ fontFamily: F.body, fontSize: 14.5, color: C.inkSoft }}
        >
          {note}
        </p>
      )}
      <div className="mt-3">
        <Rule />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="py-3">
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 22,
          color: accent || C.ink,
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, variant, type, style, disabled }) {
  const base = {
    fontFamily: F.mono,
    fontSize: 11.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    padding: "10px 16px",
    border: `1px solid ${C.ink}`,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background 140ms ease, color 140ms ease",
  };
  const skins = {
    solid: { background: C.ink, color: C.paper },
    ghost: { background: "transparent", color: C.ink },
    seal: { background: C.seal, color: C.paper, border: `1px solid ${C.seal}` },
    ledger: { background: C.ledger, color: C.paper, border: `1px solid ${C.ledger}` },
  };
  return (
    <button
      type={type || "button"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...(skins[variant] || skins.ghost), ...style }}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, type, rows, placeholder, options }) {
  const shared = {
    width: "100%",
    fontFamily: type === "number" ? F.mono : F.body,
    fontSize: 14,
    color: C.ink,
    background: "rgba(255,255,255,0.7)",
    border: `1px solid ${C.rule}`,
    padding: "8px 10px",
    outline: "none",
  };
  return (
    <label className="block mb-3">
      <div className="mb-1">
        <Eyebrow>{label}</Eyebrow>
      </div>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={shared}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : rows ? (
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...shared, lineHeight: 1.5, resize: "vertical" }}
        />
      ) : (
        <input
          type={type === "number" ? "number" : "text"}
          value={value}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(type === "number" ? Number(e.target.value) : e.target.value)
          }
          style={shared}
        />
      )}
    </label>
  );
}

/* ----------------------------- certificate ----------------------------- */

function Guilloche({ height }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: height || 10,
        backgroundImage: `repeating-linear-gradient(135deg, ${C.ink} 0 1px, transparent 1px 6px)`,
        opacity: 0.45,
      }}
    />
  );
}

function Seal({ ticker }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: 104,
        height: 104,
        borderRadius: "50%",
        border: `2px solid ${C.seal}`,
        boxShadow: `inset 0 0 0 4px ${C.paper}, inset 0 0 0 5px ${C.seal}`,
        background: "rgba(140,47,42,0.06)",
      }}
    >
      <div className="text-center">
        <div
          style={{
            fontFamily: F.display,
            fontSize: 26,
            color: C.seal,
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          {ticker}
        </div>
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 7,
            letterSpacing: "0.16em",
            color: C.seal,
            marginTop: 5,
          }}
        >
          REDMONT
        </div>
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 7,
            letterSpacing: "0.16em",
            color: C.seal,
          }}
        >
          INCORPORATED
        </div>
      </div>
    </div>
  );
}

function Certificate({ data }) {
  const s = data.stock;
  const change = s.price - s.prevClose;
  const pct = s.prevClose ? (change / s.prevClose) * 100 : 0;
  const up = change >= 0;
  const cap = s.price * s.shares;

  return (
    <div
      style={{
        border: `2px solid ${C.ink}`,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 100%)",
        padding: 6,
      }}
    >
      <div style={{ border: `1px solid ${C.rule}`, padding: 0 }}>
        <Guilloche height={12} />
        <div className="px-5 py-7 md:px-10 md:py-10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="min-w-0">
              <Eyebrow color={C.gold}>
                Certificate of common stock · {data.company.exchange}
              </Eyebrow>
              <h1
                className="mt-3"
                style={{
                  fontFamily: F.display,
                  fontWeight: 700,
                  color: C.ink,
                  fontSize: "clamp(32px, 7vw, 62px)",
                  lineHeight: 0.98,
                  letterSpacing: "-0.01em",
                }}
              >
                The United
                <br />
                Commerce
                <br />
                Corporation
              </h1>
              <p
                className="mt-4 max-w-md"
                style={{ fontFamily: F.body, fontSize: 15, color: C.inkSoft }}
              >
                {data.company.tagline}
              </p>
            </div>
            <div className="flex md:block items-center gap-5">
              <Seal ticker={data.company.ticker} />
              <div className="md:mt-4 md:text-center">
                <Eyebrow>Incorporated</Eyebrow>
                <div
                  style={{
                    fontFamily: F.mono,
                    fontSize: 13,
                    color: C.ink,
                    marginTop: 4,
                  }}
                >
                  {data.company.founded} · {data.company.hq}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Rule />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 divide-y md:divide-y-0">
            <Stat
              label="Last traded"
              value={"$" + dec(s.price)}
              sub={"as of " + s.updated}
            />
            <Stat
              label="Change"
              value={(up ? "+" : "") + dec(change) + " / " + (up ? "+" : "") + pct.toFixed(1) + "%"}
              accent={up ? C.ledger : C.seal}
              sub="since previous close"
            />
            <Stat
              label="Shares issued"
              value={s.shares.toLocaleString("en-US")}
              sub="common stock"
            />
            <Stat label="Market capital" value={compact(cap)} sub="price × shares" />
          </div>

          <div className="mt-6" style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={s.history}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke={C.paperLine} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: F.mono, fontSize: 9, fill: C.inkSoft }}
                  axisLine={{ stroke: C.rule }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontFamily: F.mono, fontSize: 9, fill: C.inkSoft }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    borderRadius: 0,
                  }}
                  formatter={(v) => ["$" + dec(v), "Price"]}
                />
                <Line
                  type="stepAfter"
                  dataKey="price"
                  stroke={C.ink}
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <p
              className="max-w-lg"
              style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft }}
            >
              This certifies that the holder is the owner of fully paid shares of
              common stock in {data.company.name}, transferable on the books of
              the corporation via {data.company.exchange}.
            </p>
            <div className="text-right shrink-0">
              <div
                style={{
                  fontFamily: F.display,
                  fontStyle: "italic",
                  fontSize: 22,
                  color: C.ink,
                  borderBottom: `1px solid ${C.ink}`,
                  paddingBottom: 2,
                  display: "inline-block",
                }}
              >
                {data.company.ceo}
              </div>
              <div className="mt-1">
                <Eyebrow>Chief Executive Officer</Eyebrow>
              </div>
            </div>
          </div>
        </div>
        <Guilloche height={12} />
      </div>
    </div>
  );
}

/* ----------------------------- list editor ----------------------------- */

function ListEditor({ title, items, fields, blank, onChange }) {
  const update = (i, k, v) => {
    const next = deepClone(items);
    next[i][k] = v;
    onChange(next);
  };
  const remove = (i) => {
    const next = deepClone(items);
    next.splice(i, 1);
    onChange(next);
  };
  const add = () => onChange([...deepClone(items), deepClone(blank)]);
  const move = (i, d) => {
    const next = deepClone(items);
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    const t = next[i];
    next[i] = next[j];
    next[j] = t;
    onChange(next);
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>{title}</Eyebrow>
        <Btn onClick={add}>Add</Btn>
      </div>
      <div className="space-y-3">
        {items.map((it, i) => (
          <Panel key={i} style={{ padding: 14 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              {fields.map((f) => (
                <div
                  key={f.k}
                  className={f.full ? "md:col-span-2" : ""}
                >
                  <Field
                    label={f.label}
                    value={it[f.k] ?? ""}
                    type={f.type}
                    rows={f.rows}
                    options={f.options}
                    onChange={(v) => update(i, f.k, v)}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Btn onClick={() => move(i, -1)}>Up</Btn>
              <Btn onClick={() => move(i, 1)}>Down</Btn>
              <Btn variant="seal" onClick={() => remove(i)}>
                Remove
              </Btn>
            </div>
          </Panel>
        ))}
        {items.length === 0 && (
          <p style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft }}>
            Nothing here yet. Add the first entry.
          </p>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- sections ----------------------------- */

function Overview({ data, level }) {
  const visible = data.announcements.filter(
    (a) => LEVEL[a.audience] <= level
  );
  return (
    <div className="space-y-12">
      <section>
        <SectionHead index="I" title="What we are for" />
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <p
              style={{
                fontFamily: F.display,
                fontSize: "clamp(19px, 2.4vw, 24px)",
                lineHeight: 1.45,
                color: C.ink,
              }}
            >
              {data.company.mission}
            </p>
          </div>
          <Panel style={{ padding: 18 }} tone="deep">
            <Eyebrow>On the record</Eyebrow>
            <div className="mt-4 space-y-3">
              {[
                ["Ticker", data.company.ticker],
                ["Listed on", data.company.exchange],
                ["Headquarters", data.company.hq],
                ["Founded", data.company.founded],
                ["Server", data.company.serverIp],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span
                    style={{ fontFamily: F.body, fontSize: 13, color: C.inkSoft }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: 12.5,
                      color: C.ink,
                      textAlign: "right",
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHead
          index="II"
          title="The four trades"
          note="Each division keeps its own books and reports into the executive."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.divisions.map((d) => (
            <Panel key={d.code} style={{ padding: 18 }}>
              <Eyebrow color={C.gold}>{d.code}</Eyebrow>
              <h3
                className="mt-2"
                style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}
              >
                {d.name}
              </h3>
              <p
                className="mt-2"
                style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
              >
                {d.blurb}
              </p>
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.rule}` }}>
                <Eyebrow>Lead</Eyebrow>
                <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink, marginTop: 3 }}>
                  {d.lead}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <SectionHead
          index="III"
          title="Notices"
          note={
            level > 0
              ? "You are seeing notices for your access level."
              : "Public notices. Clients and staff see more once signed in."
          }
        />
        <div className="space-y-4">
          {visible.map((a, i) => (
            <Panel key={i} style={{ padding: 18 }}>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>
                  {a.ts}
                </span>
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9.5,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.paper,
                    background: a.audience === "staff" ? C.seal : a.audience === "client" ? C.ledger : C.inkSoft,
                    padding: "3px 7px",
                  }}
                >
                  {a.audience}
                </span>
                <span style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft }}>
                  {a.author}
                </span>
              </div>
              <h3 style={{ fontFamily: F.display, fontSize: 21, color: C.ink }}>
                {a.title}
              </h3>
              <p
                className="mt-1"
                style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
              >
                {a.body}
              </p>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}

function ShareSection({ data, level }) {
  const s = data.stock;
  const cap = s.price * s.shares;
  const b = data.financials.balance;
  const equity = b.cash + b.inventory + b.property + b.investments - b.liabilities;
  const bookPerShare = equity / (s.shares || 1);
  const first = s.history.length ? s.history[0].price : s.price;
  const growth = first ? ((s.price - first) / first) * 100 : 0;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          index="I"
          title="The share"
          note={`${data.company.ticker} trades on ${data.company.exchange}. Prices here are posted by the company and are the same ones we file.`}
        />
        <div className="grid md:grid-cols-4 gap-4">
          <Panel style={{ padding: 16 }}>
            <Stat label="Last traded" value={"$" + dec(s.price)} sub={s.updated} />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat
              label="Since first record"
              value={(growth >= 0 ? "+" : "") + growth.toFixed(1) + "%"}
              accent={growth >= 0 ? C.ledger : C.seal}
              sub={s.history.length + " price points"}
            />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat label="Market capital" value={compact(cap)} sub="price × shares" />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat
              label="Book value per share"
              value={"$" + dec(bookPerShare)}
              sub={cap > equity ? "trading above book" : "trading below book"}
              accent={C.gold}
            />
          </Panel>
        </div>
      </section>

      <section>
        <SectionHead index="II" title="Price history" />
        <Panel style={{ padding: 18 }}>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.history} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={C.paperLine} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: F.mono, fontSize: 10, fill: C.inkSoft }}
                  axisLine={{ stroke: C.rule }}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontFamily: F.mono, fontSize: 10, fill: C.inkSoft }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => "$" + v}
                />
                <Tooltip
                  contentStyle={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    borderRadius: 0,
                  }}
                  formatter={(v) => ["$" + dec(v), "Price"]}
                />
                <Line
                  type="stepAfter"
                  dataKey="price"
                  stroke={C.ink}
                  strokeWidth={2}
                  dot={{ r: 2, fill: C.gold, stroke: C.gold }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      {level >= LEVEL.client ? (
        <section>
          <SectionHead
            index="III"
            title="The full record"
            note="Every price point the company has posted."
          />
          <Panel style={{ padding: 0 }}>
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.paperDeep }}>
                    {["Date", "Price", "Move", "Implied cap"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          fontFamily: F.mono,
                          fontSize: 10,
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: C.inkSoft,
                          borderBottom: `1px solid ${C.rule}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...s.history].reverse().map((h, i, arr) => {
                    const prev = arr[i + 1];
                    const d = prev ? h.price - prev.price : 0;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
                          {h.label}
                        </td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
                          ${dec(h.price)}
                        </td>
                        <td
                          style={{
                            padding: "9px 14px",
                            fontFamily: F.mono,
                            fontSize: 12.5,
                            color: d > 0 ? C.ledger : d < 0 ? C.seal : C.inkSoft,
                          }}
                        >
                          {prev ? (d >= 0 ? "+" : "") + dec(d) : "—"}
                        </td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.inkSoft }}>
                          {compact(h.price * s.shares)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : (
        <LockedNote
          what="the full price table with weekly moves and implied capitalisation"
          who="clients and staff"
        />
      )}
    </div>
  );
}

function LockedNote({ what, who }) {
  return (
    <Panel tone="deep" style={{ padding: 20, borderStyle: "dashed" }}>
      <Eyebrow color={C.seal}>Restricted</Eyebrow>
      <p
        className="mt-2"
        style={{ fontFamily: F.body, fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}
      >
        Sign in to see {what}. Open to {who}. Ask in the company Discord for a code.
      </p>
    </Panel>
  );
}

function Financials({ data, level }) {
  const f = data.financials;
  const chartData = f.periods.map((p) => ({
    label: p.label,
    Revenue: p.revenue,
    Expenses: p.expenses,
    Profit: p.revenue - p.expenses,
  }));
  const latest = f.periods[f.periods.length - 1] || { revenue: 0, expenses: 0 };
  const net = latest.revenue - latest.expenses;
  const margin = latest.revenue ? (net / latest.revenue) * 100 : 0;
  const b = f.balance;
  const assets = b.cash + b.inventory + b.property + b.investments;
  const equity = assets - b.liabilities;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          index="I"
          title="The books"
          note={f.note}
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Panel style={{ padding: 16 }}>
            <Stat label="Revenue, last month" value={compact(latest.revenue)} sub={latest.label} />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat label="Net profit" value={compact(net)} accent={net >= 0 ? C.ledger : C.seal} sub={margin.toFixed(1) + "% margin"} />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat label="Total assets" value={compact(assets)} sub="cash, stock, land, holdings" />
          </Panel>
          <Panel style={{ padding: 16 }}>
            <Stat label="Shareholders' equity" value={compact(equity)} accent={C.gold} sub="assets less liabilities" />
          </Panel>
        </div>
      </section>

      <section>
        <SectionHead index="II" title="Revenue against costs" />
        <Panel style={{ padding: 18 }}>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <CartesianGrid stroke={C.paperLine} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: F.mono, fontSize: 10, fill: C.inkSoft }}
                  axisLine={{ stroke: C.rule }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontFamily: F.mono, fontSize: 10, fill: C.inkSoft }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => "$" + v / 1000 + "K"}
                />
                <Tooltip
                  cursor={{ fill: "rgba(16,35,63,0.05)" }}
                  contentStyle={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    borderRadius: 0,
                  }}
                  formatter={(v, n) => [money(v), n]}
                />
                <Bar dataKey="Revenue" fill={C.ink} isAnimationActive={false} />
                <Bar dataKey="Expenses" fill={C.rule} isAnimationActive={false} />
                <Bar dataKey="Profit" fill={C.ledger} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-5 mt-4">
            {[["Revenue", C.ink], ["Expenses", C.rule], ["Profit", C.ledger]].map(([k, col]) => (
              <div key={k} className="flex items-center gap-2">
                <span style={{ width: 12, height: 12, background: col, display: "inline-block" }} />
                <span style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft }}>{k}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {level >= LEVEL.staff ? (
        <section>
          <SectionHead
            index="III"
            title="Balance sheet"
            note="Internal detail. Do not post these figures outside the company without the CFO's sign-off."
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Panel style={{ padding: 20 }}>
              <Eyebrow>Assets</Eyebrow>
              <div className="mt-4">
                {[
                  ["Cash on hand", b.cash],
                  ["Inventory", b.inventory],
                  ["Property and plots", b.property],
                  ["Investments", b.investments],
                ].map(([k, v]) => (
                  <LedgerRow key={k} label={k} value={money(v)} />
                ))}
                <LedgerRow label="Total assets" value={money(assets)} bold />
              </div>
            </Panel>
            <Panel style={{ padding: 20 }}>
              <Eyebrow>Liabilities and equity</Eyebrow>
              <div className="mt-4">
                <LedgerRow label="Liabilities" value={money(b.liabilities)} />
                <LedgerRow label="Shareholders' equity" value={money(equity)} />
                <LedgerRow
                  label="Book value per share"
                  value={"$" + dec(equity / (data.stock.shares || 1))}
                />
                <LedgerRow label="Total" value={money(assets)} bold />
              </div>
            </Panel>
          </div>
          <Panel style={{ padding: 0, marginTop: 16 }}>
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.paperDeep }}>
                    {["Period", "Revenue", "Expenses", "Net", "Margin"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          fontFamily: F.mono,
                          fontSize: 10,
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: C.inkSoft,
                          borderBottom: `1px solid ${C.rule}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.periods.map((p, i) => {
                    const n = p.revenue - p.expenses;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                        <td style={{ padding: "9px 14px", fontFamily: F.body, fontSize: 13.5, color: C.ink }}>{p.label}</td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>{money(p.revenue)}</td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.inkSoft }}>{money(p.expenses)}</td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: n >= 0 ? C.ledger : C.seal }}>{money(n)}</td>
                        <td style={{ padding: "9px 14px", fontFamily: F.mono, fontSize: 12.5, color: C.inkSoft }}>
                          {p.revenue ? ((n / p.revenue) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : (
        <LockedNote
          what="the balance sheet and the month-by-month ledger"
          who="staff and executives"
        />
      )}
    </div>
  );
}

function LedgerRow({ label, value, bold }) {
  return (
    <div
      className="flex justify-between gap-4 py-2"
      style={{
        borderTop: `1px solid ${bold ? C.ink : C.paperLine}`,
        marginTop: bold ? 6 : 0,
      }}
    >
      <span style={{ fontFamily: F.body, fontSize: 13.5, color: bold ? C.ink : C.inkSoft, fontWeight: bold ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink, fontWeight: bold ? 600 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function People({ data, level }) {
  const depts = [...new Set(data.staff.map((s) => s.dept))];
  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          index="I"
          title="Who works here"
          note={
            level >= LEVEL.staff
              ? "Internal notes are visible to you. Keep them internal."
              : "The people you will actually be dealing with."
          }
        />
        {depts.map((d) => (
          <div key={d} className="mb-8">
            <div className="mb-3">
              <Eyebrow color={C.gold}>{d}</Eyebrow>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.staff
                .filter((s) => s.dept === d)
                .map((s, i) => (
                  <Panel key={i} style={{ padding: 18 }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 style={{ fontFamily: F.display, fontSize: 22, color: C.ink, lineHeight: 1.1 }}>
                        {s.name}
                      </h3>
                      <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}>
                        {s.joined}
                      </span>
                    </div>
                    <div className="mt-1" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger, letterSpacing: "0.06em" }}>
                      {s.role}
                    </div>
                    <p className="mt-3" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                      {s.note}
                    </p>
                    {level >= LEVEL.staff && s.internal && (
                      <div
                        className="mt-3 pt-3"
                        style={{ borderTop: `1px dashed ${C.rule}` }}
                      >
                        <Eyebrow color={C.seal}>Internal</Eyebrow>
                        <p style={{ fontFamily: F.body, fontSize: 13, color: C.ink, marginTop: 4 }}>
                          {s.internal}
                        </p>
                      </div>
                    )}
                  </Panel>
                ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Projects({ data, level }) {
  const visible = data.projects.filter((p) => LEVEL[p.visibility] <= level);
  const hidden = data.projects.length - visible.length;
  return (
    <div className="space-y-8">
      <SectionHead
        index="I"
        title="What we are building"
        note="Ordered by how close they are to done. Progress is updated when something real changes, not weekly for show."
      />
      <div className="space-y-4">
        {visible.map((p, i) => (
          <Panel key={i} style={{ padding: 20 }}>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "3px 7px",
                  color: C.paper,
                  background:
                    p.status === "Building"
                      ? C.ledger
                      : p.status === "In review"
                      ? C.gold
                      : C.inkSoft,
                }}
              >
                {p.status}
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft }}>
                target {p.target}
              </span>
              {p.visibility !== "public" && (
                <span style={{ fontFamily: F.mono, fontSize: 10, color: C.seal, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {p.visibility} only
                </span>
              )}
            </div>
            <h3 style={{ fontFamily: F.display, fontSize: 26, color: C.ink, lineHeight: 1.1 }}>
              {p.name}
            </h3>
            <p className="mt-2 max-w-2xl" style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
              {p.summary}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <div
                style={{
                  flex: 1,
                  height: 10,
                  background: C.paperDeep,
                  border: `1px solid ${C.rule}`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: Math.max(0, Math.min(100, p.progress)) + "%",
                    height: "100%",
                    backgroundImage: `repeating-linear-gradient(90deg, ${C.ink} 0 6px, transparent 6px 8px)`,
                  }}
                />
              </div>
              <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
                {p.progress}%
              </span>
            </div>
          </Panel>
        ))}
      </div>
      {hidden > 0 && (
        <LockedNote
          what={`${hidden} further ${hidden === 1 ? "project" : "projects"} not listed publicly`}
          who="clients and staff"
        />
      )}
    </div>
  );
}

function ClientDesk({ data, level, onSubmitRequest }) {
  const [form, setForm] = useState({ from: "", contact: "", type: "Bulk supply contract", detail: "" });
  const [sent, setSent] = useState(false);

  if (level < LEVEL.client) {
    return (
      <div>
        <SectionHead index="I" title="Client desk" note="For contracted clients." />
        <LockedNote what="rate cards, contract terms and the request desk" who="clients and staff" />
      </div>
    );
  }

  const submit = async () => {
    if (!form.from.trim() || !form.detail.trim()) return;
    await onSubmitRequest({ ...form, ts: new Date().toISOString().slice(0, 10), status: "New" });
    setSent(true);
    setForm({ from: "", contact: "", type: form.type, detail: "" });
  };

  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          index="I"
          title="What we charge"
          note="Rates are a starting point. Volume moves them, and long contracts move them further."
        />
        <div className="grid md:grid-cols-2 gap-4">
          {data.services.map((s, i) => (
            <Panel key={i} style={{ padding: 20 }}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{s.name}</h3>
                <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ledger, whiteSpace: "nowrap" }}>
                  {s.price}
                </span>
              </div>
              <p className="mt-2" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                {s.detail}
              </p>
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <SectionHead
          index="II"
          title="Ask for something"
          note="This reaches the executive and, if the bot is connected, the company Discord."
        />
        <Panel style={{ padding: 20 }}>
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field label="Your in-game name" value={form.from} onChange={(v) => setForm({ ...form, from: v })} placeholder="Steve" />
            <Field label="Discord handle" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} placeholder="@steve" />
          </div>
          <Field
            label="What you need"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={[...data.services.map((s) => s.name), "Something else"]}
          />
          <Field
            label="Details"
            rows={4}
            value={form.detail}
            onChange={(v) => setForm({ ...form, detail: v })}
            placeholder="Quantities, dates, plot numbers — whatever we need to price it."
          />
          <div className="flex items-center gap-4">
            <Btn variant="solid" onClick={submit} disabled={!form.from.trim() || !form.detail.trim()}>
              Send to the desk
            </Btn>
            {sent && (
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>
                Sent. Expect a reply in Discord.
              </span>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function StaffRoom({ data, level }) {
  if (level < LEVEL.staff) {
    return (
      <div>
        <SectionHead index="I" title="Staff room" note="Company staff only." />
        <LockedNote what="the internal board and incoming client requests" who="staff and executives" />
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          index="I"
          title="Incoming requests"
          note="Anything a client has sent through the desk."
        />
        {data.requests.length === 0 ? (
          <Panel tone="deep" style={{ padding: 20 }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
              Nothing waiting. Requests from the client desk land here.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {[...data.requests].reverse().map((r, i) => (
              <Panel key={i} style={{ padding: 18 }}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{r.ts}</span>
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9.5,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      padding: "3px 7px",
                      background: C.ledger,
                      color: C.paper,
                    }}
                  >
                    {r.status}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkSoft }}>
                    {r.contact || "no handle given"}
                  </span>
                </div>
                <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>
                  {r.from} — {r.type}
                </h3>
                <p className="mt-1" style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
                  {r.detail}
                </p>
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead index="II" title="Standing orders" note="How we do things. Read before your first shift." />
        <div className="grid md:grid-cols-2 gap-4">
          {[
            ["Log every shift", "Clock in and out with the bot in Discord. Payroll comes off that log."],
            ["Price from the card", "Do not undercut the rate card without an executive on the message."],
            ["Books before boasts", "No figure goes public until it is on this site."],
            ["One buyer, one contact", "Whoever opened the account keeps it. Hand over in writing."],
          ].map(([t, d]) => (
            <Panel key={t} style={{ padding: 18 }}>
              <h3 style={{ fontFamily: F.display, fontSize: 21, color: C.ink }}>{t}</h3>
              <p className="mt-2" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                {d}
              </p>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- control room ----------------------------- */

function ControlRoom({ data, save, level }) {
  const [pricePoint, setPricePoint] = useState({ label: "", price: "" });
  const [post, setPost] = useState({ title: "", body: "", audience: "public", author: "Executive", toDiscord: true });
  const [discordState, setDiscordState] = useState("");

  if (level < LEVEL.exec) {
    return (
      <div>
        <SectionHead index="I" title="Control room" note="Executives only." />
        <LockedNote what="the controls that edit this site" who="executives" />
      </div>
    );
  }

  const set = (path, value) => {
    const next = deepClone(data);
    let cur = next;
    const parts = path.split(".");
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
    save(next);
  };

  const addPricePoint = () => {
    if (!pricePoint.label.trim() || pricePoint.price === "") return;
    const next = deepClone(data);
    const p = Number(pricePoint.price);
    next.stock.prevClose = next.stock.price;
    next.stock.price = p;
    next.stock.updated = pricePoint.label;
    next.stock.history = [...next.stock.history, { label: pricePoint.label, price: p }].slice(-60);
    save(next);
    setPricePoint({ label: "", price: "" });
  };

  const sendToDiscord = async (title, body) => {
    const url = (data.discord.webhook || "").trim();
    if (!url) return "No webhook saved, so nothing was sent.";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.company.short + " Terminal",
          embeds: [
            {
              title: title,
              description: body,
              color: 0x1e6a4f,
              footer: { text: data.company.ticker + " · posted from the company site" },
            },
          ],
        }),
      });
      return res.ok ? "Posted to Discord." : "Discord refused it (" + res.status + "). Check the webhook URL.";
    } catch (e) {
      return "Could not reach Discord from the browser. Use the bot relay instead.";
    }
  };

  const publish = async () => {
    if (!post.title.trim()) return;
    const next = deepClone(data);
    next.announcements = [
      {
        ts: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
        author: post.author,
        audience: post.audience,
        title: post.title,
        body: post.body,
      },
      ...next.announcements,
    ].slice(0, 40);
    save(next);
    let msg = "Notice published.";
    if (post.toDiscord && post.audience === "public") {
      msg += " " + (await sendToDiscord(post.title, post.body));
    }
    setDiscordState(msg);
    setPost({ ...post, title: "", body: "" });
  };

  return (
    <div className="space-y-12">
      <section>
        <SectionHead
          index="I"
          title="Post a notice"
          note="Goes on the site straight away. Public notices can go to Discord at the same time."
        />
        <Panel style={{ padding: 20 }}>
          <Field label="Headline" value={post.title} onChange={(v) => setPost({ ...post, title: v })} />
          <Field label="Body" rows={3} value={post.body} onChange={(v) => setPost({ ...post, body: v })} />
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field
              label="Who can read it"
              value={post.audience}
              options={["public", "client", "staff"]}
              onChange={(v) => setPost({ ...post, audience: v })}
            />
            <Field label="Signed" value={post.author} onChange={(v) => setPost({ ...post, author: v })} />
          </div>
          <label className="flex items-center gap-2 mb-4" style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink }}>
            <input
              type="checkbox"
              checked={post.toDiscord}
              onChange={(e) => setPost({ ...post, toDiscord: e.target.checked })}
            />
            Also post to Discord (public notices only)
          </label>
          <div className="flex items-center gap-4 flex-wrap">
            <Btn variant="solid" onClick={publish} disabled={!post.title.trim()}>
              Publish
            </Btn>
            {discordState && (
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>{discordState}</span>
            )}
          </div>
        </Panel>
      </section>

      <section>
        <SectionHead index="II" title="Move the share price" note="Adds a point to the chart and sets the new last-traded price." />
        <Panel style={{ padding: 20 }}>
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field label="Date label" value={pricePoint.label} onChange={(v) => setPricePoint({ ...pricePoint, label: v })} placeholder="15 July" />
            <Field label="Price" type="number" value={pricePoint.price} onChange={(v) => setPricePoint({ ...pricePoint, price: v })} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Btn variant="ledger" onClick={addPricePoint} disabled={!pricePoint.label.trim() || pricePoint.price === ""}>
              Record the price
            </Btn>
            <Btn
              onClick={async () => {
                const s = data.stock;
                setDiscordState(
                  await sendToDiscord(
                    data.company.ticker + " at $" + dec(s.price),
                    "Last traded $" + dec(s.price) + " (previous close $" + dec(s.prevClose) + "). Market capital " + compact(s.price * s.shares) + "."
                  )
                );
              }}
            >
              Push price to Discord
            </Btn>
          </div>
          <div className="mt-4">
            <Field label="Shares issued" type="number" value={data.stock.shares} onChange={(v) => set("stock.shares", v)} />
          </div>
        </Panel>
      </section>

      <section>
        <SectionHead
          index="III"
          title="Discord"
          note="Paste a webhook from your server (Channel settings, Integrations, Webhooks). Anyone with executive access can see it, so treat it as a shared company secret and reset it if it leaks."
        />
        <Panel style={{ padding: 20 }}>
          <Field label="Webhook URL" value={data.discord.webhook} onChange={(v) => set("discord.webhook", v)} placeholder="https://discord.com/api/webhooks/..." />
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field label="Channel it posts to" value={data.discord.channel} onChange={(v) => set("discord.channel", v)} />
            <Field label="Server invite" value={data.company.discordInvite} onChange={(v) => set("company.discordInvite", v)} placeholder="https://discord.gg/..." />
          </div>
          <Btn
            onClick={async () =>
              setDiscordState(await sendToDiscord("Connection test", "The company site can reach this channel."))
            }
          >
            Send a test message
          </Btn>
          {discordState && (
            <p className="mt-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>
              {discordState}
            </p>
          )}
        </Panel>
      </section>

      <section>
        <SectionHead index="IV" title="Company details" />
        <Panel style={{ padding: 20 }}>
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field label="Name" value={data.company.name} onChange={(v) => set("company.name", v)} />
            <Field label="Short name" value={data.company.short} onChange={(v) => set("company.short", v)} />
            <Field label="Ticker" value={data.company.ticker} onChange={(v) => set("company.ticker", v)} />
            <Field label="Exchange" value={data.company.exchange} onChange={(v) => set("company.exchange", v)} />
            <Field label="Headquarters" value={data.company.hq} onChange={(v) => set("company.hq", v)} />
            <Field label="Founded" value={data.company.founded} onChange={(v) => set("company.founded", v)} />
            <Field label="Chief executive" value={data.company.ceo} onChange={(v) => set("company.ceo", v)} />
            <Field label="Server IP" value={data.company.serverIp} onChange={(v) => set("company.serverIp", v)} />
          </div>
          <Field label="Tagline" value={data.company.tagline} onChange={(v) => set("company.tagline", v)} />
          <Field label="Mission statement" rows={7} value={data.company.mission} onChange={(v) => set("company.mission", v)} />
        </Panel>
      </section>

      <section>
        <SectionHead index="V" title="Records" note="Everything below saves the moment you type it." />
        <ListEditor
          title="Divisions"
          items={data.divisions}
          blank={{ name: "", code: "", lead: "", blurb: "" }}
          onChange={(v) => set("divisions", v)}
          fields={[
            { k: "name", label: "Name" },
            { k: "code", label: "Code" },
            { k: "lead", label: "Lead" },
            { k: "blurb", label: "What it does", full: true, rows: 2 },
          ]}
        />
        <ListEditor
          title="Staff"
          items={data.staff}
          blank={{ name: "", role: "", dept: "Executive", joined: "", note: "", internal: "" }}
          onChange={(v) => set("staff", v)}
          fields={[
            { k: "name", label: "In-game name" },
            { k: "role", label: "Title" },
            { k: "dept", label: "Division" },
            { k: "joined", label: "Joined" },
            { k: "note", label: "Public note", full: true, rows: 2 },
            { k: "internal", label: "Internal note (staff only)", full: true, rows: 2 },
          ]}
        />
        <ListEditor
          title="Projects"
          items={data.projects}
          blank={{ name: "", status: "Drafting", visibility: "public", progress: 0, target: "", summary: "" }}
          onChange={(v) => set("projects", v)}
          fields={[
            { k: "name", label: "Name" },
            { k: "status", label: "Status", options: ["Drafting", "Negotiating", "Building", "In review", "Done", "Shelved"] },
            { k: "visibility", label: "Who can see it", options: ["public", "client", "staff"] },
            { k: "progress", label: "Progress %", type: "number" },
            { k: "target", label: "Target" },
            { k: "summary", label: "Summary", full: true, rows: 2 },
          ]}
        />
        <ListEditor
          title="Rate card"
          items={data.services}
          blank={{ name: "", price: "", detail: "" }}
          onChange={(v) => set("services", v)}
          fields={[
            { k: "name", label: "Service" },
            { k: "price", label: "Price" },
            { k: "detail", label: "Detail", full: true, rows: 2 },
          ]}
        />
        <ListEditor
          title="Monthly figures"
          items={data.financials.periods}
          blank={{ label: "", revenue: 0, expenses: 0 }}
          onChange={(v) => set("financials.periods", v)}
          fields={[
            { k: "label", label: "Period" },
            { k: "revenue", label: "Revenue", type: "number" },
            { k: "expenses", label: "Expenses", type: "number" },
          ]}
        />
        <Panel style={{ padding: 20, marginBottom: 32 }}>
          <Eyebrow>Balance sheet</Eyebrow>
          <div className="grid md:grid-cols-2 gap-x-5 mt-4">
            <Field label="Cash" type="number" value={data.financials.balance.cash} onChange={(v) => set("financials.balance.cash", v)} />
            <Field label="Inventory" type="number" value={data.financials.balance.inventory} onChange={(v) => set("financials.balance.inventory", v)} />
            <Field label="Property" type="number" value={data.financials.balance.property} onChange={(v) => set("financials.balance.property", v)} />
            <Field label="Investments" type="number" value={data.financials.balance.investments} onChange={(v) => set("financials.balance.investments", v)} />
            <Field label="Liabilities" type="number" value={data.financials.balance.liabilities} onChange={(v) => set("financials.balance.liabilities", v)} />
          </div>
          <Field label="Note under the figures" rows={2} value={data.financials.note} onChange={(v) => set("financials.note", v)} />
        </Panel>
        <ListEditor
          title="Requests from clients"
          items={data.requests}
          blank={{ ts: "", from: "", contact: "", type: "", detail: "", status: "New" }}
          onChange={(v) => set("requests", v)}
          fields={[
            { k: "from", label: "From" },
            { k: "status", label: "Status", options: ["New", "Quoted", "Agreed", "Delivered", "Declined"] },
            { k: "detail", label: "Detail", full: true, rows: 2 },
          ]}
        />
      </section>

      <section>
        <SectionHead
          index="VI"
          title="Access codes"
          note="Change these the moment someone leaves the company. Codes are shared between everyone who uses this site, so they are a convenience, not real security — never reuse a password you use anywhere else."
        />
        <Panel style={{ padding: 20 }}>
          <div className="grid md:grid-cols-3 gap-x-5">
            <Field label="Client code" value={data.codes.client} onChange={(v) => set("codes.client", v)} />
            <Field label="Staff code" value={data.codes.staff} onChange={(v) => set("codes.staff", v)} />
            <Field label="Executive code" value={data.codes.exec} onChange={(v) => set("codes.exec", v)} />
          </div>
        </Panel>
      </section>
    </div>
  );
}

/* ----------------------------- sign in ----------------------------- */

function SignIn({ data, onClose, onRole }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const attempt = () => {
    const c = code.trim().toLowerCase();
    const codes = data.codes;
    if (c === (codes.exec || "").toLowerCase()) return onRole("exec");
    if (c === (codes.staff || "").toLowerCase()) return onRole("staff");
    if (c === (codes.client || "").toLowerCase()) return onRole("client");
    setErr("That code does not match any account. Ask in the company Discord.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(16,35,63,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.paper, border: `2px solid ${C.ink}`, maxWidth: 420, width: "100%" }}
      >
        <Guilloche height={10} />
        <div className="p-7">
          <Eyebrow color={C.gold}>Access</Eyebrow>
          <h2 className="mt-2" style={{ fontFamily: F.display, fontSize: 30, color: C.ink, lineHeight: 1.05 }}>
            Sign in
          </h2>
          <p className="mt-2" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
            Clients, staff and executives each get their own code. Everything else on this site is public.
          </p>
          <div className="mt-5">
            <Field label="Access code" value={code} onChange={(v) => { setCode(v); setErr(""); }} />
          </div>
          {err && (
            <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
              {err}
            </p>
          )}
          <div className="flex gap-3">
            <Btn variant="solid" onClick={attempt} disabled={!code.trim()}>
              Sign in
            </Btn>
            <Btn onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- app ----------------------------- */

export default function App() {
  const [data, setData] = useState(null);
  const [role, setRole] = useState("public");
  const [tab, setTab] = useState("Overview");
  const [showSignIn, setShowSignIn] = useState(false);
  const [status, setStatus] = useState("Loading the company record…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await readShared();
      if (cancelled) return;
      if (stored && stored.company) {
        setData(stored);
        setStatus("");
      } else {
        setData(SEED);
        setStatus("");
        writeShared(SEED);
      }
      try {
        const s = await window.storage.get(SESSION_KEY, false);
        if (s && s.value && !cancelled) setRole(JSON.parse(s.value).role || "public");
      } catch (e) {
        /* no session yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((next) => {
    setData(next);
    writeShared(next);
  }, []);

  const setRolePersist = useCallback((r) => {
    setRole(r);
    setShowSignIn(false);
    try {
      window.storage.set(SESSION_KEY, JSON.stringify({ role: r }), false);
    } catch (e) {
      /* session stays in memory only */
    }
  }, []);

  const submitRequest = useCallback(
    async (req) => {
      const next = deepClone(data);
      next.requests = [...next.requests, req].slice(-100);
      save(next);
      const url = (next.discord.webhook || "").trim();
      if (url) {
        try {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: next.company.short + " Terminal",
              embeds: [
                {
                  title: "New client request — " + req.type,
                  description: req.detail,
                  color: 0xb8892b,
                  footer: { text: req.from + (req.contact ? " · " + req.contact : "") },
                },
              ],
            }),
          });
        } catch (e) {
          /* the request is still saved on the site */
        }
      }
    },
    [data, save]
  );

  const level = LEVEL[role] ?? 0;

  const tabs = useMemo(
    () => [
      { name: "Overview", min: 0 },
      { name: "Share", min: 0 },
      { name: "Financials", min: 0 },
      { name: "People", min: 0 },
      { name: "Projects", min: 0 },
      { name: "Client desk", min: 0 },
      { name: "Staff room", min: 0 },
      { name: "Control room", min: LEVEL.exec },
    ],
    []
  );

  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: C.paper }}
      >
        <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: "0.2em", color: C.inkSoft }}>
          {status.toUpperCase()}
        </span>
      </div>
    );
  }

  const s = data.stock;
  const change = s.price - s.prevClose;
  const up = change >= 0;

  return (
    <div
      style={{
        background: C.paper,
        minHeight: "100vh",
        backgroundImage: `repeating-linear-gradient(0deg, rgba(16,35,63,0.035) 0 1px, transparent 1px 28px)`,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${C.gold};
          outline-offset: 2px;
        }
        input:focus, textarea:focus, select:focus { border-color: ${C.ink} !important; }
        .ucc-tab:hover { color: ${C.ink} !important; }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      `}</style>

      {/* ticker strip */}
      <div style={{ background: C.ink, color: C.paper }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
          {[
            [data.company.ticker, "$" + dec(s.price)],
            ["CHG", (up ? "+" : "") + dec(change)],
            ["CAP", compact(s.price * s.shares)],
            ["EXCH", data.company.exchange],
          ].map(([k, v], i) => (
            <span key={i} style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em" }}>
              <span style={{ opacity: 0.55 }}>{k}</span>{" "}
              <span style={{ color: i === 1 ? (up ? "#7FD1A8" : "#E39A95") : C.paper }}>{v}</span>
            </span>
          ))}
          <span className="ml-auto" style={{ fontFamily: F.mono, fontSize: 10.5, opacity: 0.6 }}>
            {ROLE_NAME[role].toUpperCase()}
          </span>
        </div>
      </div>

      {/* header */}
      <header
        className="sticky top-0 z-40"
        style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => setTab("Overview")}
            className="text-left min-w-0"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <div style={{ fontFamily: F.display, fontSize: 19, color: C.ink, fontWeight: 700, lineHeight: 1 }}>
              United Commerce
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.18em", color: C.gold, marginTop: 2 }}>
              {data.company.ticker} · {data.company.hq.toUpperCase()}
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {data.company.discordInvite && (
              <a href={data.company.discordInvite} target="_blank" rel="noreferrer">
                <Btn>Discord</Btn>
              </a>
            )}
            {role === "public" ? (
              <Btn variant="solid" onClick={() => setShowSignIn(true)}>
                Sign in
              </Btn>
            ) : (
              <Btn onClick={() => setRolePersist("public")}>Sign out</Btn>
            )}
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-2 overflow-x-auto">
          <div className="flex gap-5" style={{ whiteSpace: "nowrap" }}>
            {tabs
              .filter((t) => level >= t.min)
              .map((t) => (
                <button
                  key={t.name}
                  className="ucc-tab"
                  onClick={() => setTab(t.name)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px 0",
                    cursor: "pointer",
                    fontFamily: F.mono,
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: tab === t.name ? C.ink : C.inkSoft,
                    borderBottom: tab === t.name ? `2px solid ${C.gold}` : "2px solid transparent",
                  }}
                >
                  {t.name}
                </button>
              ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        {tab === "Overview" && (
          <>
            <div className="mb-12">
              <Certificate data={data} />
            </div>
            <Overview data={data} level={level} />
          </>
        )}
        {tab === "Share" && <ShareSection data={data} level={level} />}
        {tab === "Financials" && <Financials data={data} level={level} />}
        {tab === "People" && <People data={data} level={level} />}
        {tab === "Projects" && <Projects data={data} level={level} />}
        {tab === "Client desk" && (
          <ClientDesk data={data} level={level} onSubmitRequest={submitRequest} />
        )}
        {tab === "Staff room" && <StaffRoom data={data} level={level} />}
        {tab === "Control room" && <ControlRoom data={data} level={level} save={save} />}
      </main>

      <footer style={{ borderTop: `1px solid ${C.rule}`, background: C.paperDeep }}>
        <Guilloche height={8} />
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <div style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>
              {data.company.name}
            </div>
            <p className="mt-1 max-w-md" style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
              A roleplay company on DemocracyCraft ({data.company.serverIp}). Figures are in-game currency and mean nothing outside the server.
            </p>
          </div>
          <div className="text-left md:text-right">
            <Eyebrow>Filed by</Eyebrow>
            <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink, marginTop: 4 }}>
              Office of the Chief Executive
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
              Last price posted {s.updated}
            </div>
          </div>
        </div>
      </footer>

      {showSignIn && (
        <SignIn data={data} onClose={() => setShowSignIn(false)} onRole={setRolePersist} />
      )}
    </div>
  );
}
