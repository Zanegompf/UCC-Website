"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LEGAL_KINDS,
  LEGAL_KIND_BLURBS,
  LEGAL_STATUSES,
  LEGAL_STATUS_DEFAULT,
  kindPlural,
} from "@/lib/legal";
import {
  RESEARCH_KINDS,
  RESEARCH_KIND_BLURBS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_DEFAULT,
  researchPlural,
} from "@/lib/research";
import { ARCHIVE_KINDS, archiveLabel } from "@/lib/archive";
import { FORUM_BOARDS, boardBy, lastActivity } from "@/lib/forum";
import { readRegister } from "@/lib/shareholders";
import { CAPS, STOCK_HISTORY_CAP } from "@/lib/caps";

/* ------------------------------------------------------------------ *
 * The United Commerce Corporation — DemocracyCraft corporate site
 *
 * Design direction: a modern holding company that happens to be old.
 * A deep navy shell — ticker, masthead, hero, footer — wraps light,
 * generous working pages. The engraved heritage is kept deliberately and
 * sparingly: the wax seal is the company mark, every figure is set in
 * mono, and the guilloche survives as a hairline texture rather than a
 * border. Square corners, hairline rules, no blur, no gradient buttons.
 * ------------------------------------------------------------------ */

const C = {
  // Working surfaces. Cooler and cleaner than the old cream, so the dark
  // shell above them reads as deliberate contrast rather than as age.
  paper: "#F7F6F3",
  paperDeep: "#EDEBE5",
  paperLine: "#E1DED7",
  rule: "#D5D1C8",

  ink: "#111C2E",
  inkSoft: "#5B6779",

  // The shell. `night` is the masthead and hero, `nightDeep` the ticker
  // rail and footer, so the two dark bands are distinguishable.
  night: "#0C1724",
  nightDeep: "#060D16",
  nightSoft: "#93A3B6",
  nightLine: "rgba(255,255,255,0.13)",

  ledger: "#1C7554",
  seal: "#9B3630",
  gold: "#C0913A",

  // Same three, lifted for legibility against `night`. Dark backgrounds
  // eat saturation, so the page versions read muddy up there.
  ledgerUp: "#5FD3A0",
  sealDown: "#E7938C",
  goldBright: "#E2BB6B",
};

const F = {
  display: "'Bodoni Moda', 'Didot', Georgia, serif",
  body: "'Archivo', 'Helvetica Neue', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};


// Mirrors LEVEL in lib/roles.js. The server is the authority; this copy only
// decides what the interface offers to try.
const LEVEL = {
  public: 0,
  member: 0,
  client: 1,
  staff: 2,
  rnd: 3,
  legal: 4,
  exec: 5,
  ceo: 6,
};
const ROLE_NAME = {
  public: "Visitor",
  member: "Member",
  client: "Client",
  staff: "Staff",
  rnd: "Research",
  legal: "Legal",
  exec: "Executive",
  ceo: "Chief Executive",
};
const ROLE_BLURB = {
  member: "You have an account, but no company access yet. An executive can raise it.",
  client: "You can see the rate card, client projects and the request desk.",
  staff: "You can see the balance sheet, internal notes and incoming requests.",
  rnd: "Everything a staff member sees, plus the research department's files — market research, competitor analysis and acquisition targets.",
  legal: "Everything the research department sees, plus the legal department's filings, which you can add to and comment on.",
  exec: "You can edit the company record and manage accounts.",
  ceo: "Everything an executive can do, plus rearranging the company chart from the people page.",
};

const ROLE_TABS = [
  { key: "member", label: "Member", hint: "Signed in, sees only public material" },
  { key: "client", label: "Client", hint: "Rate card, client projects, request desk" },
  { key: "staff", label: "Staff", hint: "Balance sheet, internal notes, requests" },
  { key: "rnd", label: "R&D", hint: "Staff, plus the research department's files" },
  { key: "legal", label: "Legal", hint: "R&D, plus the legal department's filings" },
  { key: "exec", label: "Exec", hint: "Full control of the company record" },
  { key: "ceo", label: "CEO", hint: "Exec, plus editing the chart in place" },
];

// Mirrors HOOK_EVENTS in lib/discord.js. Kept as its own copy so the server's
// posting code stays out of the browser bundle — if you add an event there,
// add it here too. Posting a notice is the only thing on this site that reaches
// a webhook; requests, shifts and applications all stay put.
const HOOK_EVENTS = ["All posts", "Announcements"];

/**
 * The tabs, and their addresses.
 *
 * Each one is a slug in the URL hash — `#staff-room` — so a refresh, a
 * bookmark or a pasted link all come back to the same tab instead of dropping
 * you on the overview. The hash is used rather than a real route because the
 * whole site is one client component behind a single page; giving each tab a
 * route would mean splitting that up for no gain the address bar does not
 * already provide.
 *
 * `Account` is not in the list because it only exists while somebody is signed
 * in, but it is addressable all the same.
 */
const TABS = [
  { name: "Overview", min: 0 },
  { name: "Share", min: 0 },
  { name: "Financials", min: 0 },
  { name: "People", min: 0 },
  { name: "Projects", min: 0 },
  { name: "Client desk", min: 0 },
  { name: "Staff room", min: 0 },
  { name: "Control room", min: LEVEL.exec },
  // Sits after the control room and before the account tab, which App appends.
  // Open to everyone: reading the forum takes no account, posting does.
  { name: "UCC Forum", min: 0 },
];

const ACCOUNT_TAB = "Account";
const TAB_NAMES = [...TABS.map((t) => t.name), ACCOUNT_TAB];

const slugOf = (name) => String(name).toLowerCase().replace(/\s+/g, "-");

function tabFromHash() {
  if (typeof window === "undefined") return null;
  const slug = (window.location.hash || "").replace(/^#/, "");
  if (!slug) return null;
  return TAB_NAMES.find((n) => slugOf(n) === slug) || null;
}

const PREFS_KEY = "ucc:prefs";
const DEFAULT_PREFS = { fullFigures: false, landingTab: "Overview" };

function loadPrefs() {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch (e) {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    /* preferences just will not persist */
  }
}

// Read by compact() below. Set from App whenever preferences change, so the
// formatting switch reaches every figure on the page without threading a prop
// through every component.
let FULL_FIGURES = false;

/* ----------------------------- seed data ----------------------------- */

/* ----------------------------- utilities ----------------------------- */

const money = (n) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

const compact = (n) => {
  const v = Number(n) || 0;
  if (FULL_FIGURES) return money(v);
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
};

const dec = (n) => (Number(n) || 0).toFixed(2);

/**
 * Puts AM or PM on a shift time.
 *
 * Times are stored as plain text, so this composes rather than adding a field:
 * "6:00" plus "PM" is stored as "6:00 PM" and everything that reads the log
 * carries on working, including the entries already in it.
 *
 * It declines twice over, because both would produce nonsense: when the time
 * already says AM or PM, and when it is plainly 24-hour. "18:00 PM" helps
 * nobody, and 18:00 was never ambiguous to begin with.
 */
function withMeridiem(time, meridiem) {
  const t = String(time || "").trim();
  if (!t || !meridiem) return t;
  if (/[ap]\.?m\.?$/i.test(t)) return t;
  const hour = Number((t.match(/^(\d{1,2})/) || [])[1]);
  if (hour >= 13) return t;
  return `${t} ${meridiem}`;
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body;
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

/**
 * The card everything sits in. `tone="deep"` tints it for asides,
 * `raised` adds the lift used by things that behave like a link.
 */
function Panel({ children, style, tone, raised }) {
  return (
    <div
      className={raised ? "ucc-raise" : undefined}
      style={{
        background: tone === "deep" ? C.paperDeep : "#FFFFFF",
        border: `1px solid ${C.rule}`,
        boxShadow: "0 1px 2px rgba(17,28,46,0.05)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionHead({ index, title, note }) {
  return (
    <div className="mb-7">
      <div className="flex items-center gap-3">
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 11,
            color: C.gold,
            letterSpacing: "0.18em",
          }}
        >
          {index}
        </span>
        <span style={{ flex: 1, height: 1, background: C.rule }} />
      </div>
      <h2
        className="mt-3"
        style={{
          fontFamily: F.display,
          fontSize: "clamp(28px, 4vw, 42px)",
          lineHeight: 1.04,
          color: C.ink,
          fontWeight: 600,
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </h2>
      {note && (
        <p
          className="mt-3 max-w-2xl"
          style={{
            fontFamily: F.body,
            fontSize: 15.5,
            lineHeight: 1.6,
            color: C.inkSoft,
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * A single figure. `onDark` swaps the label and caption colours for the
 * hero band; the number itself is always mono, light or dark.
 */
function Stat({ label, value, sub, accent, onDark }) {
  return (
    <div className="py-3">
      <Eyebrow color={onDark ? C.nightSoft : C.inkSoft}>{label}</Eyebrow>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: "clamp(22px, 2.6vw, 30px)",
          color: accent || (onDark ? "#FFFFFF" : C.ink),
          marginTop: 8,
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-1"
          style={{
            fontFamily: F.body,
            fontSize: 12.5,
            color: onDark ? C.nightSoft : C.inkSoft,
          }}
        >
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
    padding: "11px 18px",
    border: `1px solid ${C.ink}`,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
  };
  const skins = {
    solid: { background: C.ink, color: "#FFFFFF" },
    ghost: { background: "transparent", color: C.ink },
    seal: { background: C.seal, color: "#FFFFFF", border: `1px solid ${C.seal}` },
    ledger: { background: C.ledger, color: "#FFFFFF", border: `1px solid ${C.ledger}` },
    // For the masthead and hero, where the page colours would vanish.
    light: { background: "transparent", color: "#FFFFFF", border: `1px solid ${C.nightLine}` },
    gold: { background: C.gold, color: C.night, border: `1px solid ${C.gold}` },
  };
  return (
    <button
      type={type || "button"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={disabled ? undefined : `ucc-btn ucc-btn-${variant || "ghost"}`}
      style={{ ...base, ...(skins[variant] || skins.ghost), ...style }}
    >
      {children}
    </button>
  );
}

/**
 * `options` is a flat list. `groups` is [{label, items[]}] and renders
 * optgroups instead — the job list needs it, since the server publishes its
 * jobs under trades, professions, government and licences.
 */
function Field({ label, value, onChange, type, rows, placeholder, options, groups, hint }) {
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
      {groups ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={shared}
        >
          <option value="">—</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((o) => (
                <option key={g.label + o} value={o}>
                  {o}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={shared}
        >
          {/* A stored value that is no longer offered still has to appear, or
              the box would show something other than what is saved. Retired
              webhook events are the case that needs this. */}
          {(options.includes(value) || value === undefined || value === ""
            ? options
            : [value, ...options]
          ).map((o) => (
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
      {hint && (
        <div
          className="mt-1"
          style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}
        >
          {hint}
        </div>
      )}
    </label>
  );
}

/* -------------------------- marks and the hero -------------------------- */

/**
 * The engraved stripe, kept from the certificate era but demoted to a
 * hairline texture: a full-strength band reads as decoration, a faint one
 * reads as paper stock.
 */
function Guilloche({ height, tone }) {
  const dark = tone === "dark";
  return (
    <div
      aria-hidden="true"
      style={{
        height: height || 10,
        backgroundImage: `repeating-linear-gradient(135deg, ${
          dark ? "#FFFFFF" : C.ink
        } 0 1px, transparent 1px 7px)`,
        opacity: dark ? 0.13 : 0.3,
      }}
    />
  );
}

/**
 * The wax seal, now the company mark rather than a flourish — it appears
 * in the masthead small, in the hero and footer at full size.
 */
function Seal({ ticker, size, tone }) {
  const d = size || 104;
  const dark = tone === "dark";
  const ringColor = dark ? C.goldBright : C.seal;
  const fill = dark ? "rgba(226,187,107,0.08)" : "rgba(155,54,48,0.06)";
  const small = d < 60;

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: d,
        height: d,
        borderRadius: "50%",
        border: `${small ? 1 : 2}px solid ${ringColor}`,
        boxShadow: small
          ? "none"
          : `inset 0 0 0 4px ${dark ? C.night : C.paper}, inset 0 0 0 5px ${ringColor}`,
        background: fill,
      }}
    >
      <div className="text-center leading-none">
        <div
          style={{
            fontFamily: F.display,
            fontSize: small ? d * 0.42 : 26,
            color: ringColor,
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          {ticker}
        </div>
        {!small && (
          <>
            <div
              style={{
                fontFamily: F.mono,
                fontSize: 7,
                letterSpacing: "0.16em",
                color: ringColor,
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
                color: ringColor,
              }}
            >
              INCORPORATED
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The full-bleed dark band the front page opens on.
 *
 * It carries everything the engraved certificate used to: the seal, the
 * certification wording, the CEO's signature. What changed is the framing
 * — the company states its name at scale first, and the instrument it is
 * issued under becomes the fine print underneath, which is the order a
 * large company presents itself in.
 */
function Hero({ data }) {
  const s = data.stock;
  const change = s.price - s.prevClose;
  const pct = s.prevClose ? (change / s.prevClose) * 100 : 0;
  const up = change >= 0;
  const cap = s.price * s.shares;

  return (
    <section style={{ background: C.night, color: "#FFFFFF" }}>
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-10 md:pt-20 md:pb-14">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          <div className="min-w-0">
            <Eyebrow color={C.goldBright}>
              {data.company.exchange} · {data.company.ticker} · Incorporated{" "}
              {data.company.founded}
            </Eyebrow>
            <h1
              className="mt-5"
              style={{
                fontFamily: F.display,
                fontWeight: 700,
                color: "#FFFFFF",
                fontSize: "clamp(40px, 8vw, 82px)",
                lineHeight: 0.94,
                letterSpacing: "-0.025em",
              }}
            >
              The United
              <br />
              Commerce
              <br />
              Corporation
            </h1>
            <p
              className="mt-6 max-w-lg"
              style={{
                fontFamily: F.body,
                fontSize: "clamp(16px, 1.8vw, 19px)",
                lineHeight: 1.55,
                color: C.nightSoft,
              }}
            >
              {data.company.tagline}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                // Not divisions.length: that list now carries the board and
                // the desks under the trades as well.
                [operatingDivisions(data.divisions).length, "divisions"],
                [data.staff.length, "on the books"],
                [data.company.hq, ""],
              ].map(([v, k], i) => (
                <span key={i} className="flex items-baseline gap-2">
                  <span
                    style={{ fontFamily: F.mono, fontSize: 15, color: "#FFFFFF" }}
                  >
                    {v}
                  </span>
                  {k && (
                    <span
                      style={{
                        fontFamily: F.body,
                        fontSize: 13.5,
                        color: C.nightSoft,
                      }}
                    >
                      {k}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>

          <div className="flex md:flex-col items-center md:items-end gap-5 shrink-0">
            <Seal ticker={data.company.ticker} tone="dark" />
            <div className="md:text-right">
              <Eyebrow color={C.nightSoft}>Chief Executive</Eyebrow>
              <div
                style={{
                  fontFamily: F.display,
                  fontStyle: "italic",
                  fontSize: 24,
                  color: "#FFFFFF",
                  marginTop: 4,
                }}
              >
                {data.company.ceo}
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-12 pt-2"
          style={{ borderTop: `1px solid ${C.nightLine}` }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8">
            <Stat
              onDark
              label="Last traded"
              value={"$" + dec(s.price)}
              sub={"as of " + s.updated}
            />
            <Stat
              onDark
              label="Change"
              value={
                (up ? "+" : "") +
                dec(change) +
                " / " +
                (up ? "+" : "") +
                pct.toFixed(1) +
                "%"
              }
              accent={up ? C.ledgerUp : C.sealDown}
              sub="since previous close"
            />
            <Stat
              onDark
              label="Shares issued"
              value={s.shares.toLocaleString("en-US")}
              sub="common stock"
            />
            <Stat onDark label="Market capital" value={compact(cap)} sub="price × shares" />
          </div>

          <div className="mt-6" style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={s.history}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke={C.nightLine} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: F.mono, fontSize: 9.5, fill: C.nightSoft }}
                  axisLine={{ stroke: C.nightLine }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontFamily: F.mono, fontSize: 9.5, fill: C.nightSoft }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ stroke: C.nightLine }}
                  contentStyle={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    background: C.nightDeep,
                    border: `1px solid ${C.nightLine}`,
                    borderRadius: 0,
                    color: "#FFFFFF",
                  }}
                  labelStyle={{ color: C.nightSoft }}
                  formatter={(v) => ["$" + dec(v), "Price"]}
                />
                <Line
                  type="stepAfter"
                  dataKey="price"
                  stroke={up ? C.ledgerUp : C.sealDown}
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p
            className="mt-8 max-w-2xl"
            style={{
              fontFamily: F.body,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: C.nightSoft,
            }}
          >
            This certifies that the holder is the owner of fully paid shares of
            common stock in {data.company.name}, transferable on the books of the
            corporation via {data.company.exchange}.
          </p>
        </div>
      </div>
      <Guilloche height={10} tone="dark" />
    </section>
  );
}

/* ----------------------------- list editor ----------------------------- */

/**
 * `footer` renders under a row's fields, for anything that is not a plain
 * value on the record — the account behind an application, for instance,
 * which lives on the account list rather than in this item at all.
 */
function ListEditor({ title, items, fields, blank, onChange, footer }) {
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
                    hint={f.hint}
                    onChange={(v) => update(i, f.k, v)}
                  />
                </div>
              ))}
            </div>
            {footer && footer(it, i)}
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

/* ------------------------------- org chart ------------------------------ */

/**
 * Text that becomes a field when the chart is unlocked.
 *
 * The input inherits its type from whatever wraps it, so a heading stays a
 * heading while it is being edited rather than jumping to a form font.
 *
 * It commits on blur, not on every keystroke. The control room saves as you
 * type, but each save here is a PUT of the whole company record, and a
 * paragraph is a lot of them.
 */
function Editable({ value, onCommit, editing, rows, placeholder }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (!editing) return <>{value}</>;

  const shared = {
    font: "inherit",
    color: "inherit",
    letterSpacing: "inherit",
    lineHeight: "inherit",
    width: "100%",
    display: "block",
    background: "rgba(192,145,58,0.12)",
    border: "none",
    borderBottom: `1px dashed ${C.gold}`,
    padding: "1px 3px",
    outline: "none",
    resize: rows ? "vertical" : "none",
  };

  const commit = () => {
    if ((value ?? "") !== draft) onCommit(draft);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setDraft(value ?? "");
      e.currentTarget.blur();
    }
    if (e.key === "Enter" && !rows) e.currentTarget.blur();
  };

  // `ucc-inherit` keeps the phone stylesheet's 16px minimum off these: they
  // take their type from whatever they are replacing, and a heading that
  // shrank the moment you edited it would be worse than the zoom it avoids.
  return rows ? (
    <textarea
      className="ucc-inherit"
      rows={rows}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      style={shared}
    />
  ) : (
    <input
      className="ucc-inherit"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      style={shared}
    />
  );
}

/** A small square button for the chart's own controls. */
function OrgAction({ children, onClick, title, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="ucc-btn"
      style={{
        fontFamily: F.mono,
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "5px 9px",
        cursor: "pointer",
        background: "transparent",
        color: tone === "seal" ? C.seal : C.inkSoft,
        border: `1px dashed ${tone === "seal" ? C.seal : C.rule}`,
      }}
    >
      {children}
    </button>
  );
}

// Must match the gap on .ucc-org-row and .ucc-org-branch in globals.css —
// the connecting rules are positioned against it.
const ORG_GAP = 20;

/**
 * An operating division is a coded entry sitting directly under an uncoded
 * one. Governing bodies carry no code, so this counts the trades without
 * counting the board above them or the desks below them.
 */
function operatingDivisions(divisions) {
  const list = divisions || [];
  return list.filter((d) => {
    if (!d?.code) return false;
    const parent = list.find((p) => p.name === d.parent);
    return !parent || !parent.code;
  });
}

/**
 * The governing bodies are context, not the subject of the page, so they are
 * drawn tighter than a division and the type comes down a step.
 */
/**
 * A block's restricted remit — what it is actually for, as against the public
 * description beside it.
 *
 * There is no level check here, and that is the point: `filterData` strips
 * `remit` from every division below `rnd`, so a viewer who was not meant to
 * read it does not have it to render. Testing the level here as well would be a
 * second, weaker copy of the same decision — and the sort that quietly stops
 * matching the real one.
 */
function OrgRemit({ remit, small }) {
  if (!remit) return null;
  return (
    <div
      className={small ? "mt-2 pt-2" : "mt-3 pt-3"}
      style={{ borderTop: `1px dashed ${C.rule}` }}
    >
      <Eyebrow color={C.seal}>Remit — not shown below the department</Eyebrow>
      <p
        className="mt-1"
        style={{
          fontFamily: F.body,
          fontSize: small ? 12.5 : 13.5,
          color: C.ink,
          lineHeight: 1.5,
        }}
      >
        {remit}
      </p>
    </div>
  );
}

function OrgGoverningCard({ d }) {
  return (
    // height:100% so that when this card sits in a branch row it fills the
    // row's card track, and two blocks at the same level end up the same size
    // whatever their descriptions run to.
    <Panel tone="deep" style={{ padding: "13px 16px", height: "100%" }}>
      <h3
        style={{
          fontFamily: F.display,
          fontSize: 19,
          lineHeight: 1.15,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {d.name}
      </h3>
      {d.blurb && (
        <p
          className="mt-1"
          style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}
        >
          {d.blurb}
        </p>
      )}
      <OrgRemit remit={d.remit} small />
    </Panel>
  );
}

/**
 * Somebody on the chart. `dept` is matched against the block names, so one
 * person can sit in more than one — the chief executive chairs the board and
 * sits on the committee, and should show in both.
 */
function OrgMembers({ members, level, edit }) {
  const editing = Boolean(edit);

  // The row whose remove has been armed, held by identity rather than index so
  // it cannot end up pointing at somebody else if the list shifts underneath.
  // Taking a person off the chart is the one edit here that retyping cannot
  // undo, so it asks twice.
  const [armed, setArmed] = useState(null);

  if (!members.length && !editing) {
    return (
      <p
        className="mt-3"
        style={{ fontFamily: F.body, fontSize: 13, color: C.inkSoft, fontStyle: "italic" }}
      >
        Nobody listed yet.
      </p>
    );
  }

  return (
    <ul className="mt-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {members.map((m, i) => (
        <li key={i} className="flex gap-2 mb-2">
          <span
            aria-hidden="true"
            className="shrink-0"
            style={{ width: 4, height: 4, background: C.gold, marginTop: 8 }}
          />
          <div className="min-w-0 flex-1">
            <div style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>
              {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ flex: "1 1 150px", minWidth: 0 }}>
                    <Editable
                      editing
                      value={m.role}
                      placeholder="Title"
                      onCommit={(v) => edit.setPerson(m, { role: v })}
                    />
                  </span>
                  <span style={{ flex: "1 1 110px", minWidth: 0, fontFamily: F.mono, fontSize: 12.5 }}>
                    <Editable
                      editing
                      value={m.name}
                      placeholder="In-game name"
                      onCommit={(v) => edit.setPerson(m, { name: v })}
                    />
                  </span>
                  {armed === m ? (
                    <span className="flex items-center gap-2">
                      <span
                        style={{ fontFamily: F.mono, fontSize: 10.5, color: C.seal }}
                      >
                        Remove?
                      </span>
                      <OrgAction
                        tone="seal"
                        onClick={() => {
                          setArmed(null);
                          edit.removePerson(m);
                        }}
                        title="Yes, take this person off the chart"
                      >
                        Yes
                      </OrgAction>
                      <OrgAction onClick={() => setArmed(null)} title="Keep this person">
                        Keep
                      </OrgAction>
                    </span>
                  ) : (
                    <OrgAction
                      tone="seal"
                      onClick={() => setArmed(m)}
                      title="Remove this person"
                    >
                      ×
                    </OrgAction>
                  )}
                </div>
              ) : (
                <>
                  {m.role}
                  {m.name && (
                    <>
                      {" — "}
                      <span style={{ fontFamily: F.mono, fontSize: 12.5 }}>{m.name}</span>
                    </>
                  )}
                </>
              )}
            </div>
            {(m.note || editing) && (
              <div
                style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}
              >
                <Editable
                  editing={editing}
                  value={m.note}
                  placeholder="What they do here"
                  onCommit={(v) => edit.setPerson(m, { note: v })}
                />
              </div>
            )}
            {level >= LEVEL.staff && m.internal && !editing && (
              <div
                style={{ fontFamily: F.body, fontSize: 12.5, color: C.seal, lineHeight: 1.5 }}
              >
                {m.internal}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The same blocks as the overview chart, but holding people. */
function OrgPeopleCard({ d, members, governing, level, edit, hasChildren }) {
  const editing = Boolean(edit);
  const [armedRemove, setArmedRemove] = useState(false);

  return (
    <Panel
      tone={governing ? "deep" : undefined}
      raised={!governing && !editing}
      style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}
    >
      {d.code || editing ? (
        <div
          className="inline-block mb-4 self-start"
          style={{
            padding: "5px 9px",
            border: `1px solid ${C.gold}`,
            color: C.gold,
            fontFamily: F.mono,
            fontSize: 11,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            minWidth: editing ? 84 : undefined,
          }}
        >
          <Editable
            editing={editing}
            value={d.code}
            placeholder="Code"
            onCommit={(v) => edit.setDivision(d.name, { code: v })}
          />
        </div>
      ) : (
        <div className="mb-3">
          <Eyebrow>Governing</Eyebrow>
        </div>
      )}
      <h3
        style={{
          fontFamily: F.display,
          fontSize: 24,
          lineHeight: 1.1,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        <Editable
          editing={editing}
          value={d.name}
          placeholder="Name"
          onCommit={(v) => edit.renameDivision(d.name, v)}
        />
      </h3>
      {(d.blurb || editing) && (
        <p
          className="mt-2"
          style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
        >
          <Editable
            editing={editing}
            rows={editing ? 3 : undefined}
            value={d.blurb}
            placeholder="What this block is for"
            onCommit={(v) => edit.setDivision(d.name, { blurb: v })}
          />
        </p>
      )}

      <OrgRemit remit={d.remit} />

      <OrgMembers members={members} level={level} edit={edit} />

      {editing && (
        <div
          className="mt-4 pt-3 flex flex-wrap gap-2"
          style={{ borderTop: `1px dashed ${C.rule}` }}
        >
          <OrgAction onClick={() => edit.addPerson(d.name)} title="Add a person to this block">
            + Person
          </OrgAction>
          <OrgAction onClick={() => edit.addDivision(d.name)} title="Add a block under this one">
            + Division
          </OrgAction>
          {/* Removing a block with children would strand them, and the record
              is the only copy — so this only offers when nothing hangs off it
              and nobody is listed in it. */}
          {!hasChildren &&
            members.length === 0 &&
            (armedRemove ? (
              <span className="flex items-center gap-2">
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.seal }}>
                  Remove this block?
                </span>
                <OrgAction
                  tone="seal"
                  onClick={() => {
                    setArmedRemove(false);
                    edit.removeDivision(d.name);
                  }}
                  title="Yes, remove it"
                >
                  Yes
                </OrgAction>
                <OrgAction onClick={() => setArmedRemove(false)} title="Keep it">
                  Keep
                </OrgAction>
              </span>
            ) : (
              <OrgAction
                tone="seal"
                onClick={() => setArmedRemove(true)}
                title="Remove this block"
              >
                Remove
              </OrgAction>
            ))}
        </div>
      )}
    </Panel>
  );
}

function OrgCard({ d, governing }) {
  if (governing) return <OrgGoverningCard d={d} />;

  return (
    <Panel
      raised
      style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Only coded entries reach here — an uncoded one is a governing body
          and was drawn above. */}
      <div
        className="inline-block mb-4 self-start"
        style={{
          padding: "5px 9px",
          border: `1px solid ${C.gold}`,
          color: C.gold,
          fontFamily: F.mono,
          fontSize: 11,
          letterSpacing: "0.1em",
          whiteSpace: "nowrap",
        }}
      >
        {d.code}
      </div>
      <h3
        style={{
          fontFamily: F.display,
          fontSize: 24,
          lineHeight: 1.1,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {d.name}
      </h3>
      {d.blurb && (
        <p
          className="mt-3 flex-1"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
        >
          {d.blurb}
        </p>
      )}
      {/* No names here on purpose. The overview chart is the shape of the
          company; who sits in it is the People tab's job, and repeating a
          single "lead" alongside that only invites the two to disagree. */}
    </Panel>
  );
}

/** The vertical rule joining a card to whatever hangs beneath it. */
function OrgStem({ height }) {
  return (
    <div
      aria-hidden="true"
      style={{ width: 1, height: height || 26, background: C.rule, margin: "0 auto" }}
    />
  );
}

/**
 * The horizontal rule over a row of children, with a stub dropping to each.
 *
 * This is itself a grid on the same template as the row below, rather than a
 * strip with stubs placed at `100/n` percent: the row has a gap between
 * columns, so evenly-spaced percentages miss the card centres by several
 * pixels. Letting the browser lay out the same columns puts each stub exactly
 * over its card whatever the widths turn out to be. The horizontal segments
 * overhang by half the gap at each end so they meet across it.
 *
 * Hidden on narrow screens, where the row stacks into one column instead.
 */
function OrgBranch({ n, template }) {
  const overhang = -(ORG_GAP / 2);
  return (
    <div
      aria-hidden="true"
      className="ucc-org-branch"
      style={{ "--ucc-cols": n, "--ucc-template": template }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ position: "relative", height: 26 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              height: 1,
              background: C.rule,
              left: i === 0 ? "50%" : overhang,
              right: i === n - 1 ? "50%" : overhang,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 1,
              height: 26,
              background: C.rule,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * How wide a subtree is, in cards at its widest row.
 *
 * Used to weight a branch's columns. A leaf is 1; anything else is the sum of
 * its children, which is what "how many cards have to fit side by side under
 * this one" comes to.
 *
 * Carries the same `seen` guard as OrgNode, because `parent` is free text from
 * the control room and a cycle would otherwise recurse forever here instead.
 */
function subtreeSpan(node, childrenOf, seen) {
  if (!node || seen.has(node.name)) return 1;
  const next = new Set(seen).add(node.name);
  const kids = (childrenOf.get(node.name) || []).filter((k) => !next.has(k.name));
  if (!kids.length) return 1;
  return kids.reduce((sum, k) => sum + subtreeSpan(k, childrenOf, next), 0);
}

/**
 * The grid template for a row of siblings, weighted by what hangs under each.
 *
 * Equal columns look right until one sibling carries a subtree and another
 * carries nothing: the research department, which nothing reports to, would
 * otherwise take half the chart and squeeze four trading divisions into the
 * other half. Weighting by span gives each branch the room it actually needs.
 *
 * `minmax(0, Nfr)` rather than `Nfr`, or a long word in a narrow card would
 * push its column past its share and drag the stubs off the card centres.
 */
function branchTemplate(kids, childrenOf, seen) {
  return kids
    .map((k) => `minmax(0, ${subtreeSpan(k, childrenOf, seen)}fr)`)
    .join(" ");
}

/**
 * One node and everything under it.
 *
 * `spine` marks the run of single-child nodes from the top, which are drawn as
 * one narrow centred column so the board, the committee and the department
 * line up rather than stretching across the page.
 */
function OrgNode({ node, childrenOf, spine, seen, people, membersOf, level, edit, breakout, cell }) {
  // An executive can type any name into `parent`, so a cycle is reachable from
  // the control room. Stop rather than recurse forever.
  if (seen.has(node.name)) return null;
  const nextSeen = new Set(seen).add(node.name);

  const kids = (childrenOf.get(node.name) || []).filter((k) => !nextSeen.has(k.name));
  const governing = !node.code;

  // The people chart puts bullet lists inside the governing blocks, so they
  // need the full card and a wider column than the overview's compact one.
  const spineWidth = people ? 560 : 420;
  const stem = people ? 26 : governing ? 16 : 26;

  const pass = { childrenOf, people, membersOf, level, edit };

  const spans = kids.map((k) => subtreeSpan(k, childrenOf, nextSeen));

  /**
   * One department carrying a subtree, with leaves beside it.
   *
   * That shape used to force a choice between two bad layouts. Equal columns
   * squeezed four trading divisions into half the page; columns weighted by
   * what hangs under each left the two department cards obviously mismatched —
   * one a wide short bar, the other a narrow tall block, which is not how two
   * blocks at the same level of a chart should read.
   *
   * So: every card gets the same column, and the one subtree runs the full
   * width underneath. That is sound rather than a trick — a leaf column has
   * nothing below it for the row to collide with. It is also the ordinary way
   * a chart draws a unit that reports straight up and has nobody under it.
   *
   * With more than one child carrying a subtree there is nowhere to break out
   * to, so those fall back to weighted columns.
   */
  const aside = kids.length > 1 && spans.filter((s) => s > 1).length <= 1;
  const template = aside ? undefined : branchTemplate(kids, childrenOf, nextSeen);

  // Set by the parent when this node is the one allowed to run wide. The gap is
  // added back per column crossed, and the offset walks left to the row's edge
  // so a heavy child that is not the first still starts in the right place.
  const wide =
    breakout && breakout.cols > 1
      ? { "--ucc-span": breakout.cols, "--ucc-offset": breakout.index }
      : undefined;

  /**
   * When this node is one column of a branch row it does not render as a single
   * box. The card goes in the row's first track and the subtree in its second,
   * so **every subtree starts below every card** — otherwise a short block's
   * children run straight through the taller block beside it, which is what a
   * research department with four people in it did to the divisions row.
   *
   * `display: contents` on the wrapper is what lets both halves be grid items
   * of the row rather than of a box inside it. It is desktop-only, so on a
   * phone the wrapper is an ordinary block and the row simply stacks.
   */
  const cellVars = cell ? { "--ucc-col": cell.index + 1 } : undefined;

  const subtree =
    kids.length === 0 ? null : (
      <div className={cell ? "ucc-org-sub-cell" : undefined} style={cellVars}>
        <OrgStem height={stem} />
        {kids.length === 1 ? (
          <OrgNode node={kids[0]} spine={spine} seen={nextSeen} {...pass} />
        ) : (
          // The stem above stays in this node's own column so it drops from the
          // middle of the card; only the strip and the row break out.
          <div className={wide ? "ucc-org-wide" : undefined} style={wide}>
            <OrgBranch n={kids.length} template={template} />
            <div
              className="ucc-org-row"
              style={{ "--ucc-cols": kids.length, "--ucc-template": template }}
            >
              {kids.map((k, i) => (
                <OrgNode
                  key={k.name}
                  node={k}
                  spine={false}
                  seen={nextSeen}
                  cell={{ index: i }}
                  breakout={
                    aside && spans[i] > 1 ? { cols: kids.length, index: i } : null
                  }
                  {...pass}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );

  return (
    <div className={cell ? "ucc-org-node" : undefined}>
      <div
        className={cell ? "ucc-org-card-cell" : undefined}
        style={
          spine
            ? { maxWidth: spineWidth, margin: "0 auto" }
            : cellVars
        }
      >
        {people ? (
          <OrgPeopleCard
            d={node}
            governing={governing}
            level={level}
            edit={edit}
            hasChildren={kids.length > 0}
            members={membersOf.get(node.name) || []}
          />
        ) : (
          <OrgCard d={node} governing={governing} />
        )}
      </div>

      {subtree}
    </div>
  );
}

/** Everything a `dept` field can name, normalised for comparison. */
function deptsOf(person) {
  return String(person?.dept || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Staff grouped by the block they sit in, plus anyone whose department matches
 * no block. The leftovers matter: a typo in `dept` would otherwise drop a
 * person off the page entirely, so the People tab lists them separately rather
 * than losing them.
 */
function groupStaffByNode(divisions, staff) {
  const byName = new Map();
  for (const d of divisions || []) {
    if (d?.name) byName.set(d.name.toLowerCase(), d.name);
  }

  const membersOf = new Map();
  const unplaced = [];

  for (const person of staff || []) {
    const names = deptsOf(person).map((k) => byName.get(k)).filter(Boolean);
    if (!names.length) {
      unplaced.push(person);
      continue;
    }
    for (const name of names) {
      if (!membersOf.has(name)) membersOf.set(name, []);
      membersOf.get(name).push(person);
    }
  }

  return { membersOf, unplaced };
}

/**
 * The edits the chart can make to the record, given `save`.
 *
 * Renaming is the awkward one: a block's name is what its children point at
 * through `parent`, and what staff point at through `dept`. Renaming without
 * carrying those across would orphan the branch below it and empty the block
 * of people, so all three move together.
 */
function chartEditor(data, save) {
  const clone = () => deepClone(data);

  const uniqueName = (list, base) => {
    let name = base;
    let n = 2;
    while (list.some((d) => d.name === name)) name = `${base} ${n++}`;
    return name;
  };

  const remapDept = (dept, from, to) =>
    String(dept || "")
      .split(",")
      .map((s) => (s.trim().toLowerCase() === from.toLowerCase() ? to : s.trim()))
      .filter(Boolean)
      .join(", ");

  return {
    setDivision(name, patch) {
      const next = clone();
      const i = (next.divisions || []).findIndex((d) => d.name === name);
      if (i < 0) return;
      next.divisions[i] = { ...next.divisions[i], ...patch };
      save(next);
    },

    renameDivision(from, to) {
      const clean = String(to).trim();
      const next = clone();
      const list = next.divisions || [];
      if (!clean || clean === from) return;
      // Two blocks with one name would make `parent` ambiguous.
      if (list.some((d) => d.name === clean)) return;

      next.divisions = list.map((d) => ({
        ...d,
        name: d.name === from ? clean : d.name,
        parent: d.parent === from ? clean : d.parent,
      }));
      next.staff = (next.staff || []).map((s) => ({
        ...s,
        dept: remapDept(s.dept, from, clean),
      }));
      save(next);
    },

    addDivision(parentName) {
      const next = clone();
      const list = next.divisions || [];
      next.divisions = [
        ...list,
        {
          name: uniqueName(list, "New division"),
          code: "",
          parent: parentName,
          lead: "",
          blurb: "",
        },
      ];
      save(next);
    },

    removeDivision(name) {
      const next = clone();
      next.divisions = (next.divisions || []).filter((d) => d.name !== name);
      save(next);
    },

    addPerson(deptName) {
      const next = clone();
      next.staff = [
        ...(next.staff || []),
        { name: "", role: "New role", dept: deptName, joined: "", note: "", internal: "" },
      ];
      save(next);
    },

    // A block's members are the very objects from `data.staff`, so identity
    // finds the right row even when two people share a name. The index has to
    // be taken from the original — cloning first would leave nothing to match.
    setPerson(person, patch) {
      const at = (data.staff || []).indexOf(person);
      if (at < 0) return;
      const next = clone();
      next.staff[at] = { ...next.staff[at], ...patch };
      save(next);
    },

    removePerson(person) {
      const at = (data.staff || []).indexOf(person);
      if (at < 0) return;
      const next = clone();
      next.staff.splice(at, 1);
      save(next);
    },
  };
}

function OrgChart({ divisions, people, membersOf, level, edit }) {
  const { roots, childrenOf } = useMemo(() => {
    const list = (divisions || []).filter((d) => d?.name);
    const names = new Set(list.map((d) => d.name));
    const map = new Map();
    for (const d of list) {
      // A parent that no longer exists would otherwise take its children off
      // the page entirely, so treat those entries as tops of their own tree.
      const key = d.parent && names.has(d.parent) && d.parent !== d.name ? d.parent : null;
      if (key === null) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    const tops = list.filter(
      (d) => !d.parent || !names.has(d.parent) || d.parent === d.name
    );
    return { roots: tops, childrenOf: map };
  }, [divisions]);

  if (!roots.length) {
    return (
      <Panel tone="deep" style={{ padding: 20 }}>
        <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
          No divisions on the record yet.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-8">
      {roots.map((r) => (
        <OrgNode
          key={r.name}
          node={r}
          childrenOf={childrenOf}
          spine
          seen={new Set()}
          people={people}
          membersOf={membersOf || new Map()}
          level={level}
          edit={edit}
        />
      ))}
    </div>
  );
}

const BLANK_APPLICATION = {
  username: "",
  discord: "",
  role: "",
  wage: "",
  experience: "",
  references: "",
  notes: "",
};

/**
 * The hiring form on the front page. Deliberately one column: it is a form
 * somebody fills top to bottom, and pairing the fields would only make the
 * short ones look like they belong together.
 */
function ApplicationForm({ data, session, onSubmit, onSignIn }) {
  const [form, setForm] = useState({
    ...BLANK_APPLICATION,
    username: session?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // The server publishes its jobs under these headings, so the dropdown keeps
  // them rather than flattening everything into one long list.
  const groups = useMemo(() => {
    const order = ["Trade", "Profession", "Government", "Licence", "Legal licence"];
    const byCategory = new Map();
    for (const j of data.jobs || []) {
      if (!j?.name) continue;
      const key = j.category || "Other";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(j.name);
    }
    return [...byCategory.entries()]
      .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      })
      .map(([label, items]) => ({ label, items }));
  }, [data.jobs]);

  if (!session?.username) {
    return (
      <Panel tone="deep" style={{ padding: 24 }}>
        <p
          className="mb-4"
          style={{ fontFamily: F.body, fontSize: 14.5, color: C.inkSoft, lineHeight: 1.6 }}
        >
          Applications go through an account, so we know who we are talking to
          and you can check back on yours. Making one takes a moment and gives
          you nothing you did not already have as a visitor.
        </p>
        <Btn variant="solid" onClick={onSignIn}>
          Sign in or create an account
        </Btn>
      </Panel>
    );
  }

  if (sent) {
    return (
      <Panel tone="deep" style={{ padding: 24 }}>
        <h3 style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>
          Application filed.
        </h3>
        <p
          className="mt-2"
          style={{ fontFamily: F.body, fontSize: 14.5, color: C.inkSoft, lineHeight: 1.6 }}
        >
          It is on the hiring board. An executive will pick it up — expect to be
          contacted on the handle you gave.
        </p>
        <div className="mt-4">
          <Btn
            onClick={() => {
              setForm({ ...BLANK_APPLICATION, username: session.username });
              setSent(false);
            }}
          >
            File another
          </Btn>
        </div>
      </Panel>
    );
  }

  const ready = form.username.trim() && form.role.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
      setSent(true);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const upd = (k) => (v) => setForm({ ...form, [k]: v });

  return (
    <Panel style={{ padding: 24 }}>
      <div style={{ maxWidth: 620 }}>
        <Field label="In-game name" value={form.username} onChange={upd("username")} placeholder="Steve" />
        <Field label="Discord handle" value={form.discord} onChange={upd("discord")} placeholder="@steve" />
        <Field
          label="Desired role"
          value={form.role}
          onChange={upd("role")}
          groups={groups}
          hint="The server's job list. Pick the closest one — we will talk about the detail."
        />
        <Field
          label="Desired wage or payment per item"
          value={form.wage}
          onChange={upd("wage")}
          placeholder="$800 / shift, or $12 per stack of iron"
        />
        <Field
          label="Previous experience"
          rows={4}
          value={form.experience}
          onChange={upd("experience")}
          placeholder="Companies you have worked for, what you did, how long."
        />
        <Field
          label="References"
          rows={3}
          value={form.references}
          onChange={upd("references")}
          placeholder="Anyone on the server who will vouch for you."
        />
        <Field
          label="Anything else"
          rows={3}
          value={form.notes}
          onChange={upd("notes")}
          placeholder="Hours you are usually on, what you are hoping for, questions."
        />

        {error && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {error}
          </p>
        )}

        <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
          {busy ? "Filing…" : "Send the application"}
        </Btn>
      </div>
    </Panel>
  );
}

function Overview({ data, level, session, onSubmitApplication, onSignIn }) {
  const visible = data.announcements.filter(
    (a) => LEVEL[a.audience] <= level
  );
  return (
    <div className="space-y-12">
      <section>
        <SectionHead index="I" title="What we are for" />
        <div className="grid md:grid-cols-3 gap-8 md:gap-10">
          <div className="md:col-span-2">
            <p
              style={{
                fontFamily: F.display,
                fontSize: "clamp(20px, 2.4vw, 26px)",
                lineHeight: 1.45,
                letterSpacing: "-0.01em",
                color: C.ink,
              }}
            >
              {data.company.mission}
            </p>
          </div>
          <Panel style={{ padding: 22, alignSelf: "start" }} tone="deep">
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
          title="Work with us"
          note="We hire for the trades we run and the licences we need. Tell us what you do and what you expect to be paid for it — a straight answer on money saves everyone a week."
        />
        <ApplicationForm
          data={data}
          session={session}
          onSubmit={onSubmitApplication}
          onSignIn={onSignIn}
        />
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

      <section>
        <SectionHead
          index="IV"
          title="How the company is put together"
          note="The board sits above the executive, the executive above the trades, and every division keeps its own books."
        />
        <OrgChart divisions={data.divisions} />
      </section>
    </div>
  );
}

/**
 * Records a new last-traded price.
 *
 * Shared by the control room and the chief executive's control on the share
 * page, because two copies of this would drift the way the caps did — and the
 * order matters: yesterday's price has to become `prevClose` before the new one
 * overwrites it, or the change figure on every stat card reads zero.
 */
function recordPrice(data, label, price) {
  const next = deepClone(data);
  const p = Number(price);
  next.stock.prevClose = next.stock.price;
  next.stock.price = p;
  next.stock.updated = label;
  next.stock.history = [
    ...next.stock.history,
    { label, price: p },
  ].slice(-STOCK_HISTORY_CAP);
  return next;
}

/** The date label a new price gets unless somebody types their own. */
const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * Moving the price from the share page itself, for the chief executive.
 *
 * The control room can already do this and an executive reaches it there; this
 * is a second way in rather than a new permission, which is why the server does
 * not gate it separately — the save is the same exec-level PUT either way. It
 * sits inside section I so the numerals do not shift for everyone else when it
 * is hidden.
 */
function PriceSetter({ data, save }) {
  const [form, setForm] = useState({ label: todayLabel(), price: "" });
  const [msg, setMsg] = useState("");

  const ready = form.label.trim() && form.price !== "" && Number.isFinite(Number(form.price));

  const record = () => {
    if (!ready) return;
    save(recordPrice(data, form.label.trim(), form.price));
    setMsg(
      `Recorded $${dec(form.price)}, up from $${dec(data.stock.price)}. It is on the chart and the ticker.`
    );
    setForm({ label: todayLabel(), price: "" });
  };

  return (
    <Panel style={{ padding: 20, marginTop: 16 }} tone="deep">
      <Eyebrow color={C.seal}>Chief executive</Eyebrow>
      <p
        className="mt-2 mb-4 max-w-2xl"
        style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
      >
        Post a new last-traded price without going to the control room. The
        current price becomes the previous close, so the change figure above is
        worked out from it.
      </p>
      <div className="grid md:grid-cols-2 gap-x-5">
        <Field
          label="Date label"
          value={form.label}
          onChange={(v) => { setForm({ ...form, label: v }); setMsg(""); }}
          placeholder="15 July"
        />
        <Field
          label="Price"
          type="number"
          value={form.price}
          onChange={(v) => { setForm({ ...form, price: v }); setMsg(""); }}
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Btn variant="ledger" onClick={record} disabled={!ready}>
          Record the price
        </Btn>
        {msg && (
          <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>{msg}</span>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------- the share register --------------------------- *
 *
 * Two pies on the share page: who owns the company, and who votes it. The
 * register itself is chief-executive-only and saves through /api/shareholders;
 * there is no control room page for it. See CLAUDE.md.
 * ------------------------------------------------------------------------ */

/**
 * Slice colours.
 *
 * Built in OKLCH against the paper surface and checked with a validator rather
 * than by eye: each sits inside the lightness band and above the chroma floor,
 * every *pair* holds apart under protanopia, deuteranopia and tritanopia — all
 * pairs, not just neighbours, because any two wedges of a pie can be compared —
 * and all five clear 3:1 against the paper. They are the house accents pushed
 * to where they survive that: oxblood, gold, ledger green, navy, teal.
 *
 * Five, with the rest of the register folded into one neutral wedge. A set that
 * passes those checks does not stretch much further, and a pie with fifteen
 * slices is a colour-matching puzzle rather than a chart. If you add a sixth,
 * re-run the validator; do not pick one by eye.
 */
const SHARE_SLICES = ["#df6862", "#9d7200", "#006b39", "#2a669f", "#009bab"];

/** A name that has to sit inside a wedge. Long ones are cut rather than allowed
 *  to run across the slice next door; the tooltip and the table have it whole. */
function shortName(name) {
  return name.length > 18 ? name.slice(0, 17) + "…" : name;
}

/** Ink for a label sitting on a slice, so the writing survives the fill. */
function sliceInk(hex) {
  const v = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5);
  return lum > 0.42 ? C.ink : "#FFFFFF";
}

/**
 * The register as wedges.
 *
 * `issued` is what 100% means. If the holdings add up to more than it — or if
 * no total has been recorded at all — the pie falls back to the total held, so
 * it still reads as a whole company, and the page says the figure needs
 * attention rather than drawing a chart that quietly lies about percentages.
 */
function capTable(holders, issued) {
  const rows = [...(holders || [])]
    .filter((h) => h && h.shares > 0)
    .sort((a, b) => b.shares - a.shares);

  const held = rows.reduce((sum, h) => sum + h.shares, 0);
  const base = issued >= held && issued > 0 ? issued : held;
  const pct = (n) => (base > 0 ? (n / base) * 100 : 0);

  const slices = rows.slice(0, SHARE_SLICES.length).map((h, i) => ({
    key: h.id || h.name,
    name: h.name,
    shares: h.shares,
    pct: pct(h.shares),
    color: SHARE_SLICES[i],
  }));

  const rest = rows.slice(SHARE_SLICES.length);
  if (rest.length) {
    const restShares = rest.reduce((sum, h) => sum + h.shares, 0);
    slices.push({
      key: "others",
      name: rest.length + " smaller holders",
      shares: restShares,
      pct: pct(restShares),
      color: C.inkSoft,
      folded: true,
    });
  }

  const spare = Math.max(0, issued - held);
  if (spare > 0) {
    slices.push({
      key: "unallocated",
      name: "Not allocated",
      shares: spare,
      pct: pct(spare),
      color: C.paperDeep,
      muted: true,
    });
  }

  return { slices, held, base, holders: rows.length, over: held > issued };
}

/** A wedge's own figures, on hover. The equity chart's only route to a name. */
function SliceTip({ active, payload, named }) {
  if (!active || !payload || !payload.length) return null;
  const s = payload[0].payload;
  if (!s) return null;
  return (
    <div
      style={{
        background: C.paper,
        border: `1px solid ${C.ink}`,
        padding: "8px 10px",
        maxWidth: 240,
      }}
    >
      {named && (
        <div style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink, marginBottom: 2 }}>
          {s.name}
        </div>
      )}
      <div style={{ fontFamily: F.mono, fontSize: 11.5, color: s.muted ? C.inkSoft : C.ink }}>
        {s.pct.toFixed(1)}% of the company
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}>
        {s.shares.toLocaleString("en-US")} shares
      </div>
    </div>
  );
}

/**
 * One register chart.
 *
 * `names` decides whether a wedge carries its holder's name. The voter chart
 * does; the equity chart deliberately does not, and gives the name up only on
 * hover. Both label every wedge they can with its percentage — that is not
 * decoration: the palette clears its colour-blindness checks in the band where
 * a second, non-colour channel is required, and the percentage is it.
 */
function RegisterPie({ table, names }) {
  const { slices } = table;
  const label = (p) => {
    const s = slices[p.index];
    if (!s) return null;
    const r = p.innerRadius + (p.outerRadius - p.innerRadius) * 0.62;

    /**
     * Does the writing actually fit in the wedge?
     *
     * The arc the label sits on is `2πr × the slice's share`, and the label is
     * about 6.4px per character of the longest line. Both halves matter: a
     * percentage floor alone puts "Redmont Holdings" across three wedges while
     * dropping a short name that had room, and a chart squeezed into half a
     * column has less arc for the same percentage than a full-width one.
     * Whatever is dropped here is still on the tooltip, and on the table for the
     * chart that has one.
     */
    const shown = names ? shortName(s.name) : "";
    const needed = Math.max(shown.length * 6.4, 40) + 8;
    const arc = 2 * Math.PI * r * (s.pct / 100);
    if (arc < needed) return null;

    const a = (-p.midAngle * Math.PI) / 180;
    const x = p.cx + r * Math.cos(a);
    const y = p.cy + r * Math.sin(a);
    const ink = s.muted ? C.inkSoft : sliceInk(s.color);
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={ink}>
        {names && (
          <tspan x={x} dy="-0.5em" style={{ fontFamily: F.body, fontSize: 12.5 }}>
            {shown}
          </tspan>
        )}
        <tspan x={x} dy={names ? "1.3em" : 0} style={{ fontFamily: F.mono, fontSize: 11 }}>
          {s.pct.toFixed(1)}%
        </tspan>
      </text>
    );
  };

  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="shares"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="82%"
            label={label}
            labelLine={false}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell
                key={s.key}
                fill={s.color}
                // A 2px surface-coloured edge is the gap between fills; the
                // unallocated wedge is nearly the paper colour, so it takes a
                // hairline rule instead or it would have no edge at all.
                stroke={s.muted ? C.rule : C.paper}
                strokeWidth={s.muted ? 1 : 2}
              />
            ))}
          </Pie>
          <Tooltip content={<SliceTip named />} wrapperStyle={{ outline: "none" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The wedges as a table, which is what a reader who cannot use colour has. */
function RegisterTable({ table }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {table.slices.map((s) => (
          <tr key={s.key} style={{ borderTop: `1px solid ${C.paperLine}` }}>
            <td style={{ padding: "7px 0", width: 22 }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: s.color,
                  border: s.muted ? `1px solid ${C.rule}` : "none",
                }}
              />
            </td>
            <td
              style={{
                padding: "7px 8px 7px 0",
                fontFamily: F.body,
                fontSize: 13.5,
                color: s.muted ? C.inkSoft : C.ink,
              }}
            >
              {s.name}
            </td>
            <td
              style={{
                padding: "7px 0",
                textAlign: "right",
                fontFamily: F.mono,
                fontSize: 12,
                color: C.inkSoft,
                whiteSpace: "nowrap",
              }}
            >
              {s.shares.toLocaleString("en-US")}
            </td>
            <td
              style={{
                padding: "7px 0 7px 14px",
                textAlign: "right",
                fontFamily: F.mono,
                fontSize: 12.5,
                color: s.muted ? C.inkSoft : C.ink,
                whiteSpace: "nowrap",
              }}
            >
              {s.pct.toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The empty state, which a fresh record shows until the register is filled in. */
function RegisterEmpty({ what }) {
  return (
    <Panel tone="deep" style={{ padding: 20, borderStyle: "dashed" }}>
      <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
        No {what} are on the register yet. The chief executive adds them from the
        hammer above.
      </p>
    </Panel>
  );
}

const blankHolder = () => ({ id: "", name: "", shares: 0 });

/**
 * The register editor, behind the hammer.
 *
 * It holds a draft rather than saving as you type. Both charts read the draft
 * while it is open, so a holding changes the pie as it is typed — which is the
 * point of editing it here rather than on a form somewhere else — and the whole
 * register goes to the server once, on Save. The control room's keystroke saves
 * would be a PUT per character for a chart nobody is reading yet.
 */
function RegisterEditor({ draft, setDraft, onSave, onCancel, busy, msg }) {
  const [armed, setArmed] = useState(null);

  const setRow = (cls, i, patch) =>
    setDraft({
      ...draft,
      [cls]: draft[cls].map((h, j) => (j === i ? { ...h, ...patch } : h)),
    });

  const addRow = (cls) => setDraft({ ...draft, [cls]: [...draft[cls], blankHolder()] });

  // Armed by identity rather than by index: the lists re-sort by size on the
  // chart, and an armed row addressed by position could end up removing
  // somebody else.
  const removeRow = (cls, i) =>
    setDraft({ ...draft, [cls]: draft[cls].filter((_, j) => j !== i) });

  const column = (cls, title, issuedKey, issuedLabel, issuedHint) => (
    <div>
      <Eyebrow color={C.gold}>{title}</Eyebrow>
      <div className="mt-3 mb-4">
        <Field
          label={issuedLabel}
          type="number"
          value={draft[issuedKey]}
          onChange={(v) => setDraft({ ...draft, [issuedKey]: v })}
          hint={issuedHint}
        />
      </div>
      {draft[cls].map((h, i) => {
        const id = cls + ":" + i;
        return (
          // Wraps rather than squeezing: on a 320px phone the name, the count
          // and the remove control do not fit on one line.
          <div key={id} className="flex items-center gap-2 mb-2 flex-wrap">
            <input
              value={h.name}
              placeholder="Holder"
              aria-label="Holder name"
              onChange={(e) => setRow(cls, i, { name: e.target.value })}
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                fontFamily: F.body,
                fontSize: 14,
                color: C.ink,
                background: "rgba(255,255,255,0.7)",
                border: `1px solid ${C.rule}`,
                padding: "8px 10px",
                outline: "none",
              }}
            />
            <input
              type="number"
              value={h.shares}
              aria-label="Shares held"
              onChange={(e) => setRow(cls, i, { shares: Number(e.target.value) })}
              style={{
                flex: "0 1 120px",
                minWidth: 90,
                fontFamily: F.mono,
                fontSize: 14,
                color: C.ink,
                background: "rgba(255,255,255,0.7)",
                border: `1px solid ${C.rule}`,
                padding: "8px 10px",
                outline: "none",
              }}
            />
            {armed === id ? (
              <span className="flex items-center gap-1 shrink-0">
                <Btn
                  variant="seal"
                  style={{ padding: "8px 10px" }}
                  onClick={() => {
                    removeRow(cls, i);
                    setArmed(null);
                  }}
                >
                  Yes
                </Btn>
                <Btn variant="ghost" style={{ padding: "8px 10px" }} onClick={() => setArmed(null)}>
                  Keep
                </Btn>
              </span>
            ) : (
              <Btn
                variant="ghost"
                style={{ padding: "8px 12px" }}
                onClick={() => setArmed(id)}
                title="Remove this holder"
              >
                ✕
              </Btn>
            )}
          </div>
        );
      })}
      <div className="mt-3">
        <Btn variant="ghost" onClick={() => addRow(cls)}>
          Add a holder
        </Btn>
      </div>
    </div>
  );

  return (
    <Panel style={{ padding: 20, marginTop: 16 }} tone="deep">
      <Eyebrow color={C.seal}>Chief executive</Eyebrow>
      <p
        className="mt-2 mb-5 max-w-3xl"
        style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
      >
        Both charts follow this as you type. Nothing is on the record until you
        save it, and closing the hammer without saving leaves the register as it
        was.
      </p>

      <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
        {column(
          "equity",
          "Equity shareholders",
          "shares",
          "Total shares issued",
          "The same figure the market capital is worked out from, so changing it moves that too."
        )}
        {column(
          "voters",
          "Voter shareholders",
          "voterShares",
          "Total voting shares issued",
          "Votes are counted on their own, and need not match the shares issued."
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap mt-6">
        <Btn variant="ledger" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save the register"}
        </Btn>
        <Btn variant="ghost" onClick={onCancel} disabled={busy}>
          Discard
        </Btn>
        {msg && (
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 11.5,
              color: msg.bad ? C.seal : C.ledger,
            }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </Panel>
  );
}

/** The line under a chart: how much of it is spoken for, and any warning. */
function RegisterNote({ table, issued, unit, extra }) {
  const bad = table.over;
  return (
    <p
      className="mt-3"
      style={{ fontFamily: F.mono, fontSize: 11, color: bad ? C.seal : C.inkSoft, lineHeight: 1.6 }}
    >
      {bad
        ? issued > 0
          ? `The register holds ${table.held.toLocaleString("en-US")} ${unit} against ${issued.toLocaleString(
              "en-US"
            )} issued. Percentages are of what is held until that is corrected.`
          : `No ${unit} issued has been recorded, so percentages are of the ${table.held.toLocaleString(
              "en-US"
            )} on the register.`
        : `${table.holders} holder${table.holders === 1 ? "" : "s"} · ${table.held.toLocaleString(
            "en-US"
          )} of ${issued.toLocaleString("en-US")} ${unit} allocated`}
      {extra ? " · " + extra : ""}
    </p>
  );
}

function ShareSection({ data, level, save, saveRegister }) {
  const s = data.stock;
  const cap = s.price * s.shares;
  const equity = data.financials.equity || 0;
  const bookPerShare = equity / (s.shares || 1);
  const first = s.history.length ? s.history[0].price : s.price;
  const growth = first ? ((s.price - first) / first) * 100 : 0;

  /* ---------------------------- the register ---------------------------- */

  // The draft is the lock: it exists only while the hammer is open, which keeps
  // "is it unlocked" and "what is being edited" from ever disagreeing.
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const register = readRegister(data);

  // Chief executive only, and unlike the chart hammer and the price control
  // this one is the real gate: /api/shareholders checks for `ceo`, and there is
  // no control room page that could write the register instead.
  const mayEdit = level >= LEVEL.ceo && !!saveRegister;
  const editing = mayEdit && !!draft;

  // While the hammer is open both charts read the draft, so a holding moves the
  // pie as it is typed rather than after a save.
  const view = editing
    ? draft
    : { ...register, shares: s.shares || 0 };

  const equityTable = capTable(view.equity, view.shares);
  const voterTable = capTable(view.voters, view.voterShares);

  const openEditor = () => {
    setDraft({
      shares: s.shares || 0,
      voterShares: register.voterShares,
      equity: register.equity.map((h) => ({ ...h })),
      voters: register.voters.map((h) => ({ ...h })),
    });
    setMsg(null);
  };

  const closeEditor = () => {
    setDraft(null);
    setMsg(null);
  };

  const commit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveRegister({
        shares: draft.shares,
        voterShares: draft.voterShares,
        equity: draft.equity,
        voters: draft.voters,
      });
      setMsg({ text: "Saved to the register." });
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

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
        {level >= LEVEL.ceo && save && <PriceSetter data={data} save={save} />}
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

      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SectionHead
              index="III"
              title="Equity shareholders"
              note={
                editing
                  ? "Unlocked. Both charts follow what you type; nothing is on the record until you save."
                  : "Who owns the company, by paid-up shares. The names are not printed on the chart — hover a slice for the holder and the share of the company it is."
              }
            />
          </div>
          {mayEdit && (
            <div className="shrink-0 pt-1">
              <Btn
                variant={editing ? "gold" : "ghost"}
                onClick={editing ? closeEditor : openEditor}
                title={editing ? "Lock the register" : "Unlock the register for editing"}
              >
                <span aria-hidden="true" style={{ fontSize: 14 }}>
                  🔨
                </span>
                <span className="sr-only">
                  {editing ? "Lock the share register" : "Unlock the share register"}
                </span>
              </Btn>
            </div>
          )}
        </div>

        {editing && (
          <RegisterEditor
            draft={draft}
            setDraft={setDraft}
            onSave={commit}
            onCancel={closeEditor}
            busy={busy}
            msg={msg}
          />
        )}

        <div className="mt-4">
          {/* Judged on holders, not slices: with nobody on the register the
              only wedge would be the unallocated one, which is a grey disc
              rather than a chart. */}
          {equityTable.holders ? (
            <Panel style={{ padding: 18 }}>
              {/* Held to a width rather than stretched across the panel: with
                  no table beside it the chart would otherwise sit alone in the
                  middle of a very wide sheet of paper. */}
              <div className="mx-auto" style={{ maxWidth: 560 }}>
                <RegisterPie table={equityTable} />
              </div>
              {/* No table of names under this one: the chart is meant to give
                  the holder up on hover and nowhere else. The percentages on
                  the wedges are the second, non-colour channel the palette
                  needs, and they carry no name. */}
              <RegisterNote
                table={equityTable}
                issued={view.shares}
                unit="shares"
                extra="hover a slice for the holder"
              />
            </Panel>
          ) : (
            <RegisterEmpty what="equity shareholders" />
          )}
        </div>
      </section>

      <section>
        <SectionHead
          index="IV"
          title="Voter shareholders"
          note="Who votes the company. Voting shares are counted on their own and need not match the shares issued."
        />
        {voterTable.holders ? (
          <Panel style={{ padding: 18 }}>
            <div className="grid lg:grid-cols-2 gap-6 items-center">
              <RegisterPie table={voterTable} names />
              <RegisterTable table={voterTable} />
            </div>
            <RegisterNote table={voterTable} issued={view.voterShares} unit="votes" />
          </Panel>
        ) : (
          <RegisterEmpty what="voter shareholders" />
        )}
      </section>

      {level >= LEVEL.client ? (
        <section>
          <SectionHead
            index="V"
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
        Sign in to see {what}. Open to {who}. Create an account from the sign-in button, then ask an executive in the company Discord to raise your access.
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
  const b = f.balance || {};
  const assets = f.assets || 0;
  const equity = f.equity || 0;

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

      {level >= LEVEL.staff && f.balance ? (
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

function People({ data, level, save }) {
  const [unlocked, setUnlocked] = useState(false);

  const { membersOf, unplaced } = useMemo(
    () => groupStaffByNode(data.divisions, data.staff),
    [data.divisions, data.staff]
  );

  // The chart is only editable in place by the chief executive. Everyone else,
  // executives included, edits the record in the control room.
  const mayEdit = level >= LEVEL.ceo;
  const editing = mayEdit && unlocked;
  const edit = useMemo(
    () => (editing && save ? chartEditor(data, save) : null),
    [editing, save, data]
  );

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SectionHead
              index="I"
              title="Who sits where"
              note={
                editing
                  ? "Unlocked. Click any name, title or description to change it; changes save when you click away."
                  : level >= LEVEL.staff
                  ? "The same structure as the overview, with the people in it. Internal notes are visible to you — keep them internal."
                  : "The same structure as the overview, with the people in it."
              }
            />
          </div>
          {mayEdit && (
            <div className="shrink-0 pt-1">
              <Btn
                variant={editing ? "gold" : "ghost"}
                onClick={() => setUnlocked((v) => !v)}
                title={editing ? "Lock the chart" : "Unlock the chart for editing"}
              >
                <span aria-hidden="true" style={{ fontSize: 14 }}>
                  🔨
                </span>
                <span className="sr-only">
                  {editing ? "Lock the chart" : "Unlock the chart"}
                </span>
              </Btn>
            </div>
          )}
        </div>
        <OrgChart
          divisions={data.divisions}
          people
          membersOf={membersOf}
          level={level}
          edit={edit}
        />
      </section>

      {unplaced.length > 0 && (
        <section>
          <SectionHead
            index="II"
            title="Elsewhere on the books"
            note="On the staff list, but their department does not match a block above. Fix the department in the control room and they will move into the chart."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unplaced.map((s, i) => (
              <Panel key={i} style={{ padding: 18 }}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 style={{ fontFamily: F.display, fontSize: 22, color: C.ink, lineHeight: 1.1 }}>
                    {s.name}
                  </h3>
                  <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}>
                    {s.joined}
                  </span>
                </div>
                <div
                  className="mt-1"
                  style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger, letterSpacing: "0.06em" }}
                >
                  {s.role}
                </div>
                {s.dept && (
                  <div className="mt-1" style={{ fontFamily: F.mono, fontSize: 11, color: C.seal }}>
                    {s.dept}
                  </div>
                )}
                {s.note && (
                  <p
                    className="mt-3"
                    style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
                  >
                    {s.note}
                  </p>
                )}
              </Panel>
            ))}
          </div>
        </section>
      )}
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
          note="This lands on the staff room board, where the people who price and fill it will see it."
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
                Filed. Someone will pick it up from the board.
              </span>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

/**
 * Opens the shift. Times are typed rather than stamped from the clock: people
 * log the shift around the work, not while stood at the keyboard, and a
 * forgotten clock-in still has to be enterable after the fact.
 */
function ClockInModal({ onClose, onSubmit, session, data }) {
  const [form, setForm] = useState({
    username: session?.username || "",
    occupation: "",
    timeIn: "",
    meridiem: "PM",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Roles people actually hold, offered as a starting point rather than a
  // fixed list — the divisions change and the staff table is the record.
  const occupations = useMemo(() => {
    const fromStaff = (data?.staff || []).map((s) => s.role).filter(Boolean);
    const fromDivisions = (data?.divisions || []).map((d) => d.name).filter(Boolean);
    return Array.from(new Set([...fromStaff, ...fromDivisions, "Other"]));
  }, [data]);

  const ready = form.username.trim() && form.occupation.trim() && form.timeIn.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        action: "in",
        ...form,
        timeIn: withMeridiem(form.timeIn, form.meridiem),
      });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <Eyebrow color={C.gold}>Shift log</Eyebrow>
      <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
        Clock in
      </h2>
      <p
        className="mb-5"
        style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
      >
        This opens a shift. Clock out at the end and it becomes one entry in the
        log, not two.
      </p>

      <div className="grid md:grid-cols-2 gap-x-5">
        <Field
          label="In-game name"
          value={form.username}
          onChange={(v) => setForm({ ...form, username: v })}
          placeholder="Steve"
        />
        <Field
          label="Occupation"
          value={form.occupation}
          onChange={(v) => setForm({ ...form, occupation: v })}
          options={["", ...occupations]}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-x-5">
        <Field
          label="Time in"
          value={form.timeIn}
          onChange={(v) => setForm({ ...form, timeIn: v })}
          placeholder="6:00"
        />
        <Field
          label="AM or PM"
          value={form.meridiem}
          onChange={(v) => setForm({ ...form, meridiem: v })}
          options={["AM", "PM", ""]}
          hint="Leave blank if you are writing 24-hour time."
        />
      </div>

      {error && (
        <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
          {busy ? "Clocking in…" : "Clock in"}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

/**
 * Closes the open shift. What was gathered or done is asked for here rather
 * than on the way in, because nobody knows it yet when they start.
 */
function ClockOutModal({ onClose, onSubmit, open }) {
  const [form, setForm] = useState({ timeOut: "", output: "", meridiem: "PM" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = form.timeOut.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        action: "out",
        ...form,
        timeOut: withMeridiem(form.timeOut, form.meridiem),
      });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <Eyebrow color={C.gold}>Shift log</Eyebrow>
      <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
        Clock out
      </h2>

      {open ? (
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
        >
          Closing the shift you opened as{" "}
          <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>
            {open.occupation}
          </span>{" "}
          at{" "}
          <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>
            {open.timeIn}
          </span>
          {open.ts ? ` on ${open.ts}` : ""}.
        </p>
      ) : (
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.seal, lineHeight: 1.55 }}
        >
          You are not clocked in, so there is nothing to close. Clock in first.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-x-5">
        <Field
          label="Time out"
          value={form.timeOut}
          onChange={(v) => setForm({ ...form, timeOut: v })}
          placeholder="9:30"
        />
        <Field
          label="AM or PM"
          value={form.meridiem}
          onChange={(v) => setForm({ ...form, meridiem: v })}
          options={["AM", "PM", ""]}
          hint="Leave blank if you are writing 24-hour time."
        />
      </div>
      <Field
        label="Resources gathered / services rendered"
        rows={4}
        value={form.output}
        onChange={(v) => setForm({ ...form, output: v })}
        placeholder="3 stacks of iron to the hub, restocked the Willow storefront."
      />

      {error && (
        <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Btn variant="solid" onClick={submit} disabled={!ready || busy || !open}>
          {busy ? "Clocking out…" : "Clock out"}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

/**
 * A deal done off the chest shops — legal work, a materials contract, anything
 * the shop logs will never show. Amount and material count are separate fields
 * because plenty of jobs here are paid partly in each.
 */
function TransactionModal({ onClose, onSubmit, session, data }) {
  const [form, setForm] = useState({
    username: session?.username || "",
    type: "",
    counterparty: "",
    amount: "",
    materials: "",
    detail: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The rate card is the obvious starting point, but plenty of work is not on
  // it, so the list stays open-ended.
  const types = useMemo(() => {
    const fromServices = (data?.services || []).map((s) => s.name).filter(Boolean);
    return Array.from(
      new Set([...fromServices, "Legal work", "Materials contract", "Other"])
    );
  }, [data]);

  const ready = form.type.trim() && (form.amount.trim() || form.materials.trim());

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <Eyebrow color={C.gold}>Transaction log</Eyebrow>
      <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
        Log a transaction
      </h2>
      <p
        className="mb-5"
        style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
      >
        Anything settled outside the chest shops. Fill in the money, the
        materials, or both — whichever the deal actually was.
      </p>

      <div className="grid md:grid-cols-2 gap-x-5">
        <Field
          label="What type of service rendered"
          value={form.type}
          onChange={(v) => setForm({ ...form, type: v })}
          options={["", ...types]}
        />
        <Field
          label="Who it was with"
          value={form.counterparty}
          onChange={(v) => setForm({ ...form, counterparty: v })}
          placeholder="Steve, or Willow Holdings"
        />
        <Field
          label="Amount"
          value={form.amount}
          onChange={(v) => setForm({ ...form, amount: v })}
          placeholder="$12,000"
        />
        <Field
          label="Material count"
          value={form.materials}
          onChange={(v) => setForm({ ...form, materials: v })}
          placeholder="3 stacks of iron"
        />
      </div>
      <Field
        label="Logged by"
        value={form.username}
        onChange={(v) => setForm({ ...form, username: v })}
        placeholder="Steve"
      />
      <Field
        label="Anything else"
        rows={3}
        value={form.detail}
        onChange={(v) => setForm({ ...form, detail: v })}
        placeholder="Terms, dates, what is still owed."
      />

      {error && (
        <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
          {busy ? "Logging…" : "Log the transaction"}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

/**
 * The account list, and the one thing both application views do with it.
 *
 * Accounts never travel with the company record, so anywhere that wants to
 * show or change somebody's access has to ask for them separately. Shared so
 * the hiring board and the control room behave identically rather than each
 * growing their own copy.
 */
function useAccounts(enabled) {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api("/api/users")
      .then((r) => live && setUsers(r.users))
      .catch(() => live && setUsers([]));
    return () => {
      live = false;
    };
  }, [enabled]);

  const setRole = useCallback(async (username, role) => {
    setBusy(username);
    setMsg("");
    try {
      const r = await api("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ username, role }),
      });
      setUsers(r.users);
      setMsg(`${username} is now ${ROLE_NAME[role] || role}.`);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }, []);

  return { users, msg, busy, setRole };
}

/**
 * The account an application was filed from, and its access.
 *
 * This is the account, not the in-game name typed on the form — the two need
 * not match, and it is the account that hiring somebody actually changes. It
 * sits on the application so that promoting a new hire does not mean going to
 * the control room and matching names by memory.
 */
function ApplicantAccount({ account, users, me, busy, onPick }) {
  const line = { fontFamily: F.body, fontSize: 13, color: C.inkSoft };

  return (
    <div className="mt-4 pt-3" style={{ borderTop: `1px dashed ${C.rule}` }}>
      <Eyebrow>Account</Eyebrow>

      {!account ? (
        <p className="mt-1" style={line}>
          Not recorded — this one predates applications keeping the account.
        </p>
      ) : (
        <>
          <div className="mt-1 mb-2 flex flex-wrap items-center gap-2">
            <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>
              {account}
            </span>
            {account === me && (
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: C.gold,
                }}
              >
                you
              </span>
            )}
            {busy === account && (
              <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.ledger }}>
                saving…
              </span>
            )}
          </div>

          {users === null ? (
            <p style={line}>Looking up their access…</p>
          ) : (
            (() => {
              const user = users.find((u) => u.username === account);
              if (!user) {
                return (
                  <p style={{ ...line, color: C.seal }}>
                    That account no longer exists, so there is nothing to change.
                  </p>
                );
              }
              return (
                <RolePicker
                  role={user.role}
                  onPick={(role) => onPick(account, role)}
                  locked={account === me}
                  lockedReason="You cannot change your own access level"
                  busy={busy === account}
                />
              );
            })()
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------- the legal department ------------------------- */

/** Where a filing has got to. Green agreed, gold under review, oxblood pulled. */
const LEGAL_STATUS_TONE = {
  Drafting: C.inkSoft,
  Filed: C.ink,
  "In review": C.gold,
  Agreed: C.ledger,
  Closed: C.inkSoft,
  Withdrawn: C.seal,
};

/**
 * Opens a filing of one particular kind.
 *
 * The kind is not a field on this form: each kind has its own section and its
 * own button, so which one you pressed is the answer. Picking it twice would
 * only let the two disagree.
 */
function LegalFilingModal({ kind, from, onClose, onSubmit, session }) {
  // `from` is a template the filing was started from: its wording lands in the
  // detail, and it is a starting point rather than a link — editing the filing
  // afterwards does not touch the template, and vice versa.
  const [form, setForm] = useState({
    title: from?.name || "",
    party: "",
    reference: "",
    status: LEGAL_STATUS_DEFAULT,
    detail: from?.body || "",
    author: session?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = form.title.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "file", kind, ...form });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const upd = (k) => (v) => setForm({ ...form, [k]: v });

  return (
    <Modal onClose={onClose} wide>
      <div className="p-7">
        <Eyebrow color={C.gold}>Legal department</Eyebrow>
        <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
          New {kind.toLowerCase()}
        </h2>
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
        >
          {LEGAL_KIND_BLURBS[kind] || "Filed to the legal department's record."}{" "}
          The department can comment on it once it is filed.
        </p>

        {from && (
          <p
            className="mb-5"
            style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}
          >
            Started from the “{from.name}” template. Edit it freely — the
            template itself is not changed.
          </p>
        )}

        <Field
          label="Title"
          value={form.title}
          onChange={upd("title")}
          placeholder="Supply agreement — Willow Holdings"
        />
        <div className="grid md:grid-cols-2 gap-x-5">
          <Field
            label="Other party"
            value={form.party}
            onChange={upd("party")}
            placeholder="Steve, or Willow Holdings"
          />
          <Field
            label="Reference"
            value={form.reference}
            onChange={upd("reference")}
            placeholder="Case or contract number"
          />
          <Field
            label="Status"
            value={form.status}
            onChange={upd("status")}
            options={LEGAL_STATUSES}
          />
          <Field label="Filed by" value={form.author} onChange={upd("author")} placeholder="Steve" />
        </div>
        <Field
          label="Detail"
          rows={6}
          value={form.detail}
          onChange={upd("detail")}
          placeholder="The terms, the question, or what is being argued. Whatever the next person to pick this up needs."
        />

        {error && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
            {busy ? "Filing…" : "File it"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Writes a piece of boilerplate for the department to draft from later. */
function LegalTemplateModal({ onClose, onSubmit, session }) {
  const [form, setForm] = useState({
    name: "",
    kind: LEGAL_KINDS[0],
    body: "",
    notes: "",
    author: session?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = form.name.trim() && form.body.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "template", ...form });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const upd = (k) => (v) => setForm({ ...form, [k]: v });

  return (
    <Modal onClose={onClose} wide>
      <div className="p-7">
        <Eyebrow color={C.gold}>Legal department</Eyebrow>
        <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
          New template
        </h2>
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
        >
          Wording the department reuses. Anyone here can start a filing from it,
          which copies the text across for editing rather than linking to it.
        </p>

        <div className="grid md:grid-cols-2 gap-x-5">
          <Field
            label="Name"
            value={form.name}
            onChange={upd("name")}
            placeholder="Standard bulk supply agreement"
          />
          <Field
            label="For which kind of document"
            value={form.kind}
            onChange={upd("kind")}
            options={LEGAL_KINDS}
          />
        </div>
        <Field
          label="The wording"
          rows={10}
          value={form.body}
          onChange={upd("body")}
          placeholder={"1. The supplier agrees to deliver…\n\nLeave blanks where the detail changes, e.g. [PARTY], [QUANTITY], [DATE]."}
        />
        <Field
          label="When to use it"
          rows={2}
          value={form.notes}
          onChange={upd("notes")}
          placeholder="Which situations this fits, and what to check before sending it."
        />

        {error && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
            {busy ? "Saving…" : "Save the template"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** One piece of boilerplate, with the button that starts a filing from it. */
function LegalTemplate({ template, onUse }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "3px 7px",
            border: `1px solid ${C.gold}`,
            color: C.gold,
          }}
        >
          {template.kind}
        </span>
        {template.author && (
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
            written by {template.author}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Btn onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Read"}</Btn>
          <Btn variant="ledger" onClick={() => onUse(template)}>
            Use
          </Btn>
        </span>
      </div>

      <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink, lineHeight: 1.15 }}>
        {template.name}
      </h3>
      {template.notes && (
        <p
          className="mt-1"
          style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
        >
          {template.notes}
        </p>
      )}

      {/* Collapsed by default: a template is a wall of text, and a page of them
          open at once would bury the names you are scanning for. */}
      {open && (
        <pre
          className="mt-3"
          style={{
            fontFamily: F.mono,
            fontSize: 12.5,
            lineHeight: 1.65,
            color: C.ink,
            background: C.paperDeep,
            border: `1px solid ${C.rule}`,
            padding: 14,
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {template.body}
        </pre>
      )}
    </Panel>
  );
}

/**
 * A department talking about one of its own documents.
 *
 * The thread lives on the document rather than in Discord so that the argument
 * and the thing it is about stay in one place — six months later nobody can
 * find the channel message that explained why a clause reads the way it does.
 *
 * Shared by the legal and research departments: both post
 * `{action:"comment", id}` to their own route, and a comment is a comment.
 */
function EntryComments({ entry, session, onSubmit }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const comments = Array.isArray(entry.comments) ? entry.comments : [];

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "comment", id: entry.id, body: draft });
      setDraft("");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="mt-4 pt-3" style={{ borderTop: `1px dashed ${C.rule}` }}>
      <Eyebrow>
        {comments.length === 0
          ? "No comments"
          : comments.length === 1
          ? "1 comment"
          : `${comments.length} comments`}
      </Eyebrow>

      {comments.length > 0 && (
        <ul className="mt-3 mb-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {comments.map((c, i) => (
            <li
              key={i}
              className="mb-3 pl-3"
              style={{ borderLeft: `2px solid ${C.paperLine}` }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span style={{ fontFamily: F.mono, fontSize: 12, color: C.ink }}>
                  {c.author || c.account}
                </span>
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.gold }}>
                  {c.ts}
                </span>
                {c.account && c.account === session?.username && (
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: 9.5,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: C.inkSoft,
                    }}
                  >
                    you
                  </span>
                )}
              </div>
              <p
                className="mt-1"
                style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
              >
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        <textarea
          rows={2}
          value={draft}
          placeholder="Add a note for the rest of the department."
          onChange={(e) => setDraft(e.target.value)}
          style={{
            width: "100%",
            fontFamily: F.body,
            fontSize: 13.5,
            color: C.ink,
            background: "rgba(255,255,255,0.7)",
            border: `1px solid ${C.rule}`,
            padding: "8px 10px",
            outline: "none",
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
        <div className="flex items-center gap-3 mt-2">
          <Btn onClick={submit} disabled={!draft.trim() || busy}>
            {busy ? "Posting…" : "Comment"}
          </Btn>
          {error && (
            <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** One filing, with its thread under it. */
function LegalFiling({ filing, session, onSubmit, canDelete }) {
  // Deleting is the one action here that retyping cannot undo, so it arms first
  // rather than firing on the click — the same bargain the company chart makes
  // with its two removals. Not window.confirm: a native dialog blocks the page
  // and is the wrong register for this site.
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "delete", id: filing.id });
      // No need to unset anything — the filing is gone and so is this component.
    } catch (e) {
      setError(e.message);
      setArmed(false);
      setBusy(false);
    }
  };

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{filing.ts}</span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "3px 7px",
            background: LEGAL_STATUS_TONE[filing.status] || C.inkSoft,
            color: "#FFFFFF",
          }}
        >
          {filing.status || LEGAL_STATUS_DEFAULT}
        </span>
        {filing.reference && (
          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkSoft }}>
            {filing.reference}
          </span>
        )}
        {filing.author && (
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
            filed by {filing.author}
          </span>
        )}

        {/* A filing entered by hand in the control room has no id of its own, so
            there is nothing for the route to address. Those come off the record
            in the control room instead. */}
        {canDelete && filing.id && (
          <span className="ml-auto flex items-center gap-2">
            {armed ? (
              <>
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.seal }}>
                  Delete this filing?
                </span>
                <OrgAction
                  tone="seal"
                  onClick={remove}
                  title="Yes, take it off the record"
                >
                  {busy ? "…" : "Yes"}
                </OrgAction>
                <OrgAction onClick={() => setArmed(false)} title="Keep it">
                  Keep
                </OrgAction>
              </>
            ) : (
              <OrgAction
                tone="seal"
                onClick={() => setArmed(true)}
                title="Delete this filing and its comments"
              >
                Delete
              </OrgAction>
            )}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-2" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink, lineHeight: 1.15 }}>
        {filing.title}
      </h3>
      {filing.party && (
        <div className="mt-1" style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ledger }}>
          with {filing.party}
        </div>
      )}
      {filing.detail && (
        <p
          className="mt-2"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
        >
          {filing.detail}
        </p>
      )}

      {/* A filing typed in by hand in the control room has no id, and a comment
          has nothing to attach to without one. Say so rather than offering a
          box that would be refused. */}
      {filing.id ? (
        <EntryComments entry={filing} session={session} onSubmit={onSubmit} />
      ) : (
        <p
          className="mt-4 pt-3"
          style={{
            borderTop: `1px dashed ${C.rule}`,
            fontFamily: F.body,
            fontSize: 13,
            color: C.inkSoft,
          }}
        >
          This one was entered by hand and has no reference of its own, so it
          cannot take comments. File it again from here if you need a thread on it.
        </p>
      )}
    </Panel>
  );
}

/**
 * The legal department's own page, reached from the staff room.
 *
 * One section per kind of document, because a contract and a court filing are
 * not the same job and a single list of everything would mean reading the whole
 * thing to find either.
 */
function LegalDepartment({ data, level, session, onBack, onSubmitLegal }) {
  // `{ kind, from }` — which kind is being filed, and the template it was
  // started from, if any.
  const [filing, setFiling] = useState(null);
  const [templating, setTemplating] = useState(false);
  const [msg, setMsg] = useState("");

  const templates = [...(data.legalTemplates || [])].reverse();

  const byKind = useMemo(() => {
    const map = new Map(LEGAL_KINDS.map((k) => [k, []]));
    // Newest first, matching the other boards.
    for (const f of [...(data.legalFilings || [])].reverse()) {
      if (!f) continue;
      // A kind that is no longer offered still has to appear somewhere, or the
      // filing would silently vanish from the page.
      if (!map.has(f.kind)) map.set(f.kind, []);
      map.get(f.kind).push(f);
    }
    return map;
  }, [data.legalFilings]);

  // Only the chief executive may take a filing off the record. The server
  // enforces this too — the page just decides whether to offer it.
  const canDelete = level >= LEVEL.ceo;

  const SENT = {
    comment: "Comment posted.",
    delete: "Filing deleted.",
    file: "Filed.",
    template: "Template saved.",
  };

  const submit = async (payload) => {
    await onSubmitLegal(payload);
    setMsg(SENT[payload.action] || "Saved.");
  };

  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const kinds = [...byKind.keys()];

  return (
    <div className="space-y-10">
      <Btn onClick={onBack}>← Staff room</Btn>

      <section>
        <SectionHead
          title="Legal department"
          note={
            canDelete
              ? "Everything the department has filed, one section per kind of document. Anyone in the department can comment on any of them; the thread stays with the filing. You can also delete a filing — it and its comments go for good."
              : "Everything the department has filed, one section per kind of document. Anyone in the department can comment on any of them; the thread stays with the filing."
          }
        />
        {msg && (
          <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>{msg}</p>
        )}
      </section>

      <section>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <SectionHead
              index={numerals[0]}
              title="Legal templates"
              note="Standard wording the department drafts from. Use one and it copies the text into a new filing for you to edit; the template itself stays as it is."
            />
          </div>
          <div className="shrink-0 pt-1">
            <Btn variant="solid" onClick={() => { setMsg(""); setTemplating(true); }}>
              New template
            </Btn>
          </div>
        </div>

        {templates.length === 0 ? (
          <Panel tone="deep" style={{ padding: 20 }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
              No templates yet. Write the wording you keep retyping — a standard
              supply agreement, the licence application you always file — and it
              will be here the next time somebody needs it.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {templates.map((t, i) => (
              <LegalTemplate
                key={t.id || t.name + i}
                template={t}
                onUse={(tpl) => { setMsg(""); setFiling({ kind: tpl.kind, from: tpl }); }}
              />
            ))}
          </div>
        )}
      </section>

      {kinds.map((kind, i) => {
        const list = byKind.get(kind) || [];
        return (
          <section key={kind}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <SectionHead
                  index={numerals[i + 1] || String(i + 2)}
                  title={kindPlural(kind)}
                  note={LEGAL_KIND_BLURBS[kind]}
                />
              </div>
              <div className="shrink-0 pt-1">
                <Btn variant="solid" onClick={() => { setMsg(""); setFiling({ kind }); }}>
                  New {kind.toLowerCase()}
                </Btn>
              </div>
            </div>

            {list.length === 0 ? (
              <Panel tone="deep" style={{ padding: 20 }}>
                <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
                  Nothing filed under this heading yet.
                </p>
              </Panel>
            ) : (
              <div className="space-y-3">
                {list.map((f) => (
                  <LegalFiling
                    key={f.id || f.ts + f.title}
                    filing={f}
                    session={session}
                    onSubmit={submit}
                    canDelete={canDelete}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div>
        <Btn onClick={onBack}>← Staff room</Btn>
      </div>

      {filing && (
        <LegalFilingModal
          kind={filing.kind}
          from={filing.from}
          onClose={() => setFiling(null)}
          onSubmit={submit}
          session={session}
        />
      )}

      {templating && (
        <LegalTemplateModal
          onClose={() => setTemplating(false)}
          onSubmit={submit}
          session={session}
        />
      )}
    </div>
  );
}

/* ------------------------ the research department ------------------------ */

/** Where a piece of work has got to. Gold while live, oxblood once dropped. */
const RESEARCH_STATUS_TONE = {
  Scoping: C.inkSoft,
  "In progress": C.ink,
  Watching: C.gold,
  Approached: C.ledger,
  Concluded: C.ink,
  Dropped: C.seal,
};

/**
 * Opens a research file of one particular kind.
 *
 * Like the legal modal, the kind is not a field on the form: each kind has its
 * own section and its own button, so which one you pressed is the answer.
 */
function ResearchModal({ kind, onClose, onSubmit, session }) {
  const [form, setForm] = useState({
    title: "",
    subject: "",
    valuation: "",
    status: RESEARCH_STATUS_DEFAULT,
    detail: "",
    author: session?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = form.title.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "file", kind, ...form });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const upd = (k) => (v) => setForm({ ...form, [k]: v });

  // What the two loose fields are called depends on the kind. A rival is not a
  // "market" and a target's price is not a "size", and asking for the right
  // thing is the difference between a useful file and a blank box.
  const words = {
    "Market research": {
      subject: "Market",
      subjectHint: "Redstone, freight, rented plots",
      figure: "Size or value",
      figureHint: "What the whole market is worth",
    },
    "Competitor analysis": {
      subject: "Competitor",
      subjectHint: "The firm, or the person behind it",
      figure: "Their scale",
      figureHint: "Turnover, shops, or how it compares to ours",
    },
    "Acquisition target": {
      subject: "Target",
      subjectHint: "The firm we might buy",
      figure: "Asking or estimate",
      figureHint: "What it would cost, or our estimate",
    },
  }[kind] || {
    subject: "Subject",
    subjectHint: "",
    figure: "Figure",
    figureHint: "",
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="p-7">
        <Eyebrow color={C.gold}>Research and development</Eyebrow>
        <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
          New {kind.toLowerCase()}
        </h2>
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
        >
          {RESEARCH_KIND_BLURBS[kind] || "Filed to the research department's record."}{" "}
          The department can comment on it once it is filed.
        </p>

        <p
          className="mb-5"
          style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}
        >
          Stays inside the department. Nothing here is posted to Discord or shown
          below the research department.
        </p>

        <Field
          label="Title"
          value={form.title}
          onChange={upd("title")}
          placeholder="Where the freight money actually is"
        />
        <div className="grid md:grid-cols-2 gap-x-5">
          <Field
            label={words.subject}
            value={form.subject}
            onChange={upd("subject")}
            placeholder={words.subjectHint}
          />
          <Field
            label={words.figure}
            value={form.valuation}
            onChange={upd("valuation")}
            placeholder={words.figureHint}
            hint="Text, not a number — “about 40 stacks a week” is a useful answer."
          />
          <Field
            label="Status"
            value={form.status}
            onChange={upd("status")}
            options={RESEARCH_STATUSES}
          />
          <Field label="Filed by" value={form.author} onChange={upd("author")} placeholder="Steve" />
        </div>
        <Field
          label="Detail"
          rows={6}
          value={form.detail}
          onChange={upd("detail")}
          placeholder="What you found, how you found it, and what you think we should do about it."
        />

        {error && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
            {busy ? "Filing…" : "File it"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** One research file, with its thread under it. */
function ResearchFile({ file, session, onSubmit, canDelete }) {
  // Arms first, like the legal delete and the chart's removals: the file and its
  // thread are the only copy and retyping does not bring them back.
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "delete", id: file.id });
    } catch (e) {
      setError(e.message);
      setArmed(false);
      setBusy(false);
    }
  };

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{file.ts}</span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "3px 7px",
            background: RESEARCH_STATUS_TONE[file.status] || C.inkSoft,
            color: "#FFFFFF",
          }}
        >
          {file.status || RESEARCH_STATUS_DEFAULT}
        </span>
        {file.author && (
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
            filed by {file.author}
          </span>
        )}

        {/* A row typed in by hand in the control room has no id, so there is
            nothing for the route to address. Those come off in the control
            room instead. */}
        {canDelete && file.id && (
          <span className="ml-auto flex items-center gap-2">
            {armed ? (
              <>
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.seal }}>
                  Delete this file?
                </span>
                <OrgAction tone="seal" onClick={remove} title="Yes, take it off the record">
                  {busy ? "…" : "Yes"}
                </OrgAction>
                <OrgAction onClick={() => setArmed(false)} title="Keep it">
                  Keep
                </OrgAction>
              </>
            ) : (
              <OrgAction
                tone="seal"
                onClick={() => setArmed(true)}
                title="Delete this file and its comments"
              >
                Delete
              </OrgAction>
            )}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-2" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink, lineHeight: 1.15 }}>
        {file.title}
      </h3>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4">
        {file.subject && (
          <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ledger }}>
            {file.subject}
          </span>
        )}
        {file.valuation && (
          <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.inkSoft }}>
            {file.valuation}
          </span>
        )}
      </div>
      {file.detail && (
        <p
          className="mt-2"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
        >
          {file.detail}
        </p>
      )}

      {file.id ? (
        <EntryComments entry={file} session={session} onSubmit={onSubmit} />
      ) : (
        <p
          className="mt-4 pt-3"
          style={{
            borderTop: `1px dashed ${C.rule}`,
            fontFamily: F.body,
            fontSize: 13,
            color: C.inkSoft,
          }}
        >
          This one was entered by hand and has no reference of its own, so it
          cannot take comments. File it again from here if you need a thread on it.
        </p>
      )}
    </Panel>
  );
}

/**
 * The research department's own page, reached from the staff room.
 *
 * One section per kind, like the legal department, because market research and
 * an acquisition target are not the same job and one list of everything would
 * mean reading all of it to find either.
 */
function ResearchDepartment({ data, level, session, onBack, onSubmitResearch }) {
  const [filing, setFiling] = useState(null);
  const [msg, setMsg] = useState("");

  const byKind = useMemo(() => {
    const map = new Map(RESEARCH_KINDS.map((k) => [k, []]));
    // Newest first, matching the other boards.
    for (const e of [...(data.research || [])].reverse()) {
      if (!e) continue;
      // A kind no longer offered still gets a section rather than vanishing.
      if (!map.has(e.kind)) map.set(e.kind, []);
      map.get(e.kind).push(e);
    }
    return map;
  }, [data.research]);

  const canDelete = level >= LEVEL.ceo;

  const SENT = { comment: "Comment posted.", delete: "File deleted.", file: "Filed." };

  const submit = async (payload) => {
    await onSubmitResearch(payload);
    setMsg(SENT[payload.action] || "Saved.");
  };

  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  const kinds = [...byKind.keys()];

  return (
    <div className="space-y-10">
      <Btn onClick={onBack}>← Staff room</Btn>

      <section>
        <SectionHead
          title="Research and development"
          note={
            canDelete
              ? "What the company is looking at, who it is up against, and who it might buy. Anyone in the department can comment; the thread stays with the file. You can also delete one — it and its comments go for good."
              : "What the company is looking at, who it is up against, and who it might buy. Anyone in the department can comment; the thread stays with the file."
          }
        />
        <Panel tone="deep" style={{ padding: 16, borderStyle: "dashed" }}>
          <Eyebrow color={C.seal}>Inside the department</Eyebrow>
          <p
            className="mt-2"
            style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}
          >
            None of this leaves the department. Staff and below are not sent it at
            all, and nothing here is ever posted to Discord — this list names
            firms that have not been approached and prices we have not offered.
          </p>
        </Panel>
        {msg && (
          <p className="mt-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>
            {msg}
          </p>
        )}
      </section>

      {kinds.map((kind, i) => {
        const list = byKind.get(kind) || [];
        return (
          <section key={kind}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <SectionHead
                  index={numerals[i] || String(i + 1)}
                  title={researchPlural(kind)}
                  note={RESEARCH_KIND_BLURBS[kind]}
                />
              </div>
              <div className="shrink-0 pt-1">
                <Btn variant="solid" onClick={() => { setMsg(""); setFiling(kind); }}>
                  New {kind.toLowerCase()}
                </Btn>
              </div>
            </div>

            {list.length === 0 ? (
              <Panel tone="deep" style={{ padding: 20 }}>
                <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
                  Nothing filed under this heading yet.
                </p>
              </Panel>
            ) : (
              <div className="space-y-3">
                {list.map((f) => (
                  <ResearchFile
                    key={f.id || f.ts + f.title}
                    file={f}
                    session={session}
                    onSubmit={submit}
                    canDelete={canDelete}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div>
        <Btn onClick={onBack}>← Staff room</Btn>
      </div>

      {filing && (
        <ResearchModal
          kind={filing}
          onClose={() => setFiling(null)}
          onSubmit={submit}
          session={session}
        />
      )}
    </div>
  );
}

function StaffRoom({
  data,
  level,
  session,
  onSubmitShift,
  onSubmitTransaction,
  onSubmitLegal,
  onSubmitResearch,
}) {
  const [clocking, setClocking] = useState(null); // "in" | "out" | null
  const [filed, setFiled] = useState("");
  const [showTransaction, setShowTransaction] = useState(false);
  const [logged, setLogged] = useState("");
  // Whether the legal department's page is open instead of the staff room
  // itself. Local, like the control room's pages: the staff room is in the
  // address, but which subpage you last opened is not worth a history entry.
  const [showLegal, setShowLegal] = useState(false);
  const [showResearch, setShowResearch] = useState(false);

  // The hiring board is executive-only, which is also who may read accounts.
  const {
    users,
    msg: accountMsg,
    busy: busyAccount,
    setRole: setApplicantRole,
  } = useAccounts(level >= LEVEL.exec);

  if (level < LEVEL.staff) {
    return (
      <div>
        <SectionHead index="I" title="Staff room" note="Company staff only." />
        <LockedNote what="the internal board and incoming client requests" who="staff and executives" />
      </div>
    );
  }

  // The shift this account has open, if any. The server decides for real; this
  // only shapes what the buttons offer to do.
  const openShift = (data.shifts || []).find(
    (s) => s && s.account === session?.username && !String(s.timeOut || "").trim()
  );

  const shifts = [...(data.shifts || [])].reverse();
  const transactions = [...(data.transactions || [])].reverse();
  const applications = [...(data.applications || [])].reverse();

  // The hiring board is executive-only, so the numerals cannot be written by
  // hand — a staff viewer would otherwise read I, III, IV.
  const numerals = ["I", "II", "III", "IV", "V", "VI"];
  let counted = 0;
  const step = () => numerals[counted++];

  const canSeeHiring = level >= LEVEL.exec;

  // The legal department's page is theirs and the executive's. A staff member
  // does not get the button, because they would only reach a page the server
  // has already emptied of filings.
  const canSeeLegal = level >= LEVEL.legal;

  // The research department's page is theirs, legal's and the executive's. A
  // staff member does not get the button, because the server has already
  // emptied `research` before it reached them.
  const canSeeResearch = level >= LEVEL.rnd;

  if (showLegal && canSeeLegal) {
    return (
      <LegalDepartment
        data={data}
        level={level}
        session={session}
        onBack={() => setShowLegal(false)}
        onSubmitLegal={onSubmitLegal}
      />
    );
  }

  if (showResearch && canSeeResearch) {
    return (
      <ResearchDepartment
        data={data}
        level={level}
        session={session}
        onBack={() => setShowResearch(false)}
        onSubmitResearch={onSubmitResearch}
      />
    );
  }

  return (
    <div className="space-y-10">
      {(canSeeLegal || canSeeResearch) && (
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          {canSeeLegal && (
            <div>
              <Btn variant="gold" onClick={() => setShowLegal(true)}>
                Legal Department
              </Btn>
              <p
                className="mt-2 max-w-sm"
                style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft }}
              >
                Contracts, court filings and licences, with the department's notes
                on each.
              </p>
            </div>
          )}
          {canSeeResearch && (
            <div>
              <Btn variant="gold" onClick={() => setShowResearch(true)}>
                Research &amp; Development
              </Btn>
              <p
                className="mt-2 max-w-sm"
                style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft }}
              >
                Market research, competitor analysis and acquisition targets. Does
                not leave the department.
              </p>
            </div>
          )}
        </div>
      )}

      <section>
        <SectionHead
          index={step()}
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

      {canSeeHiring && (
      <section>
        <SectionHead
          index={step()}
          title="Hiring board"
          note="People who have applied to work here. Executives only — an application states what somebody expects to be paid."
        />
        {applications.length === 0 ? (
          <Panel tone="deep" style={{ padding: 20 }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
              Nothing waiting. Applications from the front page land here.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {applications.map((a, i) => (
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
                      padding: "3px 7px",
                      background: a.status === "Hired" ? C.ledger : a.status === "Declined" ? C.seal : C.inkSoft,
                      color: "#FFFFFF",
                    }}
                  >
                    {a.status || "New"}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkSoft }}>
                    {a.discord || "no handle given"}
                  </span>
                </div>
                <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>
                  {a.username} — {a.role}
                </h3>
                {a.wage && (
                  <div
                    className="mt-1"
                    style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ledger }}
                  >
                    Asking {a.wage}
                  </div>
                )}
                {[
                  ["Experience", a.experience],
                  ["References", a.references],
                  ["Notes", a.notes],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="mt-3">
                      <Eyebrow>{k}</Eyebrow>
                      <p
                        className="mt-1"
                        style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
                      >
                        {v}
                      </p>
                    </div>
                  ))}

                <ApplicantAccount
                  account={a.account}
                  users={users}
                  me={session?.username}
                  busy={busyAccount}
                  onPick={setApplicantRole}
                />
              </Panel>
            ))}
            {accountMsg && (
              <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>
                {accountMsg}
              </p>
            )}
          </div>
        )}
      </section>
      )}

      <section>
        <SectionHead index={step()} title="Standing orders" note="How we do things. Read before your first shift." />
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              t: "Log every shift",
              d: "Clock in when you start and out when you finish. The two make one entry, and payroll comes off it.",
              clock: true,
            },
            { t: "Price from the card", d: "Do not undercut the rate card without an executive on the message." },
            { t: "Books before boasts", d: "No figure goes public until it is on this site." },
            {
              t: "Transaction Log",
              d: "Log a transaction made outside of chestshops such as legal work, material contract etc.",
              transaction: true,
            },
          ].map(({ t, d, clock, transaction }) => (
            <Panel key={t} style={{ padding: 18, display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontFamily: F.display, fontSize: 21, color: C.ink }}>{t}</h3>
              <p
                className="mt-2 flex-1"
                style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
              >
                {d}
              </p>
              {clock && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn
                      variant={openShift ? "ghost" : "solid"}
                      onClick={() => {
                        setFiled("");
                        setClocking("in");
                      }}
                    >
                      Clock in
                    </Btn>
                    <Btn
                      variant={openShift ? "solid" : "ghost"}
                      onClick={() => {
                        setFiled("");
                        setClocking("out");
                      }}
                    >
                      Clock out
                    </Btn>
                  </div>
                  {(openShift || filed) && (
                    <div
                      className="mt-3"
                      style={{
                        fontFamily: F.mono,
                        fontSize: 11,
                        color: filed ? C.ledger : C.inkSoft,
                      }}
                    >
                      {filed ||
                        `On shift since ${openShift.timeIn}${
                          openShift.occupation ? " · " + openShift.occupation : ""
                        }`}
                    </div>
                  )}
                </div>
              )}
              {transaction && (
                <div className="mt-4">
                  <Btn
                    variant="solid"
                    onClick={() => {
                      setLogged("");
                      setShowTransaction(true);
                    }}
                  >
                    Log Transaction
                  </Btn>
                  {logged && (
                    <div
                      className="mt-3"
                      style={{ fontFamily: F.mono, fontSize: 11, color: C.ledger }}
                    >
                      {logged}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <SectionHead
          index={step()}
          title="Shift log"
          note="The last shifts filed. Executives can correct entries in the control room."
        />
        {shifts.length === 0 ? (
          <Panel tone="deep" style={{ padding: 20 }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
              Nothing logged yet. Clock in and out above and it lands here.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {shifts.slice(0, 40).map((sh, i) => (
              <Panel key={i} style={{ padding: 18 }}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>
                    {sh.ts}
                  </span>
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: 12.5,
                      color: C.ink,
                    }}
                  >
                    {String(sh.timeOut || "").trim()
                      ? `${sh.timeIn} → ${sh.timeOut}`
                      : `${sh.timeIn} → still on`}
                  </span>
                  {!String(sh.timeOut || "").trim() && (
                    <span
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9.5,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        padding: "3px 7px",
                        background: C.gold,
                        color: C.night,
                      }}
                    >
                      Open
                    </span>
                  )}
                  {sh.account && sh.account !== String(sh.username || "").toLowerCase() && (
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
                      filed by {sh.account}
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>
                  {sh.username} — {sh.occupation}
                </h3>
                {sh.output && (
                  <p
                    className="mt-1"
                    style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
                  >
                    {sh.output}
                  </p>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead
          index={step()}
          title="Transaction log"
          note="Deals settled off the chest shops. Executives can correct entries in the control room."
        />
        {transactions.length === 0 ? (
          <Panel tone="deep" style={{ padding: 20 }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
              Nothing logged yet. Use the transaction log above and it lands here.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 40).map((t, i) => (
              <Panel key={i} style={{ padding: 18 }}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>
                    {t.ts}
                  </span>
                  {t.amount && (
                    <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ledger }}>
                      {t.amount}
                    </span>
                  )}
                  {t.materials && (
                    <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
                      {t.materials}
                    </span>
                  )}
                  {t.username && (
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
                      logged by {t.username}
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>
                  {t.type}
                  {t.counterparty ? ` — ${t.counterparty}` : ""}
                </h3>
                {t.detail && (
                  <p
                    className="mt-1"
                    style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
                  >
                    {t.detail}
                  </p>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      {showTransaction && (
        <TransactionModal
          onClose={() => setShowTransaction(false)}
          onSubmit={async (form) => {
            await onSubmitTransaction(form);
            setLogged("Transaction logged.");
          }}
          session={session}
          data={data}
        />
      )}

      {clocking === "in" && (
        <ClockInModal
          onClose={() => setClocking(null)}
          onSubmit={async (form) => {
            await onSubmitShift(form);
            setFiled("Clocked in. Clock out when you finish.");
          }}
          session={session}
          data={data}
        />
      )}

      {clocking === "out" && (
        <ClockOutModal
          onClose={() => setClocking(null)}
          onSubmit={async (form) => {
            await onSubmitShift(form);
            setFiled("Shift closed and logged.");
          }}
          open={openShift}
        />
      )}
    </div>
  );
}

/* -------------------------------- the forum ------------------------------ */

/** Opens a thread on one board. The board comes from where you pressed it. */
function NewThreadModal({ board, onClose, onSubmit, session }) {
  const [form, setForm] = useState({
    title: "",
    body: "",
    author: session?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = form.title.trim() && form.body.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action: "thread", board: board.key, ...form });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="p-7">
        <Eyebrow color={C.gold}>{board.name}</Eyebrow>
        <h2 className="mt-2 mb-1" style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}>
          New thread
        </h2>
        <p
          className="mb-5"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
        >
          {board.blurb}
        </p>

        <Field
          label="Title"
          value={form.title}
          onChange={(v) => setForm({ ...form, title: v })}
          placeholder="What is this about?"
        />
        <Field
          label="Your post"
          rows={8}
          value={form.body}
          onChange={(v) => setForm({ ...form, body: v })}
        />
        <Field
          label="Posting as"
          value={form.author}
          onChange={(v) => setForm({ ...form, author: v })}
          placeholder="Your in-game name"
        />

        {error && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
            {busy ? "Posting…" : "Post it"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** One post — the thread's opening message, or a reply to it. */
function ForumPost({ post, session, canModerate, onDelete, opening }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(post.id);
    } catch (e) {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <Panel style={{ padding: 18 }} tone={opening ? "deep" : undefined}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
          {post.author || post.account}
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{post.ts}</span>
        {post.account && post.account === session?.username && (
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.inkSoft,
            }}
          >
            you
          </span>
        )}
        {canModerate && (
          <span className="ml-auto flex items-center gap-2">
            {armed ? (
              <>
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.seal }}>
                  {opening ? "Remove the whole thread?" : "Remove this post?"}
                </span>
                <OrgAction tone="seal" onClick={remove} title="Yes, remove it">
                  {busy ? "…" : "Yes"}
                </OrgAction>
                <OrgAction onClick={() => setArmed(false)} title="Keep it">
                  Keep
                </OrgAction>
              </>
            ) : (
              <OrgAction tone="seal" onClick={() => setArmed(true)} title="Remove this post">
                Remove
              </OrgAction>
            )}
          </span>
        )}
      </div>
      <p
        style={{
          fontFamily: F.body,
          fontSize: 14.5,
          color: C.ink,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          margin: 0,
        }}
      >
        {post.body}
      </p>
    </Panel>
  );
}

/** A thread and everything said in it. */
function ForumThread({ thread, board, level, session, onBack, onSubmitForum }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canModerate = level >= LEVEL.exec;
  const canPost = Boolean(session?.username) && level >= LEVEL[board.min];
  const replies = Array.isArray(thread.replies) ? thread.replies : [];

  const reply = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmitForum({ action: "reply", id: thread.id, body: draft });
      setDraft("");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const remove = async (id) => {
    await onSubmitForum({ action: "delete", id });
    // Removing the opening post takes the thread with it, so there is nothing
    // left to look at.
    if (id === thread.id) onBack();
  };

  return (
    <div className="space-y-6">
      <Btn onClick={onBack}>← {board.name}</Btn>

      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Eyebrow>{board.name}</Eyebrow>
          {thread.locked && (
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 9.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "3px 7px",
                background: C.seal,
                color: "#FFFFFF",
              }}
            >
              Closed
            </span>
          )}
          {canModerate && (
            <span className="ml-auto">
              <Btn
                onClick={() =>
                  onSubmitForum({ action: "lock", id: thread.id, locked: !thread.locked })
                }
              >
                {thread.locked ? "Reopen" : "Close thread"}
              </Btn>
            </span>
          )}
        </div>
        <h2
          style={{
            fontFamily: F.display,
            fontSize: "clamp(26px, 3.4vw, 36px)",
            lineHeight: 1.08,
            color: C.ink,
            letterSpacing: "-0.015em",
          }}
        >
          {thread.title}
        </h2>
      </div>

      <div className="space-y-3">
        <ForumPost
          opening
          post={thread}
          session={session}
          canModerate={canModerate}
          onDelete={remove}
        />
        {replies.map((r) => (
          <ForumPost
            key={r.id}
            post={r}
            session={session}
            canModerate={canModerate}
            onDelete={remove}
          />
        ))}
      </div>

      {thread.locked ? (
        <Panel tone="deep" style={{ padding: 18 }}>
          <p style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft }}>
            An executive has closed this thread. Nothing more can be posted to it.
          </p>
        </Panel>
      ) : canPost ? (
        <Panel style={{ padding: 18 }}>
          <div className="mb-1">
            <Eyebrow>Reply</Eyebrow>
          </div>
          <textarea
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say your piece."
            style={{
              width: "100%",
              fontFamily: F.body,
              fontSize: 14,
              color: C.ink,
              background: "rgba(255,255,255,0.7)",
              border: `1px solid ${C.rule}`,
              padding: "8px 10px",
              outline: "none",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <div className="flex items-center gap-3 mt-2">
            <Btn variant="solid" onClick={reply} disabled={!draft.trim() || busy}>
              {busy ? "Posting…" : "Post reply"}
            </Btn>
            {error && (
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>{error}</span>
            )}
          </div>
        </Panel>
      ) : (
        <Panel tone="deep" style={{ padding: 18, borderStyle: "dashed" }}>
          <p style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft }}>
            Sign in to reply. Reading is open; posting takes an account.
          </p>
        </Panel>
      )}
    </div>
  );
}

/** The threads on one board, most recently active first. */
function ForumBoard({ board, threads, level, session, onOpen, onBack, onSubmitForum }) {
  const [composing, setComposing] = useState(false);
  const canPost = Boolean(session?.username) && level >= LEVEL[board.min];

  const ordered = useMemo(
    () =>
      [...threads].sort((a, b) => {
        const d = lastActivity(b).localeCompare(lastActivity(a));
        return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
      }),
    [threads]
  );

  return (
    <div className="space-y-6">
      <Btn onClick={onBack}>← All boards</Btn>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <SectionHead title={board.name} note={board.blurb} />
        </div>
        {canPost && (
          <div className="shrink-0 pt-1">
            <Btn variant="solid" onClick={() => setComposing(true)}>
              New thread
            </Btn>
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <Panel tone="deep" style={{ padding: 20 }}>
          <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft }}>
            Nothing here yet.{" "}
            {canPost ? "Start the first thread." : "Sign in to start the first thread."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {ordered.map((t) => {
            const n = (t.replies || []).length;
            return (
              <Panel key={t.id} raised style={{ padding: 0 }}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="ucc-hub"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 18,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{t.ts}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkSoft }}>
                      {t.author || t.account}
                    </span>
                    {t.locked && (
                      <span
                        style={{
                          fontFamily: F.mono,
                          fontSize: 9.5,
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: C.seal,
                        }}
                      >
                        closed
                      </span>
                    )}
                  </span>
                  <span
                    className="block mt-1"
                    style={{ fontFamily: F.display, fontSize: 21, color: C.ink, lineHeight: 1.15 }}
                  >
                    {t.title}
                  </span>
                  <span
                    className="block mt-2"
                    style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft, letterSpacing: "0.1em" }}
                  >
                    {n === 0 ? "no replies" : n === 1 ? "1 reply" : n + " replies"}
                  </span>
                </button>
              </Panel>
            );
          })}
        </div>
      )}

      {composing && (
        <NewThreadModal
          board={board}
          onClose={() => setComposing(false)}
          onSubmit={onSubmitForum}
          session={session}
        />
      )}
    </div>
  );
}

/**
 * The company forum.
 *
 * Three views behind one tab — the boards, a board's threads, one thread — held
 * in local state rather than the address, the same way the control room holds
 * which editor is open. The tab itself is in the hash, so a refresh comes back
 * to the forum rather than the overview.
 *
 * Boards above the viewer's level are shown but not opened. Saying "there is a
 * staff lounge and you cannot read it" is friendlier than pretending it does not
 * exist, and the server has already withheld every thread in it.
 */
function Forum({ data, level, session, onSubmitForum, onSignIn }) {
  const [boardKey, setBoardKey] = useState(null);
  const [threadId, setThreadId] = useState(null);

  const threads = Array.isArray(data.forum) ? data.forum : [];
  const byBoard = useMemo(() => {
    const m = new Map(FORUM_BOARDS.map((b) => [b.key, []]));
    for (const t of threads) {
      if (!t || !m.has(t.board)) continue;
      m.get(t.board).push(t);
    }
    return m;
  }, [threads]);

  const board = boardKey ? boardBy(boardKey) : null;
  const thread = threadId ? threads.find((t) => t && t.id === threadId) : null;

  // A thread that has just been removed, or one whose board the viewer cannot
  // reach, drops back rather than rendering nothing.
  if (board && threadId && !thread) {
    return (
      <ForumBoard
        board={board}
        threads={byBoard.get(board.key) || []}
        level={level}
        session={session}
        onOpen={setThreadId}
        onBack={() => { setBoardKey(null); setThreadId(null); }}
        onSubmitForum={onSubmitForum}
      />
    );
  }

  if (board && thread) {
    return (
      <ForumThread
        thread={thread}
        board={board}
        level={level}
        session={session}
        onBack={() => setThreadId(null)}
        onSubmitForum={onSubmitForum}
      />
    );
  }

  if (board) {
    return (
      <ForumBoard
        board={board}
        threads={byBoard.get(board.key) || []}
        level={level}
        session={session}
        onOpen={setThreadId}
        onBack={() => setBoardKey(null)}
        onSubmitForum={onSubmitForum}
      />
    );
  }

  return (
    <div className="space-y-8">
      <SectionHead
        index="I"
        title="The forum"
        note="Where the company and the people it trades with talk. Reading is open to anyone; posting takes an account, which is one click from the sign-in button."
      />

      {!session?.username && (
        <Panel tone="deep" style={{ padding: 18 }}>
          <p
            className="mb-3"
            style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
          >
            You are reading as a visitor. An account lets you post, and gives you
            nothing else you did not already have.
          </p>
          <Btn variant="solid" onClick={onSignIn}>
            Sign in or create an account
          </Btn>
        </Panel>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {FORUM_BOARDS.map((b) => {
          const open = level >= LEVEL[b.min];
          const list = byBoard.get(b.key) || [];
          const posts = list.reduce((n, t) => n + 1 + (t.replies || []).length, 0);

          return (
            <Panel
              key={b.key}
              raised={open}
              tone={open ? undefined : "deep"}
              style={{ padding: 0, opacity: open ? 1 : 0.72 }}
            >
              <button
                type="button"
                disabled={!open}
                onClick={() => open && setBoardKey(b.key)}
                className={open ? "ucc-hub" : undefined}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 18,
                  background: "none",
                  border: "none",
                  cursor: open ? "pointer" : "not-allowed",
                }}
              >
                <span
                  className="block"
                  style={{ fontFamily: F.display, fontSize: 21, color: C.ink, lineHeight: 1.15 }}
                >
                  {b.name}
                </span>
                <span
                  className="block mt-1"
                  style={{ fontFamily: F.body, fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}
                >
                  {b.blurb}
                </span>
                <span
                  className="block mt-3"
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    color: open ? C.gold : C.seal,
                  }}
                >
                  {open
                    ? `${list.length} ${list.length === 1 ? "thread" : "threads"} · ${posts} ${
                        posts === 1 ? "post" : "posts"
                      }`
                    : `${ROLE_NAME[b.min] || b.min} access and above`}
                </span>
              </button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- control room ----------------------------- */

/**
 * The segmented access control. Shared by the accounts editor and the hiring
 * board, so promoting somebody looks and behaves the same wherever it is done.
 */
function RolePicker({ role, onPick, locked, lockedReason, busy }) {
  const fill = {
    ceo: C.gold,
    exec: C.seal,
    legal: C.night,
    rnd: C.night,
    staff: C.ledger,
    client: C.ink,
  };

  return (
    <div className="flex flex-wrap" style={{ border: `1px solid ${C.rule}` }}>
      {ROLE_TABS.map((r, i) => {
        const active = role === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => {
              if (!active && !locked) onPick(r.key);
            }}
            disabled={locked || busy}
            title={locked ? lockedReason : r.hint}
            style={{
              fontFamily: F.mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "6px 11px",
              border: "none",
              borderRight: i < ROLE_TABS.length - 1 ? `1px solid ${C.rule}` : "none",
              cursor: locked ? "not-allowed" : active ? "default" : "pointer",
              opacity: locked ? 0.45 : 1,
              background: active ? fill[r.key] || C.inkSoft : "transparent",
              color: active ? (r.key === "ceo" ? C.night : C.paper) : C.inkSoft,
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function Accounts({ session }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "client" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUser, setBusyUser] = useState(null);
  const me = session?.username;

  const refresh = useCallback(async () => {
    try {
      const r = await api("/api/users");
      setUsers(r.users);
    } catch (e) {
      setMsg(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setUsers(r.users);
      setMsg("Account saved. Give them the password in a direct message, not a public channel.");
      setForm({ username: "", password: "", role: form.role });
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (username) => {
    setMsg("");
    try {
      const r = await api("/api/users", {
        method: "DELETE",
        body: JSON.stringify({ username }),
      });
      setUsers(r.users);
      setMsg("Removed " + username + ".");
    } catch (e) {
      setMsg(e.message);
    }
  };

  const setRole = async (username, role) => {
    setMsg("");
    setBusyUser(username);
    const before = users;
    // Show it immediately, put it back if the server disagrees.
    setUsers(users.map((u) => (u.username === username ? { ...u, role } : u)));
    try {
      const r = await api("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ username, role }),
      });
      setUsers(r.users);
      setMsg(username + " is now " + (ROLE_NAME[role] || role) + ".");
    } catch (e) {
      setUsers(before);
      setMsg(e.message);
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <Panel style={{ padding: 20 }}>
      <div className="space-y-2 mb-6">
        {users.map((u) => (
          <div
            key={u.username}
            className="py-3"
            style={{ borderBottom: `1px solid ${C.paperLine}` }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>
                {u.username}
              </span>
              {u.username === me && (
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9.5,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.gold,
                  }}
                >
                  you
                </span>
              )}
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft }}>
                added {u.added || "—"}
              </span>
              {busyUser === u.username && (
                <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.ledger }}>
                  saving…
                </span>
              )}
              <span className="ml-auto">
                <Btn onClick={() => remove(u.username)} disabled={u.username === me}>
                  Remove
                </Btn>
              </span>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: C.inkSoft,
                }}
              >
                Access
              </span>
              <RolePicker
                role={u.role}
                onPick={(role) => setRole(u.username, role)}
                locked={u.username === me}
                lockedReason="You cannot change your own access level"
                busy={busyUser === u.username}
              />
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft }}>
            No accounts loaded yet.
          </p>
        )}
      </div>

      <Eyebrow>Add or change an account</Eyebrow>
      <div className="grid md:grid-cols-3 gap-x-5 mt-3">
        <Field
          label="Username"
          value={form.username}
          onChange={(v) => setForm({ ...form, username: v })}
          placeholder="in-game name"
        />
        <label className="block mb-3">
          <div className="mb-1"><Eyebrow>Password</Eyebrow></div>
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="at least 8 characters"
            style={{
              width: "100%",
              fontFamily: F.mono,
              fontSize: 13,
              color: C.ink,
              background: "rgba(255,255,255,0.7)",
              border: `1px solid ${C.rule}`,
              padding: "8px 10px",
              outline: "none",
            }}
          />
        </label>
        <Field
          label="Access"
          value={form.role}
          options={["member", "client", "staff", "rnd", "legal", "exec"]}
          onChange={(v) => setForm({ ...form, role: v })}
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Btn
          variant="solid"
          onClick={add}
          disabled={busy || !form.username.trim() || form.password.length < 8}
        >
          {busy ? "Saving…" : "Save account"}
        </Btn>
        {msg && (
          <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>{msg}</span>
        )}
      </div>
      <p className="mt-4" style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
        Change someone's access with the dropdown on their row — it takes effect
        immediately and does not touch their password. Your own row is locked, so
        you cannot lock yourself out; ask another executive if you need your own
        level changed.
      </p>
      <p className="mt-3" style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
        Using an existing username in the form below replaces that account's
        password as well. Passwords are stored hashed — nobody, including you,
        can read them back, so reissue rather than look up.
      </p>
    </Panel>
  );
}

/**
 * What a removed row actually said.
 *
 * The four archived lists have different fields, and a generic key/value dump
 * would read like a debugging aid. Each kind names the two or three fields worth
 * seeing at a glance, and the rest is shown underneath as the detail.
 */
const DELETED_SUMMARY = {
  applications: (e) => ({
    title: [e.username, e.role].filter(Boolean).join(" — "),
    meta: [e.status, e.wage && "asking " + e.wage, e.discord].filter(Boolean),
    detail: e.experience || e.notes,
  }),
  legalFilings: (e) => ({
    title: e.title,
    meta: [e.kind, e.status, e.party && "with " + e.party, e.reference].filter(Boolean),
    detail: e.detail,
  }),
  research: (e) => ({
    title: e.title,
    meta: [e.kind, e.status, e.subject, e.valuation].filter(Boolean),
    detail: e.detail,
  }),
  requests: (e) => ({
    title: [e.from, e.type].filter(Boolean).join(" — "),
    meta: [e.status, e.contact].filter(Boolean),
    detail: e.detail,
  }),
  projects: (e) => ({
    title: e.name,
    meta: [e.status, e.visibility && e.visibility + " only", e.target].filter(Boolean),
    detail: e.summary,
  }),
  forum: (e) => ({
    title: e.title,
    meta: [
      boardBy(e.board)?.name || e.board,
      e.author,
      (e.replies || []).length + " replies",
      e.locked && "closed",
    ].filter(Boolean),
    detail: e.body,
  }),
  forumReply: (e) => ({
    title: e.threadTitle ? `Reply in “${e.threadTitle}”` : "Forum reply",
    meta: [e.author].filter(Boolean),
    detail: e.body,
  }),
};

function DeletedRow({ row, onRestore }) {
  const entry = row.entry || {};
  const shape = DELETED_SUMMARY[row.kind];
  const { title, meta, detail } = shape
    ? shape(entry)
    : { title: entry.name || entry.title || "(no title)", meta: [], detail: "" };

  // Restoring does not arm the way deleting does. Putting something back is
  // recoverable — delete it again and it lands here again — and the chart's
  // two-step is reserved for the edits that retyping cannot undo.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onRestore(row);
      // On success the row leaves the archive, and this component with it.
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Panel style={{ padding: 18 }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>{row.ts}</span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "3px 7px",
            background: C.seal,
            color: "#FFFFFF",
          }}
        >
          Deleted
        </span>
        {row.by && (
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
            by {row.by}
          </span>
        )}
        {entry.ts && (
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft }}>
            originally filed {entry.ts}
          </span>
        )}
        <span className="ml-auto">
          <Btn variant="ledger" onClick={restore} disabled={busy}>
            {busy ? "Restoring…" : "Restore"}
          </Btn>
        </span>
      </div>

      {error && (
        <p className="mb-2" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
          {error}
        </p>
      )}

      <h3 style={{ fontFamily: F.display, fontSize: 20, color: C.ink, lineHeight: 1.15 }}>
        {title || "(no title)"}
      </h3>
      {meta.length > 0 && (
        <div className="mt-1" style={{ fontFamily: F.mono, fontSize: 12, color: C.inkSoft }}>
          {meta.join(" · ")}
        </div>
      )}
      {detail && (
        <p
          className="mt-2"
          style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}
        >
          {detail}
        </p>
      )}
      {row.kind === "legalFilings" &&
        Array.isArray(entry.comments) &&
        entry.comments.length > 0 && (
          <p
            className="mt-2"
            style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}
          >
            {entry.comments.length === 1
              ? "1 comment went with it"
              : entry.comments.length + " comments went with it"}
          </p>
        )}
    </Panel>
  );
}

/** Everything that has been removed from the four lists that keep their history. */
function DeletedRecords({ data, onRestore }) {
  const [msg, setMsg] = useState("");
  const rows = [...(data.deleted || [])].reverse();

  const restore = async (row) => {
    const res = await onRestore(row.id);
    setMsg(
      `Restored to ${String(res.label || "the record").toLowerCase()}. It is at the end of the list.`
    );
  };

  const byKind = useMemo(() => {
    const map = new Map(ARCHIVE_KINDS.map((k) => [k, []]));
    for (const row of rows) {
      if (!row) continue;
      if (!map.has(row.kind)) map.set(row.kind, []);
      map.get(row.kind).push(row);
    }
    return map;
  }, [data.deleted]);

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {msg && (
          <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>{msg}</p>
        )}
        <Panel tone="deep" style={{ padding: 20 }}>
          <p style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
            Nothing has been deleted. When somebody removes an application, a
            legal filing, a research file, a client request, a project or a forum
            post, what it said is kept here.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {msg && (
        <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>{msg}</p>
      )}
      {[...byKind.entries()].map(([kind, list]) => (
        <section key={kind}>
          <div className="flex items-baseline gap-3 mb-3">
            <Eyebrow>{archiveLabel(kind)}</Eyebrow>
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.gold }}>
              {list.length}
            </span>
          </div>
          {list.length === 0 ? (
            <p style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft }}>
              None deleted.
            </p>
          ) : (
            <div className="space-y-3">
              {list.map((row) => (
                <DeletedRow key={row.id} row={row} onRestore={restore} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ControlRoom({ data, save, level, session, onRestore }) {
  // Which of the pages past Discord is open, or null for the hub. Deliberately
  // local: the tab itself is in the address, but which editor you last had open
  // is not worth a history entry.
  const [page, setPage] = useState(null);
  const [pricePoint, setPricePoint] = useState({ label: "", price: "" });
  // For the applications page, which shows the account behind each one.
  const accounts = useAccounts(level >= LEVEL.exec);
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
    // Same helper the share page's chief-executive control uses, so the two
    // cannot disagree about what recording a price does.
    save(recordPrice(data, pricePoint.label, pricePoint.price));
    setPricePoint({ label: "", price: "" });
  };

  const sendToDiscord = async (title, body, event) => {
    try {
      const res = await api("/api/discord", {
        method: "POST",
        body: JSON.stringify({ title, body, event }),
      });
      return res.message;
    } catch (e) {
      return e.message;
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
      // Shares the cap with the save route and the bot, from lib/caps.js.
      // Trimming to less here dropped notices a save would have allowed.
    ].slice(0, CAPS.announcements);
    save(next);
    let msg = "Notice published.";
    if (post.toDiscord && post.audience === "public") {
      msg += " " + (await sendToDiscord(post.title, post.body));
    }
    setDiscordState(msg);
    setPost({ ...post, title: "", body: "" });
  };

  /**
   * Everything past Discord, one page each.
   *
   * These used to be stacked under a single "Records" heading — a dozen
   * editors in one column, so reaching the job list meant scrolling past the
   * whole company. Splitting them costs a click and gives each list the
   * screen.
   *
   * Held as data rather than markup so the hub and the page itself cannot
   * drift apart: both read this list.
   */
  const PAGES = [
    {
      key: "company",
      label: "Company details",
      blurb: "Name, ticker, headquarters, tagline and the mission statement.",
      body: (
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
      ),
    },
    {
      key: "divisions",
      label: "Divisions",
      blurb: "The company tree: what sits under what, and what each block does.",
      count: (data.divisions || []).length,
      body: (
        <ListEditor
          title="Divisions and the tree they sit in"
          items={data.divisions}
          blank={{ name: "", code: "", parent: "", lead: "", blurb: "" }}
          onChange={(v) => set("divisions", v)}
          fields={[
            { k: "name", label: "Name" },
            {
              k: "parent",
              label: "Sits under",
              options: ["", ...(data.divisions || []).map((d) => d.name).filter(Boolean)],
              hint: "Leave blank for the top of the chart.",
            },
            {
              k: "code",
              label: "Code",
              hint: "Leave blank for a governing body. Only coded entries count as divisions.",
            },
            // No "Lead" field: nothing renders it any more. Who is in a block
            // comes from the staff list and shows on the People tab. The stored
            // values are left alone rather than stripped, so putting it back is
            // adding this line again and nothing else.
            { k: "blurb", label: "What it does", full: true, rows: 2 },
          ]}
        />
      ),
    },
    {
      key: "staff",
      label: "Staff",
      blurb: "Who works here, their titles, and the block each appears in.",
      count: (data.staff || []).length,
      body: (
        <ListEditor
          title="Staff, and the block each one appears in"
          items={data.staff}
          blank={{ name: "", role: "", dept: "Executive Committee", joined: "", note: "", internal: "" }}
          onChange={(v) => set("staff", v)}
          fields={[
            { k: "name", label: "In-game name" },
            { k: "role", label: "Title" },
            {
              k: "dept",
              label: "Appears in",
              full: true,
              hint:
                "A block on the people chart: " +
                (data.divisions || []).map((d) => d.name).filter(Boolean).join(" · ") +
                ". Separate with commas to appear in more than one.",
            },
            { k: "joined", label: "Joined" },
            { k: "note", label: "Public note", full: true, rows: 2 },
            { k: "internal", label: "Internal note (staff only)", full: true, rows: 2 },
          ]}
        />
      ),
    },
    {
      key: "projects",
      label: "Projects",
      blurb: "What the company is building, and who is allowed to see it.",
      count: (data.projects || []).length,
      body: (
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
      ),
    },
    {
      key: "services",
      label: "Rate card",
      blurb: "What the company charges. Visible to clients and above.",
      count: (data.services || []).length,
      body: (
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
      ),
    },
    {
      key: "financials",
      label: "Financials",
      blurb: "Monthly revenue and costs, and the balance sheet behind them.",
      count: (data.financials?.periods || []).length,
      body: (
        <>
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
          <Panel style={{ padding: 20 }}>
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
        </>
      ),
    },
    {
      key: "requests",
      label: "Client requests",
      blurb: "Anything sent through the client desk, and where it got to.",
      count: (data.requests || []).length,
      body: (
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
      ),
    },
    {
      key: "transactions",
      label: "Transactions",
      blurb: "Deals settled off the chest shops.",
      count: (data.transactions || []).length,
      body: (
        <ListEditor
          title="Transaction log"
          items={data.transactions || []}
          blank={{ ts: "", username: "", type: "", counterparty: "", amount: "", materials: "", detail: "" }}
          onChange={(v) => set("transactions", v)}
          fields={[
            { k: "type", label: "Service rendered" },
            { k: "counterparty", label: "With" },
            { k: "amount", label: "Amount" },
            { k: "materials", label: "Material count" },
            { k: "detail", label: "Detail", full: true, rows: 2 },
          ]}
        />
      ),
    },
    {
      key: "shifts",
      label: "Shift log",
      blurb: "Clocked hours, and what was gathered or done in them.",
      count: (data.shifts || []).length,
      body: (
        <ListEditor
          title="Shift log"
          items={data.shifts || []}
          blank={{ ts: "", username: "", occupation: "", timeIn: "", timeOut: "", output: "" }}
          onChange={(v) => set("shifts", v)}
          fields={[
            { k: "username", label: "In-game name" },
            { k: "occupation", label: "Occupation" },
            { k: "timeIn", label: "Time in" },
            { k: "timeOut", label: "Time out" },
            { k: "output", label: "Resources gathered / services rendered", full: true, rows: 2 },
          ]}
        />
      ),
    },
    {
      key: "applications",
      label: "Applications",
      blurb: "People who have applied to work here, and where each one stands.",
      count: (data.applications || []).length,
      body: (
        <>
          <ListEditor
            title="Applications"
            items={data.applications || []}
            blank={{ ts: "", username: "", discord: "", role: "", wage: "", experience: "", references: "", notes: "", status: "New" }}
            onChange={(v) => set("applications", v)}
            fields={[
              { k: "username", label: "In-game name" },
              { k: "status", label: "Status", options: ["New", "Interviewing", "Hired", "Declined"] },
              { k: "role", label: "Desired role" },
              { k: "wage", label: "Desired wage" },
              { k: "notes", label: "Notes", full: true, rows: 2 },
            ]}
            footer={(a) => (
              <ApplicantAccount
                account={a.account}
                users={accounts.users}
                me={session?.username}
                busy={accounts.busy}
                onPick={accounts.setRole}
              />
            )}
          />
          {accounts.msg && (
            <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>
              {accounts.msg}
            </p>
          )}
        </>
      ),
    },
    {
      key: "legalFilings",
      label: "Legal filings",
      blurb: "What the legal department has filed, and where each one stands.",
      note: "Correcting a filing here does not touch its comments — those are only added from the Legal Department page in the staff room.",
      count: (data.legalFilings || []).length,
      body: (
        <ListEditor
          title="Legal filings"
          items={data.legalFilings || []}
          blank={{
            ts: "",
            kind: LEGAL_KINDS[0],
            title: "",
            party: "",
            reference: "",
            status: LEGAL_STATUS_DEFAULT,
            detail: "",
            author: "",
            comments: [],
          }}
          onChange={(v) => set("legalFilings", v)}
          fields={[
            { k: "title", label: "Title", full: true },
            { k: "kind", label: "Kind", options: LEGAL_KINDS },
            { k: "status", label: "Status", options: LEGAL_STATUSES },
            { k: "party", label: "Other party" },
            { k: "reference", label: "Reference" },
            { k: "detail", label: "Detail", full: true, rows: 3 },
          ]}
          footer={(f) => (
            <p
              className="mb-3"
              style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}
            >
              {(Array.isArray(f.comments) ? f.comments.length : 0) +
                " comment(s)"}
              {f.id ? "" : " · no reference, so it cannot take comments"}
            </p>
          )}
        />
      ),
    },
    {
      key: "research",
      label: "Research files",
      blurb: "Market research, competitor analysis and acquisition targets.",
      note: "The research department files these on its own page in the staff room. Correcting one here does not touch its comments. This page is executive-only like the rest of the control room, but the material is the department's — think twice before pasting any of it anywhere else.",
      count: (data.research || []).length,
      body: (
        <ListEditor
          title="Research files"
          items={data.research || []}
          blank={{
            ts: "",
            kind: RESEARCH_KINDS[0],
            title: "",
            subject: "",
            valuation: "",
            status: RESEARCH_STATUS_DEFAULT,
            detail: "",
            author: "",
            comments: [],
          }}
          onChange={(v) => set("research", v)}
          fields={[
            { k: "title", label: "Title", full: true },
            { k: "kind", label: "Kind", options: RESEARCH_KINDS },
            { k: "status", label: "Status", options: RESEARCH_STATUSES },
            { k: "subject", label: "Subject" },
            { k: "valuation", label: "Figure" },
            { k: "detail", label: "Detail", full: true, rows: 3 },
          ]}
          footer={(f) => (
            <p
              className="mb-3"
              style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}
            >
              {(Array.isArray(f.comments) ? f.comments.length : 0) + " comment(s)"}
              {f.id ? "" : " · no reference, so it cannot take comments"}
            </p>
          )}
        />
      ),
    },
    {
      key: "legalTemplates",
      label: "Legal templates",
      blurb: "The boilerplate the legal department drafts from.",
      note: "The department writes these on its own page; this is where they are corrected or retired. Removing one here is final — templates are not kept in Deleted records.",
      count: (data.legalTemplates || []).length,
      body: (
        <ListEditor
          title="Legal templates"
          items={data.legalTemplates || []}
          blank={{ ts: "", name: "", kind: LEGAL_KINDS[0], body: "", notes: "", author: "" }}
          onChange={(v) => set("legalTemplates", v)}
          fields={[
            { k: "name", label: "Name" },
            { k: "kind", label: "For which kind", options: LEGAL_KINDS },
            { k: "notes", label: "When to use it", full: true, rows: 2 },
            { k: "body", label: "The wording", full: true, rows: 8 },
          ]}
        />
      ),
    },
    {
      key: "jobs",
      label: "Job list",
      blurb: "The server's jobs, as offered on the application form.",
      count: (data.jobs || []).length,
      body: (
        <ListEditor
          title="Job list offered on the application form"
          items={data.jobs || []}
          blank={{ name: "", category: "Trade" }}
          onChange={(v) => set("jobs", v)}
          fields={[
            { k: "name", label: "Job" },
            { k: "category", label: "Category", options: ["Trade", "Profession", "Government", "Licence", "Legal licence"] },
          ]}
        />
      ),
    },
    {
      key: "forum",
      label: "Forum",
      blurb: "Every thread on the boards, and which board it sits in.",
      note: "Moving a thread to a board with a higher access level hides it from anyone below. Removing a thread here takes its replies with it, and forum posts are not kept in Deleted records — closing and removing are usually better done on the thread itself.",
      count: (data.forum || []).length,
      body: (
        <ListEditor
          title="Forum threads"
          items={data.forum || []}
          blank={{ ts: "", board: FORUM_BOARDS[0].key, title: "", body: "", author: "", locked: false, replies: [] }}
          onChange={(v) => set("forum", v)}
          fields={[
            { k: "title", label: "Title", full: true },
            { k: "board", label: "Board", options: FORUM_BOARDS.map((b) => b.key) },
            { k: "author", label: "Posted by" },
            { k: "body", label: "Opening post", full: true, rows: 4 },
          ]}
          footer={(t) => (
            <p
              className="mb-3"
              style={{ fontFamily: F.mono, fontSize: 10.5, color: C.inkSoft }}
            >
              {(Array.isArray(t.replies) ? t.replies.length : 0) + " repl(ies)"}
              {t.locked ? " · closed" : ""}
            </p>
          )}
        />
      ),
    },
    {
      key: "deleted",
      label: "Deleted records",
      blurb:
        "Applications, legal filings, research files, client requests and projects that have been removed.",
      note: "What each one said when it was deleted, newest first. Restore puts it back keeping the date it was originally filed — at the end of its list, except a forum reply, which goes back in sequence in its thread. Restoring a thread brings its replies with it. The last 200 deletions are held, then the oldest fall off.",
      count: (data.deleted || []).length,
      body: <DeletedRecords data={data} onRestore={onRestore} />,
    },
    {
      key: "accounts",
      label: "Accounts",
      blurb: "Everyone who can sign in, and at what level.",
      note: "Remove an account the day someone leaves the company — that is the only thing that actually revokes their access.",
      body: <Accounts session={session} />,
    },
  ];

  const current = PAGES.find((p) => p.key === page);

  if (current) {
    return (
      <div className="space-y-8">
        <Btn onClick={() => setPage(null)}>← Control room</Btn>
        <section>
          <SectionHead title={current.label} note={current.note || current.blurb} />
          {current.body}
        </section>
        <div>
          <Btn onClick={() => setPage(null)}>← Control room</Btn>
        </div>
      </div>
    );
  }

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
          {/* There is deliberately no "push price to Discord" button. Posting a
              notice is the only thing that reaches a webhook, so a price
              announcement goes out as a notice with the figure in it. */}
          <div className="flex gap-3 flex-wrap">
            <Btn variant="ledger" onClick={addPricePoint} disabled={!pricePoint.label.trim() || pricePoint.price === ""}>
              Record the price
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
          note="Add one webhook per channel (Channel settings, Integrations, Webhooks) and a notice goes to all of them. Posting a notice is the only thing on this site that reaches Discord — client requests, shift logs and job applications stay on their boards here. Anyone with executive access can see these URLs, so treat them as shared company secrets and reset any that leak."
        />
        <Panel style={{ padding: 20 }}>
          <ListEditor
            title="Webhooks"
            items={data.discord.hooks || []}
            blank={{ name: "", url: "", channel: "", events: "All posts" }}
            onChange={(v) => set("discord.hooks", v)}
            fields={[
              { k: "name", label: "Label" },
              { k: "events", label: "What it receives", options: HOOK_EVENTS, hint: "Only notices are sent, so both settings behave the same." },
              { k: "url", label: "Webhook URL", full: true },
              { k: "channel", label: "Channel it posts to" },
            ]}
          />
          <div className="grid md:grid-cols-2 gap-x-5">
            <Field label="Server invite" value={data.company.discordInvite} onChange={(v) => set("company.discordInvite", v)} placeholder="https://discord.gg/..." />
            <Field label="Channel shown to visitors" value={data.discord.channel} onChange={(v) => set("discord.channel", v)} />
          </div>
          <Btn
            onClick={async () =>
              setDiscordState(
                await sendToDiscord(
                  "Connection test",
                  "The company site can reach this channel.",
                  "All posts"
                )
              )
            }
          >
            Test every webhook
          </Btn>
          {discordState && (
            <p className="mt-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.inkSoft }}>
              {discordState}
            </p>
          )}
        </Panel>
      </section>

      <section>
        <SectionHead
          index="IV"
          title="The rest of the record"
          note="Each of these opens on its own so you are not scrolling past ten editors to reach the one you want. Everything on them saves the moment you type it."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAGES.map((p) => (
            <Panel key={p.key} raised style={{ padding: 0 }}>
              <button
                type="button"
                onClick={() => setPage(p.key)}
                className="ucc-hub"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 18,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  className="block"
                  style={{ fontFamily: F.display, fontSize: 21, color: C.ink, lineHeight: 1.15 }}
                >
                  {p.label}
                </span>
                <span
                  className="block mt-1"
                  style={{ fontFamily: F.body, fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}
                >
                  {p.blurb}
                </span>
                {typeof p.count === "number" && (
                  <span
                    className="block mt-3"
                    style={{ fontFamily: F.mono, fontSize: 11, color: C.gold, letterSpacing: "0.1em" }}
                  >
                    {p.count} {p.count === 1 ? "entry" : "entries"}
                  </span>
                )}
              </button>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}


/* ----------------------------- sign in ----------------------------- */

function PasswordInput({ label, value, onChange, onEnter, hint }) {
  return (
    <label className="block mb-3">
      <div className="mb-1"><Eyebrow>{label}</Eyebrow></div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={{
          width: "100%",
          fontFamily: F.body,
          fontSize: 14,
          color: C.ink,
          background: "rgba(255,255,255,0.7)",
          border: `1px solid ${C.rule}`,
          padding: "8px 10px",
          outline: "none",
        }}
      />
      {hint && (
        <div style={{ fontFamily: F.body, fontSize: 11.5, color: C.inkSoft, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </label>
  );
}

function Modal({ onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(16,35,63,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-8"
        style={{
          background: C.paper,
          border: `2px solid ${C.ink}`,
          maxWidth: wide ? 560 : 430,
          width: "100%",
        }}
      >
        <Guilloche height={10} />
        {children}
      </div>
    </div>
  );
}

function AuthModal({ onClose, onSignedIn, signupOpen, startMode }) {
  const [mode, setMode] = useState(startMode || "signin");
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";

  const submit = async () => {
    setErr("");
    if (registering && form.password !== form.confirm) {
      setErr("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const session = await api(
        registering ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            username: form.username,
            password: form.password,
          }),
        }
      );
      onSignedIn(session);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ready =
    form.username.trim() &&
    form.password &&
    (!registering || form.confirm);

  return (
    <Modal onClose={onClose}>
      <div className="p-7">
        <Eyebrow color={C.gold}>Access</Eyebrow>
        <h2 className="mt-2" style={{ fontFamily: F.display, fontSize: 30, color: C.ink, lineHeight: 1.05 }}>
          {registering ? "Create an account" : "Sign in"}
        </h2>
        <p className="mt-2" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
          {registering
            ? "A new account can sign in and follow the company. Access to client or staff material is granted separately by an executive."
            : "Clients, staff and executives each get their own account. Everything else on this site is public."}
        </p>

        <div className="mt-5">
          <Field
            label="Minecraft username"
            value={form.username}
            onChange={(v) => { setForm({ ...form, username: v }); setErr(""); }}
            hint={
              registering
                ? "Use your in-game name exactly. Nothing checks it, but payroll and client records are matched by hand against it."
                : null
            }
          />
          <PasswordInput
            label="Password"
            value={form.password}
            onChange={(v) => { setForm({ ...form, password: v }); setErr(""); }}
            onEnter={registering ? undefined : submit}
            hint={registering ? "At least 8 characters. Do not reuse a password from anywhere that matters." : null}
          />
          {registering && (
            <PasswordInput
              label="Password again"
              value={form.confirm}
              onChange={(v) => { setForm({ ...form, confirm: v }); setErr(""); }}
              onEnter={submit}
            />
          )}
        </div>

        {err && (
          <p className="mb-3" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>
            {err}
          </p>
        )}

        <div className="flex gap-3 flex-wrap">
          <Btn variant="solid" onClick={submit} disabled={busy || !ready}>
            {busy ? "Working…" : registering ? "Create account" : "Sign in"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>

        {signupOpen !== false && (
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
            <button
              onClick={() => { setMode(registering ? "signin" : "register"); setErr(""); }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: F.mono,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.ledger,
                textDecoration: "underline",
              }}
            >
              {registering ? "I already have an account" : "Create an account instead"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AccountPage({ session, onSignedOut, onOpenSettings }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/account").then(setProfile).catch((e) => setErr(e.message));
  }, []);

  const change = async () => {
    setErr("");
    setMsg("");
    if (form.newPassword !== form.confirm) {
      setErr("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/account", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      setMsg("Password changed.");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const role = profile?.role || session.role;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead index="I" title="Your account" />
        <Panel style={{ padding: 20 }}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Eyebrow>Username</Eyebrow>
              <div style={{ fontFamily: F.mono, fontSize: 16, color: C.ink, marginTop: 5 }}>
                {session.username}
              </div>
            </div>
            <div>
              <Eyebrow>Access</Eyebrow>
              <div style={{ fontFamily: F.mono, fontSize: 16, color: C.ledger, marginTop: 5 }}>
                {ROLE_NAME[role] || role}
              </div>
            </div>
            <div>
              <Eyebrow>Account opened</Eyebrow>
              <div style={{ fontFamily: F.mono, fontSize: 16, color: C.ink, marginTop: 5 }}>
                {profile?.added || "—"}
              </div>
            </div>
          </div>
          <p className="mt-4" style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6 }}>
            {ROLE_BLURB[role] || "Signed in."}
          </p>
        </Panel>
      </section>

      <section>
        <SectionHead
          index="II"
          title="Change your password"
          note="You need your current password. Nobody at the company can read your old one — not even an executive — so if you have forgotten it, ask for the account to be reissued."
        />
        <Panel style={{ padding: 20, maxWidth: 460 }}>
          <PasswordInput
            label="Current password"
            value={form.currentPassword}
            onChange={(v) => { setForm({ ...form, currentPassword: v }); setErr(""); }}
          />
          <PasswordInput
            label="New password"
            value={form.newPassword}
            onChange={(v) => { setForm({ ...form, newPassword: v }); setErr(""); }}
            hint="At least 8 characters."
          />
          <PasswordInput
            label="New password again"
            value={form.confirm}
            onChange={(v) => { setForm({ ...form, confirm: v }); setErr(""); }}
            onEnter={change}
          />
          <div className="flex items-center gap-4 flex-wrap">
            <Btn
              variant="solid"
              onClick={change}
              disabled={busy || !form.currentPassword || form.newPassword.length < 8}
            >
              {busy ? "Saving…" : "Change password"}
            </Btn>
            {msg && <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ledger }}>{msg}</span>}
            {err && <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.seal }}>{err}</span>}
          </div>
        </Panel>
      </section>

      <section>
        <SectionHead index="III" title="This session" />
        <div className="flex gap-3 flex-wrap">
          <Btn onClick={onOpenSettings}>Open settings</Btn>
          <Btn variant="seal" onClick={onSignedOut}>Sign out</Btn>
        </div>
        <p className="mt-4 max-w-xl" style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.6 }}>
          Signing in lasts a week on this device. If you have signed in
          somewhere you do not control, sign out there rather than relying on
          it expiring.
        </p>
      </section>
    </div>
  );
}

function SettingsModal({ onClose, session, data, save, prefs, setPrefs, onGoAccount, onSignOut, onSignIn }) {
  const level = LEVEL[session.role] ?? 0;
  const settings = data?.settings || {};

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  const updateCompany = (patch) => {
    save({ ...data, settings: { ...settings, ...patch } });
  };

  const Toggle = ({ label, note, checked, onChange }) => (
    <label className="flex items-start gap-3 py-3" style={{ borderTop: `1px solid ${C.paperLine}`, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ fontFamily: F.body, fontSize: 14, color: C.ink }}>{label}</span>
        {note && (
          <span className="block" style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
            {note}
          </span>
        )}
      </span>
    </label>
  );

  return (
    <Modal onClose={onClose} wide>
      <div className="p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow color={C.gold}>Settings</Eyebrow>
            <h2 className="mt-2" style={{ fontFamily: F.display, fontSize: 28, color: C.ink, lineHeight: 1.05 }}>
              {session.username || "Preferences"}
            </h2>
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>

        <div className="mt-6">
          <Eyebrow>Display</Eyebrow>
          <Toggle
            label="Show figures in full"
            note="$1,680,000 instead of $1.68M, everywhere on the site."
            checked={prefs.fullFigures}
            onChange={(v) => update({ fullFigures: v })}
          />
          <label className="block pt-3" style={{ borderTop: `1px solid ${C.paperLine}` }}>
            <div className="mb-1"><Eyebrow>Open on this tab</Eyebrow></div>
            <select
              value={prefs.landingTab}
              onChange={(e) => update({ landingTab: e.target.value })}
              style={{
                width: "100%",
                fontFamily: F.body,
                fontSize: 14,
                color: C.ink,
                background: "rgba(255,255,255,0.7)",
                border: `1px solid ${C.rule}`,
                padding: "8px 10px",
                outline: "none",
              }}
            >
              {["Overview", "Share", "Financials", "People", "Projects"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div style={{ fontFamily: F.body, fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
              Saved on this device only.
            </div>
          </label>
        </div>

        <div className="mt-8">
          <Eyebrow>Account</Eyebrow>
          {session.username ? (
            <>
              <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${C.paperLine}` }}>
                <span style={{ fontFamily: F.mono, fontSize: 13.5, color: C.ink }}>
                  {session.username}
                </span>
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9.5,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    padding: "3px 7px",
                    color: C.paper,
                    background:
                      session.role === "exec" ? C.seal : session.role === "staff" ? C.ledger : C.inkSoft,
                  }}
                >
                  {ROLE_NAME[session.role]}
                </span>
              </div>
              <div className="flex gap-3 flex-wrap mt-1">
                <Btn onClick={onGoAccount}>Change password</Btn>
                <Btn variant="seal" onClick={onSignOut}>Sign out</Btn>
              </div>
            </>
          ) : (
            <div className="flex gap-3 flex-wrap pt-3" style={{ borderTop: `1px solid ${C.paperLine}` }}>
              <Btn variant="solid" onClick={onSignIn}>Sign in or create an account</Btn>
            </div>
          )}
        </div>

        {level >= LEVEL.exec && (
          <div className="mt-8">
            <Eyebrow color={C.seal}>Company — executives only</Eyebrow>
            <Toggle
              label="Let anyone create an account"
              note="Turn this off and only executives can make accounts, from the control room."
              checked={settings.signupOpen !== false}
              onChange={(v) => updateCompany({ signupOpen: v })}
            />
            <label className="block pt-3" style={{ borderTop: `1px solid ${C.paperLine}` }}>
              <div className="mb-1"><Eyebrow>New accounts start as</Eyebrow></div>
              <select
                value={settings.signupRole || "member"}
                onChange={(e) => updateCompany({ signupRole: e.target.value })}
                style={{
                  width: "100%",
                  fontFamily: F.body,
                  fontSize: 14,
                  color: C.ink,
                  background: "rgba(255,255,255,0.7)",
                  border: `1px solid ${C.rule}`,
                  padding: "8px 10px",
                  outline: "none",
                }}
              >
                <option value="member">Member — signed in, sees only public material</option>
                <option value="client">Client — rate card, client projects, request desk</option>
              </select>
              <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                Leave this on Member unless you genuinely want any stranger who
                signs up to see client material. Promoting people one at a time
                in the control room is the safer habit.
              </div>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------- app ----------------------------- */

export default function App() {
  const [data, setData] = useState(null);
  const [session, setSession] = useState({ username: null, role: "public" });
  const [tab, setTab] = useState("Overview");
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [status, setStatus] = useState("Loading the company record…");

  const role = session.role || "public";
  FULL_FIGURES = Boolean(prefs.fullFigures);

  // Skips the first run of the effect below, so restoring the tab from the
  // address bar is not immediately overwritten by the tab we started on.
  const settled = useRef(false);

  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    FULL_FIGURES = Boolean(p.fullFigures);

    // The address wins over the landing preference. Somebody following a link
    // to a tab, or refreshing on one, means that tab — the preference is only
    // about where a plain visit starts.
    const fromUrl = tabFromHash();
    if (fromUrl) setTab(fromUrl);
    else if (p.landingTab) setTab(p.landingTab);
  }, []);

  // Keep the address on whatever is showing. Pushing rather than replacing
  // means the browser's back button walks back through the tabs, which is what
  // anyone who used them as links will expect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const want = "#" + slugOf(tab);
    if (window.location.hash !== want) {
      window.history.pushState(null, "", want);
    }
  }, [tab]);

  // The listener below is attached once, so it would otherwise close over the
  // session as it was at mount — signed out forever, whatever happened since.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Back and forward move between tabs rather than off the site.
  useEffect(() => {
    const onPop = () => {
      const t = tabFromHash();
      if (!t) return;
      // By the time anything can be navigated the session is known, so this
      // can refuse the account tab outright rather than leaving the effect
      // below to clean up after a blank render.
      if (t === ACCOUNT_TAB && !sessionRef.current?.username) {
        // Correct the address as well. Setting the tab alone may be a no-op if
        // the overview was already showing, and then the effect that syncs the
        // hash never runs, leaving `#account` above the overview. Replace
        // rather than push: this is a correction, not somewhere to go back to.
        window.history.replaceState(null, "", "#overview");
        setTab("Overview");
        return;
      }
      setTab(t);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api("/api/data");
      setData(res.data);
      setSession(res.session);
      setStatus("");
    } catch (e) {
      setStatus(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Executives only. The server rejects this from anyone else.
  const save = useCallback(async (next) => {
    setData(next);
    try {
      await api("/api/data", { method: "PUT", body: JSON.stringify(next) });
    } catch (e) {
      setStatus(e.message);
    }
  }, []);

  const onSignedIn = useCallback(
    async (s) => {
      setSession(s);
      setShowSignIn(false);
      await load();
    },
    [load]
  );

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession({ username: null, role: "public" });
    setShowSettings(false);
    setTab(prefs.landingTab || "Overview");
    await load();
  }, [load, prefs.landingTab]);

  /**
   * The share register. Its own route rather than a page save, because
   * `shareholders` is not in `EDITABLE` and /api/shareholders is the only thing
   * that may write it — chief executive only, checked there.
   *
   * It does not set the record optimistically the way `save` does: the server
   * mints ids for new holders and cleans the rows, so the reload is what brings
   * back the register as it was actually stored.
   */
  const saveRegister = useCallback(
    async (payload) => {
      await api("/api/shareholders", {
        method: "POST",
        body: JSON.stringify({ action: "save", ...payload }),
      });
      await load();
    },
    [load]
  );

  const submitRequest = useCallback(
    async (req) => {
      await api("/api/requests", { method: "POST", body: JSON.stringify(req) });
      await load();
    },
    [load]
  );

  const submitShift = useCallback(
    async (shift) => {
      await api("/api/shifts", { method: "POST", body: JSON.stringify(shift) });
      await load();
    },
    [load]
  );

  const submitTransaction = useCallback(
    async (entry) => {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify(entry),
      });
      await load();
    },
    [load]
  );

  const submitApplication = useCallback(
    async (application) => {
      await api("/api/applications", {
        method: "POST",
        body: JSON.stringify(application),
      });
      await load();
    },
    [load]
  );

  // Both filing a document and commenting on one go through here — the route
  // takes an `action`, the way the shift log does.
  const submitLegal = useCallback(
    async (payload) => {
      await api("/api/legal", { method: "POST", body: JSON.stringify(payload) });
      await load();
    },
    [load]
  );

  // The research department's files, the same shape as the legal route.
  const submitResearch = useCallback(
    async (payload) => {
      await api("/api/research", { method: "POST", body: JSON.stringify(payload) });
      await load();
    },
    [load]
  );

  // Threads, replies, and an executive's moderation all go through here — the
  // route takes an `action`, the way the legal department does.
  const submitForum = useCallback(
    async (payload) => {
      await api("/api/forum", { method: "POST", body: JSON.stringify(payload) });
      await load();
    },
    [load]
  );

  // Puts a deleted row back. Returns the route's answer so the page can name
  // the list it went to.
  const restoreDeleted = useCallback(
    async (id) => {
      const res = await api("/api/archive", {
        method: "POST",
        body: JSON.stringify({ action: "restore", id }),
      });
      await load();
      return res;
    },
    [load]
  );

  const level = LEVEL[role] ?? 0;

  const tabs = useMemo(
    () => [
      ...TABS,
      ...(session.username
        ? [{ name: ACCOUNT_TAB, label: session.username, min: 0 }]
        : []),
    ],
    [session.username]
  );

  // The backstop for the one case the listener cannot cover: a cold load
  // straight onto `#account`, where the session is not known until the record
  // arrives. Waiting for `data` is what lets a signed-in refresh stay put
  // instead of being bounced to the overview.
  useEffect(() => {
    if (data && tab === ACCOUNT_TAB && !session.username) setTab("Overview");
  }, [data, tab, session.username]);

  if (!data) {
    return (
      <div
        className="ucc-screen-min flex items-center justify-center"
        style={{ background: C.night }}
      >
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 12,
            letterSpacing: "0.2em",
            color: C.nightSoft,
          }}
        >
          {status.toUpperCase()}
        </span>
      </div>
    );
  }

  const s = data.stock;
  const change = s.price - s.prevClose;
  const up = change >= 0;

  return (
    <div className="ucc-screen-min" style={{ background: C.paper }}>
      {/* ticker rail */}
      <div style={{ background: C.nightDeep, color: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
          {[
            [data.company.ticker, "$" + dec(s.price)],
            ["CHG", (up ? "+" : "") + dec(change)],
            ["CAP", compact(s.price * s.shares)],
            ["EXCH", data.company.exchange],
          ].map(([k, v], i) => (
            <span key={i} style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em" }}>
              <span style={{ color: C.nightSoft }}>{k}</span>{" "}
              <span style={{ color: i === 1 ? (up ? C.ledgerUp : C.sealDown) : "#FFFFFF" }}>
                {v}
              </span>
            </span>
          ))}
          <span
            className="ml-auto"
            style={{ fontFamily: F.mono, fontSize: 10.5, color: C.nightSoft }}
          >
            {(session.username ? session.username + " · " : "") + ROLE_NAME[role].toUpperCase()}
          </span>
        </div>
      </div>

      {/* masthead */}
      <header
        className="sticky top-0 z-40"
        style={{ background: C.night, borderBottom: `1px solid ${C.nightLine}` }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => setTab("Overview")}
            className="text-left min-w-0 flex items-center gap-3"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <Seal ticker={data.company.ticker} size={34} tone="dark" />
            <span className="min-w-0" style={{ overflow: "hidden" }}>
              <span
                className="block ucc-masthead-name"
                style={{
                  fontFamily: F.display,
                  fontSize: 20,
                  color: "#FFFFFF",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                }}
              >
                United Commerce
              </span>
              <span
                className="block ucc-masthead-hq"
                style={{
                  fontFamily: F.mono,
                  fontSize: 9.5,
                  letterSpacing: "0.18em",
                  color: C.goldBright,
                  marginTop: 3,
                }}
              >
                {data.company.hq.toUpperCase()}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2 shrink-0 ucc-masthead-actions">
            {data.company.discordInvite && (
              <a href={data.company.discordInvite} target="_blank" rel="noreferrer">
                <Btn variant="light">Discord</Btn>
              </a>
            )}
            <Btn
              variant="light"
              onClick={() => setShowSettings(true)}
              style={{ padding: "11px 13px" }}
            >
              <span aria-hidden="true">⚙</span>
              <span className="sr-only"> Settings</span>
            </Btn>
            {session.username ? (
              <Btn variant="light" onClick={() => setTab("Account")}>
                {session.username}
              </Btn>
            ) : (
              <Btn variant="gold" onClick={() => setShowSignIn(true)}>
                Sign in
              </Btn>
            )}
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 overflow-x-auto ucc-nav-scroll">
          <div className="flex gap-6 ucc-nav-row" style={{ whiteSpace: "nowrap" }}>
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
                    padding: "10px 0",
                    cursor: "pointer",
                    fontFamily: F.mono,
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: tab === t.name ? "#FFFFFF" : C.nightSoft,
                    borderBottom:
                      tab === t.name ? `2px solid ${C.gold}` : "2px solid transparent",
                  }}
                >
                  {t.label || t.name}
                </button>
              ))}
          </div>
        </nav>
      </header>

      {/* The hero is full-bleed, so it sits outside the page column. */}
      {tab === "Overview" && <Hero data={data} />}

      <main className="max-w-6xl mx-auto px-4 py-10 md:py-16">
        {tab === "Overview" && (
          <Overview
            data={data}
            level={level}
            session={session}
            onSubmitApplication={submitApplication}
            onSignIn={() => setShowSignIn(true)}
          />
        )}
        {tab === "Share" && (
          <ShareSection
            data={data}
            level={level}
            save={save}
            saveRegister={saveRegister}
          />
        )}
        {tab === "Financials" && <Financials data={data} level={level} />}
        {tab === "People" && <People data={data} level={level} save={save} />}
        {tab === "Projects" && <Projects data={data} level={level} />}
        {tab === "Client desk" && (
          <ClientDesk data={data} level={level} onSubmitRequest={submitRequest} />
        )}
        {tab === "Staff room" && (
          <StaffRoom
            data={data}
            level={level}
            session={session}
            onSubmitShift={submitShift}
            onSubmitTransaction={submitTransaction}
            onSubmitLegal={submitLegal}
            onSubmitResearch={submitResearch}
          />
        )}
        {tab === "Control room" && (
          <ControlRoom
            data={data}
            level={level}
            save={save}
            session={session}
            onRestore={restoreDeleted}
          />
        )}
        {tab === "UCC Forum" && (
          <Forum
            data={data}
            level={level}
            session={session}
            onSubmitForum={submitForum}
            onSignIn={() => setShowSignIn(true)}
          />
        )}
        {tab === "Account" && session.username && (
          <AccountPage
            session={session}
            onSignedOut={signOut}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </main>

      <footer style={{ background: C.nightDeep, color: "#FFFFFF" }}>
        <Guilloche height={8} tone="dark" />
        <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col md:flex-row justify-between gap-8">
          <div className="flex items-start gap-4">
            <Seal ticker={data.company.ticker} size={44} tone="dark" />
            <div>
              <div
                style={{
                  fontFamily: F.display,
                  fontSize: 20,
                  color: "#FFFFFF",
                  letterSpacing: "-0.01em",
                }}
              >
                {data.company.name}
              </div>
              <p
                className="mt-2 max-w-md"
                style={{
                  fontFamily: F.body,
                  fontSize: 13,
                  color: C.nightSoft,
                  lineHeight: 1.6,
                }}
              >
                A roleplay company on DemocracyCraft ({data.company.serverIp}).
                Figures are in-game currency and mean nothing outside the server.
              </p>
            </div>
          </div>
          <div className="text-left md:text-right shrink-0">
            <Eyebrow color={C.nightSoft}>Filed by</Eyebrow>
            <div
              style={{ fontFamily: F.mono, fontSize: 12.5, color: "#FFFFFF", marginTop: 5 }}
            >
              Office of the Chief Executive
            </div>
            <div
              style={{ fontFamily: F.mono, fontSize: 11.5, color: C.nightSoft, marginTop: 3 }}
            >
              Last price posted {s.updated}
            </div>
          </div>
        </div>
      </footer>

      {showSignIn && (
        <AuthModal
          onClose={() => setShowSignIn(false)}
          onSignedIn={onSignedIn}
          signupOpen={data.settings?.signupOpen !== false}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          session={session}
          data={data}
          save={save}
          prefs={prefs}
          setPrefs={setPrefs}
          onGoAccount={() => { setShowSettings(false); setTab("Account"); }}
          onSignOut={signOut}
          onSignIn={() => { setShowSettings(false); setShowSignIn(true); }}
        />
      )}
    </div>
  );
}
