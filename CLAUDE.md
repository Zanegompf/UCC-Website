# CLAUDE.md — United Commerce Corporation site

Context for Claude Code working in this repo. Read this before changing anything.

## What this is

The corporate website and Discord bot for **The United Commerce Corporation
(UCC)**, a roleplay company on the **DemocracyCraft** Minecraft server. It is
fiction: all currency is in-game, all figures are made up by the operator. It is
not a real financial product and must never present itself as one.

Audiences, in order of size: public visitors, contracted clients, company staff,
executives. Owner/operator is `Zanegompf` (in-game and GitHub).

Repo: `Zanegompf/UCC-Website`. Hosting: Vercel. Bot host: Railway.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 14.2.35, App Router, **JavaScript not TypeScript** | Operator is not a professional dev; JS lowers the barrier |
| Styling | Tailwind for layout, inline `style` for colour/type | No Tailwind config colours; the palette lives in a `C` object in `app/Site.jsx` |
| Charts | recharts | |
| Store | Upstash Redis over REST, **one JSON blob** at key `ucc:company:v1` | No schema, no migrations, no ORM |
| Auth | bcryptjs + `jose` JWT in an http-only cookie | |
| Bot | discord.js 14, separate process | |

**Do not upgrade Next to 15+** without editing `lib/auth.js` first: Next 15 made
`cookies()` async and every call here is synchronous.

## File map

```
app/
  Site.jsx          ~2600 lines, one "use client" component tree — the whole UI
  page.jsx          server component, renders <Site/>
  layout.jsx        html shell, metadata
  globals.css       font @import, tailwind directives, focus + hover styles
                    (.ucc-btn-*, .ucc-raise — inline style cannot do :hover)
  api/
    data/           GET filtered record, PUT full record (exec only)
    auth/login/     POST username+password -> session cookie
    auth/logout/    POST
    auth/register/  POST public sign-up (role comes from settings, never the body)
    account/        GET own profile, POST change own password
    users/          GET list, POST create/replace, PATCH role only, DELETE (all exec)
    requests/       POST client desk submission
    shifts/         POST clock in / clock out (staff+), body.action "in" | "out"
    transactions/   POST a deal done off the chest shops (staff+)
    applications/   POST job application (any signed-in account, incl. member)
    discord/        POST server-side webhook relay (exec only)
    bot/            GET/POST for the Discord bot, x-bot-key auth
    session/        GET who am I — role resolved from the record, not the cookie
lib/
  store.js          Upstash REST get/set, plus redis() for guard.js counters
  seed.js           SEED record + ensureData() first-run/migration
  auth.js           hash, verify, session cookie
  roles.js          LEVEL, ASSIGNABLE_ROLES, filterData(), effectiveRole()
  guard.js          rate limits, client IP, CSRF check, body caps, safeEqual
  discord.js        webhook fan-out. Several hooks, each routed by `events`
bot/
  index.js          slash commands, talks only to /api/bot
```

## The one rule that matters

**Permissions are enforced server-side, in `lib/roles.js`, before data leaves the
process.** The UI mirrors the decision; it never makes it.

- `filterData(data, level)` strips: `users` and `codes` always; the balance
  sheet, internal staff notes, client requests and the shift log below staff;
  the rate card below client; the Discord webhooks **and job applications**
  below exec; plus projects and announcements whose `visibility` / `audience`
  outranks the viewer.
- `jobs` is deliberately **public**: the application form on the front page has
  to render its dropdown for people who do not work here yet.
- Below exec it **replaces `discord` wholesale** with `{channel}` rather than
  deleting named keys. That is what keeps every URL in `hooks[]` off the wire as
  the list grows — do not soften it into `delete d.discord.webhook`.
- It always computes and attaches `financials.assets` and `financials.equity`,
  because public-facing stat cards need the totals without the breakdown.
- `effectiveRole(data, session)` reads the role from the **stored account**, not
  from the JWT. This is deliberate and load-bearing: cookies live a week, so
  trusting the role inside one meant a demoted or deleted user kept their access
  until it expired. Every privileged route calls it.

If you add a route that gates on role, use `effectiveRole`, never
`session.role`. If you add a field to the record, decide its visibility in
`filterData` **and** add it to `EDITABLE` in `app/api/data/route.js` in the same
commit — miss the second and the field silently vanishes on every save.

## Request-side hardening

`lib/roles.js` decides *what* a caller may see or change. `lib/guard.js` decides
whether the request gets that far at all. It is not a substitute for the above.

| Route | Limit | Counts |
|---|---|---|
| login | 10 / 10 min per IP, 25 / 15 min per username | failures only |
| register | 5 / hour per IP | all |
| password change | 10 / 15 min | failures only |
| client desk | 10 / hour per account | all |
| shift log | 30 / hour per account | all |
| transactions | 30 / hour per account | all |
| applications | 5 / hour per account | all |
| Discord relay | 20 / hour per account | all |
| bot key | 10 / 10 min per IP | wrong keys only |

Counters live in the same Upstash database under short-lived `ucc:rl:*` keys,
deliberately **not** inside the company record — that record is read, modified
and written whole, so counting sign-in attempts in it would mean a full rewrite
per attempt.

Sign-in counts failures only, via `peekLimit`/`bumpLimit` rather than
`rateLimit`. Counting every attempt and clearing on success would let anyone
holding one valid account burn guesses at somebody else's, sign into their own
to wipe the counter, and go again.

Also enforced: a decoy bcrypt compare on unknown usernames so response time does
not reveal which accounts exist; `crossSite()` refusal on mutating routes (a
**missing** `Origin` is allowed, so curl and the bot keep working); body caps of
2KB auth / 8KB posts / 1MB record; timing-safe bot-key compare.

`clientIp()` prefers `x-real-ip`, which Vercel sets and a client cannot spoof.
`x-forwarded-for` is read **last entry first** for the same reason. Revisit both
if the site ever moves off Vercel.

## Roles

`public: 0, member: 0, client: 1, staff: 2, exec: 3, ceo: 4`

`ceo` sees exactly what an executive sees — every `filterData` gate is
`>= LEVEL.exec`, which it clears — and adds one thing: unlocking the people
chart to edit it in place.

**Only a chief executive may seat or unseat another**, on PATCH, DELETE and the
wholesale POST. The one exception is bootstrapping: where the company has no
`ceo`, an executive may appoint the first, or a record predating the role could
never gain one. `ensureData()` also seats `OWNER_ACCOUNT` (`beast_sd`) whenever
that account exists and no seat is taken — it runs every load rather than once,
because the account may be created after this shipped.

The "last executive" guard counts anyone at `exec` **or above**, so a company
whose only privileged account is the chief executive is not treated as locked
out of itself.

`member` is a signed-in account with visitor-level sight. Self-registration
creates one. This is the safe default: making an account should not hand a
stranger the rate card or the client project list. `settings.signupRole` can be
switched to `client`, and `settings.signupOpen` closes registration entirely —
both from Settings → Company, exec only.

Guardrails in `api/users` PATCH/DELETE, both intentional:
- nobody can change or delete **their own** account's level
- the **last exec** cannot be demoted or removed

## Data record shape

One object. Everything hangs off it.

```
company{name,short,ticker,exchange,founded,hq,ceo,tagline,mission,discordInvite,serverIp}
divisions[]{name,code,parent,lead,blurb}          <- a tree; see below
stock{price,prevClose,shares,listed,updated,history[]{label,price}}
financials{periods[]{label,revenue,expenses}, balance{cash,inventory,property,investments,liabilities}, note}
staff[]{name,role,dept,joined,note,internal}    <- dept: comma-separated block names
projects[]{name,status,visibility,progress,target,summary}
services[]{name,price,detail}
announcements[]{ts,author,audience,title,body}
requests[]{ts,from,contact,type,detail,status,account}
shifts[]{ts,username,occupation,timeIn,timeOut,output,account}  <- empty timeOut = open
transactions[]{ts,username,type,counterparty,amount,materials,detail,account}
applications[]{ts,username,discord,role,wage,experience,references,notes,status,account}
jobs[]{name,category}                              <- public; the dropdown reads it
discord{webhook,channel,guild,hooks[]{name,url,channel,events}}
users[]{username,role,passwordHash,added,self}     <- never sent to a client
settings{signupOpen,signupRole}
```

`PUT /api/data` merges `{...current, ...incoming, users: current.users}` — page
saves can never clobber accounts. Account changes go through `/api/users` only.

`ensureData()` seeds on first run and back-fills missing keys (`users`,
`settings`, `shifts`, `discord.hooks`) for records written by older versions.
Add migrations there.

**Webhooks are a list.** `discord.hooks[]` holds one entry per channel, each
with an `events` value from `HOOK_EVENTS` in `lib/discord.js` — a post only
reaches the hooks that asked for its kind, so the shift log does not land in
the announcements channel. `"All posts"` on a hook means it takes everything;
passing `"All posts"` *as the event* is a broadcast to every hook, which is
what the control room's test button uses.

## Tabs and the address bar

Each tab is a slug in the URL hash — `#staff-room`, `#client-desk` — so a
refresh, a bookmark or a pasted link all land on the same tab instead of
dropping back to the overview. `TABS` in `Site.jsx` is the single source for the
names, their slugs and the level each needs; the visible nav is derived from it.

The hash is used rather than real routes because the whole site is one client
component behind a single page. Giving each tab a route would mean splitting
that up for nothing the address bar does not already do.

The address wins over the `landingTab` preference: that preference only decides
where a plain visit starts. Tab changes `pushState`, so back and forward walk
through tabs.

**`#account` is the awkward one** — it is reachable while signed out, and that
tab renders nothing without a session, which is a blank page rather than an
error. Two guards, because one is not enough:

- the `hashchange` / `popstate` listener refuses it outright and rewrites the
  hash to `#overview`. It reads the session through a **ref**: the listener is
  attached once, so a closed-over `session` would be the mount-time one forever.
  It also has to fix the hash itself, since setting the tab may be a no-op when
  the overview is already showing, and the syncing effect then never runs.
- a `data`-gated effect covers the cold load, where the session is not known
  until the record arrives. Gating on `data` is what lets a signed-in refresh on
  `#account` stay there instead of being bounced.

## The company tree

`divisions` is a tree, not a list. `parent` holds the **name** of the entry
above; blank, missing or unresolvable means top of the chart. The front page
renders it as an org chart under "How the company is put together".

The rule that separates a governing body from a trading division is the
**code**: governing bodies (board, committee, department) carry none and are
drawn in the deeper panel tone; operating units carry one and get the gold
badge. `operatingDivisions()` counts coded entries whose parent is uncoded,
which is what the hero's "N divisions" reads — not `divisions.length`, which
now includes the board above and any desk below.

Chart layout: a run of single-child nodes is drawn as one narrow centred
column, so the governance chain stacks vertically. A node with several children
gets a branch. The branch strip is a grid on the **same template and gap** as
the row beneath it, because evenly-spaced percentages miss the card centres
once a gap exists — if you change the gap in `globals.css`, change `ORG_GAP` in
`Site.jsx` to match. Below 768px the row stacks and the strip is hidden, since
its geometry assumes one column per child.

`parent` is free text from the control room, so a cycle is reachable. `OrgNode`
carries a `seen` set and stops rather than recursing forever; do not remove it.

`ensureData()` migrates a flat pre-tree record by hanging the existing entries
off a seeded governing chain and adding Lending under Capital, preserving names,
leads and blurbs. Like the other back-fills it is not written until something
saves, so it recomputes on each read until an executive saves the record.

**The People tab is the same chart with people in it.** `OrgChart` takes a
`people` flag; the blocks then hold bullet lists instead of the compact
governing card, and the spine is wider to fit them.

Who appears where comes from `staff[].dept`, matched against block names
case-insensitively and **split on commas**, so one person can sit in two — the
chief executive chairs the board and sits on the committee. A `dept` matching
no block does not vanish: `groupStaffByNode` returns those separately and the
tab lists them under "Elsewhere on the books", because a typo silently deleting
someone from the page would be worse than an untidy section.

`ensureData()` rewrites the old `dept: "Executive"` to `"Executive Committee"`,
and replaces the committee's blurb **only where it is still the old seeded
wording** — an executive who rewrote it keeps theirs.

### Editing the chart in place

The hammer on the People tab unlocks it, and shows only at `ceo`. `Editable`
swaps text for an input that inherits its type, so a heading stays a heading
while it is being changed. It commits **on blur, not per keystroke**: unlike the
control room, every save here is a PUT of the whole record and a paragraph would
be a hundred of them. Escape reverts, Enter commits a single-line field.

`chartEditor()` holds the mutations. **Renaming is the one with teeth**: a
block's name is what its children point at through `parent` and what staff point
at through `dept`, so all three move together — rename without the cascade and
the branch below is orphaned and the block empties of people. A rename to an
existing name is refused, since two blocks sharing one would make `parent`
ambiguous.

`setPerson`/`removePerson` locate the row by **identity against the original
`data.staff`**, which is why the index is taken before `deepClone` — cloning
first leaves nothing to match, and two people may share a name.

`Remove` on a block only appears when nothing hangs off it and nobody is in it.
The record is the only copy, and a stray click should not take a branch with it.

Both removals **arm first**: one click turns the control into `Remove? Yes /
Keep`, and only Yes commits. Every other edit here can be undone by retyping;
these two cannot. The armed person is held **by identity, not index**, so it
cannot end up pointing at somebody else if the list shifts. Do not reach for
`window.confirm` — a native dialog blocks the page, and it is the wrong register
for this site.

## The shift log

**A shift is one row, not two.** `POST /api/shifts` takes `action: "in" | "out"`.
Clocking in appends a row with an empty `timeOut`; clocking out finds that row
and fills it in. An empty `timeOut` is what marks a shift as still open, and the
staff room renders it as "18:00 → still on" with an Open badge.

The open shift is matched by **`account`**, not by the in-game name — the name
is free text and two people could type the same one. Clocking in twice is
refused with a 409 rather than allowed, because a second open row would strand
the first one and payroll would be reading a shift nobody can close. Clocking
out with nothing open is a 400.

Concurrent open shifts across different accounts are normal and supported.

Note the interaction with the 200-row cap: it trims from the front, so a very
long backlog could in principle trim away a still-open shift. That needs a busy
week to reach and losing the oldest row beats an unbounded list.

## Transactions

`transactions` records deals settled off the chest shops — legal work, materials
contracts. `amount` and `materials` are **text, not numbers**: a deal here is as
often "half the takings" or "3 stacks of iron" as a figure, and one of the two
may be blank, so the route requires a `type` plus at least one of them.

Staff-visible, like the shift log — staff file them, so staff can read them.

## Hiring

`POST /api/applications` gates on `effectiveRole(...) !== "public"`, **not** on a
level. `member` sits at level 0 alongside a visitor, and a member must be able
to apply — the point of an application is that the person does not work here
yet. The account requirement is what stops it being an anonymous spam endpoint;
self-registration is one click from the sign-in button.

Applications do not post to Discord, for the same reason requests do not.

Reading them is **exec only**, one level above client requests: an application
states what somebody expects to be paid, and staff have no reason to see each
other's asking price. The hiring board in the staff room is therefore rendered
only for executives, and `StaffRoom` numbers its sections through a counter
rather than by hand — hard-coded numerals would read I, III, IV for a staff
viewer once that section is hidden.

`jobs` is seeded from the DemocracyCraft wiki's job list (trades, professions,
government, licences, legal licences) and is exec-editable in the control room,
because the server changes it and that should not need a deploy. `ensureData()`
re-seeds it when the list is missing **or empty**, so an old record does not
leave the form with nothing to pick.

## Discord posting

**Posting a notice is the only thing on the whole site that reaches a webhook.**
Client requests, shift logs and job applications all stay on their boards here:
each is filed many times a day and names a person, so none of them belongs in a
channel. Do not re-add a `postToDiscord` call to `requests`, `shifts` or
`applications` — that is a decision, not an oversight.

There is therefore exactly one content path to Discord: `publish()` in the
control room, on a **public** notice with the box ticked. The only other call is
the connection test, which is diagnostics rather than content — without it a
webhook cannot be verified without publishing something real. There is
deliberately no "push price to Discord" button; a price announcement goes out as
a notice with the figure in it.

`HOOK_EVENTS` is down to `All posts` and `Announcements`, which now behave
identically. The pair is kept so a hook can still be aimed and so a future event
has somewhere to go. Hooks still storing the retired `"Client requests"` or
`"Shift log"` values match nothing, which is intended — they are **not** migrated
onto a live event, because that would start firing at a channel nobody aimed at.
`Field` renders a stored `options` value even when it is no longer offered, so
such a hook shows what it actually holds.

`discord.webhook` is the pre-list single URL. `ensureData()` promotes it into
`hooks` as "Main"/"All posts", and `lib/discord.js` only falls back to it when
**no** hook is configured — never merely because routing excluded them all,
which would quietly send a category to the old URL precisely because someone
had routed it away.

## Environment

Site: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AUTH_SECRET`,
`BOT_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

Bot: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `SITE_URL`,
`BOT_API_KEY` (identical to the site's), `STAFF_ROLE_ID`, `EXEC_ROLE_ID`.

`ADMIN_USERNAME`/`ADMIN_PASSWORD` are read **once**, on the first page load, to
mint the founding exec. Changing them later does nothing. Recovery is to delete
the `ucc:company:v1` key in Upstash and reload.

## Local testing recipe

The container/dev machine usually has no Upstash. Swap the store for a file, and
**remember to swap it back before committing**:

```bash
cp lib/store.js /tmp/store-real.js
cat > lib/store.js <<'EOF'
import fs from "fs/promises";
const FILE = "/tmp/ucc-test-store.json";
const RL = "/tmp/ucc-test-rl.json";
export async function readData() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch (e) { return null; }
}
export async function writeData(d) { await fs.writeFile(FILE, JSON.stringify(d)); return d; }
// lib/guard.js keeps its rate-limit counters here too, so the shim has to
// answer the handful of commands it sends. Expiry is ignored: the window is
// baked into the key, so a stale bucket is simply never read again.
async function bag() {
  try { return JSON.parse(await fs.readFile(RL, "utf8")); } catch (e) { return {}; }
}
export async function redis([cmd, key]) {
  const b = await bag();
  if (cmd === "INCR") { b[key] = (b[key] || 0) + 1; await fs.writeFile(RL, JSON.stringify(b)); return b[key]; }
  if (cmd === "GET") return b[key] ?? null;
  if (cmd === "DEL") { delete b[key]; await fs.writeFile(RL, JSON.stringify(b)); return 1; }
  return "OK"; // EXPIRE and anything else
}
EOF

rm -f /tmp/ucc-test-store.json /tmp/ucc-test-rl.json
npm run build
AUTH_SECRET=test-secret-1234567890 ADMIN_USERNAME=founder \
ADMIN_PASSWORD=supersecret1 BOT_API_KEY=botkey123 npm start
```

Then verify the security properties, not just the happy path:

```bash
# anonymous view must not contain the balance sheet or accounts
curl -s localhost:3000/api/data | python3 -m json.tool | grep -c balance

curl -s -c /tmp/e.jar -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"founder","password":"supersecret1"}'

# these must all be refused
curl -s -b /tmp/m.jar localhost:3000/api/users
curl -s -b /tmp/m.jar -X PUT localhost:3000/api/data -d '{"company":{}}'
curl -s -X POST localhost:3000/api/auth/register \
  -d '{"username":"x","password":"password123","role":"exec"}'   # role must be ignored
curl -s -b /tmp/e.jar -X PATCH localhost:3000/api/users \
  -d '{"username":"founder","role":"client"}'                     # self-demotion
curl -s -b /tmp/e.jar -X POST localhost:3000/api/users \
  -d '{"username":"founder","password":"whatever8","role":"client"}'  # same, via POST

# 11th bad password in ten minutes must be 429 with a Retry-After
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:3000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"founder","password":"wrong-on-purpose"}'
done; echo
```

Restore afterwards: `cp /tmp/store-real.js lib/store.js` and confirm with
`grep -c UPSTASH lib/store.js` (expect 3). The restored file must also still
export `redis` — `grep -c 'export async function redis' lib/store.js` (expect 1),
without which every route importing `lib/guard.js` fails to build.

Kill stale servers before retesting — a leftover `next start` holding :3000 will
silently serve the **old** build and produce confusing 405s.

**The session cookie is `secure` whenever `NODE_ENV === "production"`, which
`npm start` sets.** A conforming client throws it away over plain
`http://localhost`, so every "signed in" request quietly falls back to
anonymous — and a refusal test then passes for the wrong reason. Chrome treats
localhost as trustworthy and keeps it, so the browser is fine; command-line
clients are not. curl needs the header replayed by hand, and PowerShell needs
the cookie put in a `WebRequestSession` container (`-Headers @{Cookie=...}` is
silently dropped, because .NET treats `Cookie` as a restricted header). Always
assert the role you expect before trusting a refusal:

```bash
curl -s -b /tmp/e.jar localhost:3000/api/data | grep -o '"role":"[a-z]*"'   # expect exec
```

## Design system

Identity: **a modern holding company that happens to be old.** A deep navy shell
— ticker rail, masthead, hero, footer — wraps light, generous working pages. The
engraved heritage is kept deliberately and sparingly rather than abandoned: the
wax seal is the company mark, every figure is mono, and the guilloche survives as
a hairline texture instead of a border. Still not a crypto dashboard and still
not a SaaS landing page. Restraint over decoration.

```js
C = { // working surfaces
      paper:#F7F6F3, paperDeep:#EDEBE5, paperLine:#E1DED7, rule:#D5D1C8,
      ink:#111C2E, inkSoft:#5B6779,
      // the dark shell
      night:#0C1724, nightDeep:#060D16, nightSoft:#93A3B6,
      nightLine:rgba(255,255,255,0.13),
      // accents, and the same three lifted for use on `night`
      ledger:#1C7554, seal:#9B3630, gold:#C0913A,
      ledgerUp:#5FD3A0, sealDown:#E7938C, goldBright:#E2BB6B }
F = { display:'Bodoni Moda', body:'Archivo', mono:'IBM Plex Mono' }
```

- `night` is the masthead and hero; `nightDeep` is the ticker rail and footer, so
  the two dark bands stay distinguishable. `<body>` is `nightDeep` so overscroll
  matches at both ends.
- **Never put `ledger` / `seal` / `gold` on a dark background** — dark eats
  saturation and they read muddy. Use `ledgerUp` / `sealDown` / `goldBright`.
- Bodoni for headings, Archivo for prose, Plex Mono for every number, label and
  eyebrow. Money is always mono. Headings get `letter-spacing:-0.01em` or tighter
  at display sizes.
- Green means up/positive, oxblood means down/restricted, gold is the accent used
  sparingly. Section numerals are roman, in gold, above the title with a hairline
  running off to the right.
- Square corners everywhere. Hairline `rule` borders. Soft, shallow shadows
  (`0 1px 2px`) — the old `2px 2px 0` hard shadow is gone. No blur, no gradient
  fills on buttons.
- Charts: `type="stepAfter"`, `isAnimationActive={false}`. On light, gridlines in
  `paperLine`; on `night`, gridlines in `nightLine` and a `nightDeep` tooltip.
- Signature elements: the wax `Seal` (takes `size` and `tone="dark"`, and is the
  masthead logo at 34px), the `Guilloche` hairline, progress bars as dashed
  ledger ticks.
- Hover belongs in `globals.css`, not inline: `.ucc-btn-*` per skin, `.ucc-raise`
  for cards that behave like list entries. Inline `style` cannot express `:hover`,
  which is why these live there.

Prose voice: plain, concrete, a bit dry, occasionally wry. Contractions fine.
Avoid marketing adjectives, avoid exclamation marks, avoid "seamless" /
"empower" / "unlock". Error messages say what went wrong and what to do.

## Gotchas already paid for

- GitHub's web uploader **flattens folders** unless you drag-and-drop; the file
  picker dialog loses `app/`, `lib/`, `bot/`. Symptoms: Vercel says "No Next.js
  version detected" (no package.json at root) then "Couldn't find any `pages` or
  `app` directory" (files uploaded, folders didn't).
- Vercel **Root Directory** must point at wherever `package.json` actually sits.
- Upstash: credentials are under **Details tab → Connect to your database →
  REST**, not the CLI tab. Use the **Standard** token; the Read Only one loads
  the site but every save fails silently.
- Vercel env vars only apply to a **new** deployment. Always redeploy after
  adding them.
- Artifacts ban `localStorage`; this is a real app, so `localStorage` is fine and
  is used for per-device display preferences (`ucc:prefs`).
- `FULL_FIGURES` is a module-scoped mutable in `Site.jsx` that `compact()` reads,
  set from `App` on render. Slightly unusual, chosen over threading a prop
  through every component. If you refactor to context, update `compact()` too.

## Known limits (don't "fix" silently, discuss first)

- Changing a password does **not** invalidate other devices' sessions — stateless
  JWTs. Deleting the account does. Documented in README.
- Rate limiting **fails open**: if Upstash is unreachable the request passes. A
  storage blip should not lock the company out of its own site, and `filterData`
  still enforces underneath. Cost: knocking Redis over removes the throttles.
- The per-username login limit is loose on purpose (25 / 15 min). A tight one
  lets a griefer lock `zanegompf` out deliberately — the lockout becomes the
  attack.
- Usernames are first-come; there is no verification that a username matches the
  Minecraft account.
- No audit log of privileged actions.
- `requests`, `announcements`, `shifts`, `transactions` and `applications` are
  capped (200 / 60 / 200 / 200 / 200) by slicing on write. These are rolling
  windows, not archives — past the cap the oldest fall off and are gone.
- Concurrent exec edits are last-write-wins across the whole blob.

## House rules for changes

1. Server decides permissions; UI reflects. Never gate only in React.
2. Any new record field gets a `filterData` decision **and** an `EDITABLE` entry
   in the same change.
3. Never send `users`, `passwordHash` or `discord.webhook` to a browser.
4. Test the refusal paths, not just the success path, and paste the results.
5. Keep it approachable — the operator maintains this. Prefer boring, obvious
   code over clever abstractions.
6. This is a game. Warn against reusing real passwords; never imply the
   financial data is real.
