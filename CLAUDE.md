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
  globals.css       font @import + tailwind directives + focus styles
  api/
    data/           GET filtered record, PUT full record (exec only)
    auth/login/     POST username+password -> session cookie
    auth/logout/    POST
    auth/register/  POST public sign-up (role comes from settings, never the body)
    account/        GET own profile, POST change own password
    users/          GET list, POST create/replace, PATCH role only, DELETE (all exec)
    requests/       POST client desk submission
    discord/        POST server-side webhook relay (exec only)
    bot/            GET/POST for the Discord bot, x-bot-key auth
    session/        GET who am I — role resolved from the record, not the cookie
lib/
  store.js          Upstash REST get/set, plus redis() for guard.js counters
  seed.js           SEED record + ensureData() first-run/migration
  auth.js           hash, verify, session cookie
  roles.js          LEVEL, ASSIGNABLE_ROLES, filterData(), effectiveRole()
  guard.js          rate limits, client IP, CSRF check, body caps, safeEqual
  discord.js        webhook POST helper
bot/
  index.js          slash commands, talks only to /api/bot
```

## The one rule that matters

**Permissions are enforced server-side, in `lib/roles.js`, before data leaves the
process.** The UI mirrors the decision; it never makes it.

- `filterData(data, level)` strips: `users` and `codes` always; the balance
  sheet, internal staff notes and client requests below staff; the rate card
  below client; the Discord webhook below exec; plus projects and announcements
  whose `visibility` / `audience` outranks the viewer.
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

`public: 0, member: 0, client: 1, staff: 2, exec: 3`

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
divisions[]{name,code,lead,blurb}
stock{price,prevClose,shares,listed,updated,history[]{label,price}}
financials{periods[]{label,revenue,expenses}, balance{cash,inventory,property,investments,liabilities}, note}
staff[]{name,role,dept,joined,note,internal}
projects[]{name,status,visibility,progress,target,summary}
services[]{name,price,detail}
announcements[]{ts,author,audience,title,body}
requests[]{ts,from,contact,type,detail,status,account}
discord{webhook,channel,guild}
users[]{username,role,passwordHash,added,self}     <- never sent to a client
settings{signupOpen,signupRole}
```

`PUT /api/data` merges `{...current, ...incoming, users: current.users}` — page
saves can never clobber accounts. Account changes go through `/api/users` only.

`ensureData()` seeds on first run and back-fills missing keys (`users`,
`settings`) for records written by older versions. Add migrations there.

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

## Design system

Identity: an engraved **share certificate** and an accounting **ledger**. Not a
crypto dashboard, not a SaaS landing page. Restraint over decoration.

```js
C = { paper:#EFEAE0, paperDeep:#E5DDCD, paperLine:#DCD2BF,
      ink:#10233F, inkSoft:#41536E, ledger:#1E6A4F,
      seal:#8C2F2A, gold:#B8892B, rule:#C6BAA6 }
F = { display:'Bodoni Moda', body:'Archivo', mono:'IBM Plex Mono' }
```

- Bodoni for headings, Archivo for prose, Plex Mono for every number, label and
  eyebrow. Money is always mono.
- Green means up/positive, oxblood means down/restricted, gold is the accent used
  sparingly. Section numerals are roman.
- Square corners. Hairline `rule` borders. `2px 2px 0` hard shadows, no blur.
- Charts: `type="stepAfter"`, `isAnimationActive={false}`, gridlines in
  `paperLine`, tooltips square with an ink border.
- Signature elements: the guilloche stripe band (`repeating-linear-gradient`),
  the wax seal circle, the progress bars drawn as dashed ledger ticks.

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
- `requests` and `announcements` are capped (200 / 60) by slicing on write.
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
