"use client";

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


const LEVEL = { public: 0, member: 0, client: 1, staff: 2, exec: 3 };
const ROLE_NAME = {
  public: "Visitor",
  member: "Member",
  client: "Client",
  staff: "Staff",
  exec: "Executive",
};
const ROLE_BLURB = {
  member: "You have an account, but no company access yet. An executive can raise it.",
  client: "You can see the rate card, client projects and the request desk.",
  staff: "You can see the balance sheet, internal notes and incoming requests.",
  exec: "You can edit the company record and manage accounts.",
};

const ROLE_TABS = [
  { key: "member", label: "Member", hint: "Signed in, sees only public material" },
  { key: "client", label: "Client", hint: "Rate card, client projects, request desk" },
  { key: "staff", label: "Staff", hint: "Balance sheet, internal notes, requests" },
  { key: "exec", label: "Exec", hint: "Full control of the company record" },
];

// Mirrors HOOK_EVENTS in lib/discord.js. Kept as its own copy so the server's
// posting code stays out of the browser bundle — if you add an event there,
// add it here too.
const HOOK_EVENTS = [
  "All posts",
  "Announcements",
  "Client requests",
  "Shift log",
];

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
                [data.divisions.length, "divisions"],
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
          title="The four trades"
          note="Each division keeps its own books and reports into the executive."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {data.divisions.map((d) => (
            <Panel
              key={d.code}
              raised
              style={{ padding: 24, display: "flex", flexDirection: "column" }}
            >
              {/* Codes run to five or six characters, so this has to size to
                  its text rather than sit in a fixed square. */}
              <div
                className="inline-block mb-5 self-start"
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
                  fontSize: 27,
                  lineHeight: 1.1,
                  color: C.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                {d.name}
              </h3>
              <p
                className="mt-3 flex-1"
                style={{
                  fontFamily: F.body,
                  fontSize: 14,
                  color: C.inkSoft,
                  lineHeight: 1.6,
                }}
              >
                {d.blurb}
              </p>
              <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <Eyebrow>Lead</Eyebrow>
                <div
                  style={{
                    fontFamily: F.mono,
                    fontSize: 13,
                    color: C.ink,
                    marginTop: 4,
                  }}
                >
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
  const equity = data.financials.equity || 0;
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

/**
 * Clock in and out. One completed shift per submission — the times are typed
 * rather than stamped from the clock, because people log the shift after they
 * have finished working, not while they are stood at the keyboard.
 */
function ShiftModal({ onClose, onSubmit, session, data }) {
  const [form, setForm] = useState({
    username: session?.username || "",
    occupation: "",
    timeIn: "",
    timeOut: "",
    output: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready =
    form.username.trim() &&
    form.occupation.trim() &&
    form.timeIn.trim() &&
    form.timeOut.trim();

  // Roles people actually hold, offered as a starting point rather than a
  // fixed list — the divisions change and the staff table is the record.
  const occupations = useMemo(() => {
    const fromStaff = (data?.staff || []).map((s) => s.role).filter(Boolean);
    const fromDivisions = (data?.divisions || []).map((d) => d.name).filter(Boolean);
    return Array.from(new Set([...fromStaff, ...fromDivisions, "Other"]));
  }, [data]);

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
      <Eyebrow color={C.gold}>Shift log</Eyebrow>
      <h2
        className="mt-2 mb-1"
        style={{ fontFamily: F.display, fontSize: 30, color: C.ink }}
      >
        Clock in and out
      </h2>
      <p
        className="mb-5"
        style={{ fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}
      >
        Payroll is worked out from this log. If it is not logged, it is not paid.
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
        <Field
          label="Time in"
          value={form.timeIn}
          onChange={(v) => setForm({ ...form, timeIn: v })}
          placeholder="18:00"
        />
        <Field
          label="Time out"
          value={form.timeOut}
          onChange={(v) => setForm({ ...form, timeOut: v })}
          placeholder="21:30"
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
        <Btn variant="solid" onClick={submit} disabled={!ready || busy}>
          {busy ? "Filing…" : "File the shift"}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function StaffRoom({ data, level, session, onSubmitShift }) {
  const [showShift, setShowShift] = useState(false);
  const [filed, setFiled] = useState(false);

  if (level < LEVEL.staff) {
    return (
      <div>
        <SectionHead index="I" title="Staff room" note="Company staff only." />
        <LockedNote what="the internal board and incoming client requests" who="staff and executives" />
      </div>
    );
  }

  const shifts = [...(data.shifts || [])].reverse();

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
            {
              t: "Log every shift",
              d: "Clock in and out here when you finish. Payroll comes off that log.",
              action: "Clock in / out",
            },
            { t: "Price from the card", d: "Do not undercut the rate card without an executive on the message." },
            { t: "Books before boasts", d: "No figure goes public until it is on this site." },
            { t: "One buyer, one contact", d: "Whoever opened the account keeps it. Hand over in writing." },
          ].map(({ t, d, action }) => (
            <Panel key={t} style={{ padding: 18, display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontFamily: F.display, fontSize: 21, color: C.ink }}>{t}</h3>
              <p
                className="mt-2 flex-1"
                style={{ fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}
              >
                {d}
              </p>
              {action && (
                <div className="mt-4 flex items-center gap-3">
                  <Btn
                    variant="solid"
                    onClick={() => {
                      setFiled(false);
                      setShowShift(true);
                    }}
                  >
                    {action}
                  </Btn>
                  {filed && (
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.ledger }}>
                      Shift filed.
                    </span>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <SectionHead
          index="III"
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
                    {sh.timeIn} → {sh.timeOut}
                  </span>
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

      {showShift && (
        <ShiftModal
          onClose={() => setShowShift(false)}
          onSubmit={async (form) => {
            await onSubmitShift(form);
            setFiled(true);
          }}
          session={session}
          data={data}
        />
      )}
    </div>
  );
}

/* ----------------------------- control room ----------------------------- */

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
              <div className="flex" style={{ border: `1px solid ${C.rule}` }}>
                {ROLE_TABS.map((r, i) => {
                  const active = u.role === r.key;
                  const locked = u.username === me;
                  return (
                    <button
                      key={r.key}
                      onClick={() => {
                        if (!active && !locked) setRole(u.username, r.key);
                      }}
                      disabled={locked || busyUser === u.username}
                      title={
                        locked
                          ? "You cannot change your own access level"
                          : r.hint
                      }
                      style={{
                        fontFamily: F.mono,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        padding: "6px 11px",
                        border: "none",
                        borderRight:
                          i < ROLE_TABS.length - 1 ? `1px solid ${C.rule}` : "none",
                        cursor: locked ? "not-allowed" : active ? "default" : "pointer",
                        opacity: locked ? 0.45 : 1,
                        background: active
                          ? r.key === "exec"
                            ? C.seal
                            : r.key === "staff"
                            ? C.ledger
                            : r.key === "client"
                            ? C.ink
                            : C.inkSoft
                          : "transparent",
                        color: active ? C.paper : C.inkSoft,
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
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
          options={["member", "client", "staff", "exec"]}
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

function ControlRoom({ data, save, level, session }) {
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
          note="Add one webhook per channel (Channel settings, Integrations, Webhooks). Each one takes only the posts you point at it, so the shift log does not have to land in the announcements channel. Anyone with executive access can see these URLs, so treat them as shared company secrets and reset any that leak."
        />
        <Panel style={{ padding: 20 }}>
          <ListEditor
            title="Webhooks"
            items={data.discord.hooks || []}
            blank={{ name: "", url: "", channel: "", events: "All posts" }}
            onChange={(v) => set("discord.hooks", v)}
            fields={[
              { k: "name", label: "Label" },
              { k: "events", label: "What it receives", options: HOOK_EVENTS },
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
      </section>

      <section>
        <SectionHead
          index="VI"
          title="Accounts"
          note="Everyone who can sign in. Remove an account the day someone leaves the company — that is the only thing that actually revokes their access."
        />
        <Accounts session={session} />
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
            label="Username"
            value={form.username}
            onChange={(v) => { setForm({ ...form, username: v }); setErr(""); }}
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

  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    FULL_FIGURES = Boolean(p.fullFigures);
    if (p.landingTab) setTab(p.landingTab);
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
      ...(session.username
        ? [{ name: "Account", label: session.username, min: 0 }]
        : []),
    ],
    [session.username]
  );

  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
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
    <div style={{ background: C.paper, minHeight: "100vh" }}>
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
            <span className="min-w-0">
              <span
                className="block"
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
                className="block"
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
          <div className="flex items-center gap-2 shrink-0">
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
        <nav className="max-w-6xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-6" style={{ whiteSpace: "nowrap" }}>
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
        {tab === "Overview" && <Overview data={data} level={level} />}
        {tab === "Share" && <ShareSection data={data} level={level} />}
        {tab === "Financials" && <Financials data={data} level={level} />}
        {tab === "People" && <People data={data} level={level} />}
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
          />
        )}
        {tab === "Control room" && <ControlRoom data={data} level={level} save={save} session={session} />}
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
