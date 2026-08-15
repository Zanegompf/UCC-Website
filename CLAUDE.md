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
| Analytics | `@vercel/analytics`, cookieless, first-party | No CSP change needed; see gotchas |

**Do not upgrade Next to 15+** without editing `lib/auth.js` first: Next 15 made
`cookies()` async and every call here is synchronous.

## File map

```
app/
  Site.jsx          ~4800 lines, one "use client" component tree — the whole UI.
                    Navigate by the banner comments: utilities, primitives,
                    marks and the hero, list editor, org chart, control room,
                    sign in, app (App itself is last, from ~4600)
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
    research/       POST for the research department (rnd+), body.action
                    "file" | "comment" | "delete" — delete is ceo only
    legal/          POST for the legal department (legal+), body.action
                    "file" | "comment" | "template" | "delete" — delete is ceo only
    archive/        POST body.action "restore" — puts a deleted row back (exec)
    shareholders/   POST body.action "save" — the whole share register, **ceo
                    only**. The one route whose gate is the whole story; see
                    "The share register"
    forum/          POST body.action "thread" | "reply" | "lock" | "delete".
                    Posting needs an account and the board's level; lock and
                    delete are exec
    discord/        POST server-side webhook relay (exec only)
    bot/            GET/POST for the Discord bot, x-bot-key auth
    session/        GET who am I — role resolved from the record, not the cookie
lib/
  store.js          Upstash REST get/set, plus redis() for guard.js counters
  seed.js           SEED record + ensureData() first-run/migration
  auth.js           hash, verify, session cookie
  roles.js          LEVEL, ASSIGNABLE_ROLES, filterData(), effectiveRole()
  forum.js          FORUM_BOARDS and boardMin(). A board's `min` is a role name,
                    so filterData gates it the same way it gates a project
  research.js       RESEARCH_KINDS/_BLURBS/_PLURALS, RESEARCH_STATUSES,
                    researchPlural(). The same shape as lib/legal.js, for the
                    same reason: constants both the route and Site.jsx import
  legal.js          LEGAL_KINDS/_BLURBS/_PLURALS, LEGAL_STATUSES, kindPlural().
                    Constants only, so unlike HOOK_EVENTS it is imported by both
                    the route and Site.jsx rather than mirrored
  shareholders.js   EMPTY_REGISTER, SHARE_CLASSES, readRegister(), totalHeld().
                    Constants and normalising only, like lib/legal.js, so the
                    route and Site.jsx share them. The slice colours are not
                    here — they live with the rest of the palette in Site.jsx
  ids.js            entryId(), the one id generator. Its own module so lib/legal
                    does not have to import lib/archive to borrow it
  archive.js        ARCHIVED_LISTS, withIds(), archiveRemoved() — what keeps a
                    removed row on `deleted`
  caps.js           CAPS, MAX_COMMENTS, STOCK_HISTORY_CAP. The only place a list
                    length is written down
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
  the research department's files **and every division's `remit`** below rnd;
  the legal department's filings below legal; the rate card below client; the
  Discord webhooks **and job applications** below exec; plus projects and
  announcements whose `visibility` / `audience` outranks the viewer.
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
commit — miss the second and the field silently vanishes on every save. The one
deliberate exception is `deleted`, which is server-managed and is carried over
like `users`; see "Deleted records".

There are now **two** such exceptions: `deleted`, described below, and
`shareholders`, which only `/api/shareholders` may write. Both are carried over
by the spread at the top of `PUT`; neither is in `EDITABLE`, and putting either
one there would hand every executive a page save that overwrites it.

`applications`, `legalFilings`, `requests` and `projects` carry an `id` on every
row, because the archive spots a deletion by an id going missing. Anything that
adds a row to one of those four must mint one with `entryId()`.

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
| legal filings and comments | 40 / hour per account | all |
| research files and comments | 40 / hour per account | all |
| forum threads | 10 / hour per account | all |
| forum replies | 40 / hour per account | all |
| restoring a deleted row | 20 / hour per account | all |
| saving the share register | 60 / hour per account | all |
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

`public: 0, member: 0, client: 1, staff: 2, rnd: 3, legal: 4, exec: 5, ceo: 6`

**Two ranks have now been inserted mid-list — `legal`, and then `rnd` below
it — renumbering everything above them both times.** That keeps being safe
because nothing anywhere compares a level to a literal: every gate is written
against a `LEVEL.*` symbol, and the record only ever stores role *names*
(`users[].role`, `visibility`, `audience`, a board's `min`), never a number.
Keep it that way — a hardcoded `level >= 3` would silently change meaning the
next time a rank is added, which has now happened twice. `level > 0` in
`Site.jsx` is the one numeric comparison, and it only asks "signed in with some
access".

The list to update when a rank is added, all of which the `rnd` change had to
touch: `LEVEL` and `ASSIGNABLE_ROLES` in `lib/roles.js`, the mirrored `LEVEL`,
`ROLE_NAME`, `ROLE_BLURB`, `ROLE_TABS` and `RolePicker`'s `fill` in `Site.jsx`,
and the account-creation `options` list in the control room. `settings.signupRole`
deliberately still offers only `member` and `client`.

`ceo` sees exactly what an executive sees — every `filterData` gate is
`>= LEVEL.exec`, which it clears — and adds four things: unlocking the people
chart to edit it in place, deleting a legal filing, moving the share price from
the share page itself, and writing the share register.

Two of the four are **interfaces, not permissions**: the chart hammer and the
share page's price control both save through `PUT /api/data`, which checks for
**exec**, and an executive can already do both from the control room. Do not
describe those two as security boundaries.

The other two are real. The legal-filing delete is enforced against `ceo` in
`/api/legal`, and the share register in `/api/shareholders` — and the register is
the stricter of the two, because unlike `legalFilings` it is **not in
`EDITABLE`**, so there is no page save that reaches it either. It is the only
thing on the record an executive genuinely cannot change.

**Only a chief executive may seat or unseat another**, on PATCH, DELETE and the
wholesale POST. The one exception is bootstrapping: where the company has no
`ceo`, an executive may appoint the first, or a record predating the role could
never gain one. `ensureData()` also seats `OWNER_ACCOUNT` (`beast_sd`) whenever
that account exists and no seat is taken — it runs every load rather than once,
because the account may be created after this shipped.

The "last executive" guard counts anyone at `exec` **or above**, so a company
whose only privileged account is the chief executive is not treated as locked
out of itself.

`legal` and `rnd` are **departments, not promotions**. Each sees everything a
staff member sees plus its own department's files, and nothing an executive sees
— no webhooks, no hiring board, no control room, no accounts. Neither counts
towards `runsTheCompany` in `api/users`, so a company whose only privileged
accounts are departmental is still treated as needing an executive.

`rnd` sits **below** `legal` rather than beside it, which is a real decision and
not just an ordering: it means legal reads the research department's files and
research cannot read legal's. That is the right way round — legal has to see an
acquisition before it can paper one, and a researcher has no business in a
dispute. The cost is that the two cannot be genuinely separate compartments;
this is a ladder, not a set of clearances, and making them independent would
mean a different model than a single `level`.

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
divisions[]{name,code,parent,lead,blurb,remit?}   <- a tree; see below.
                                     `remit` is stripped below rnd
research[]{id,ts,kind,title,subject,valuation,status,detail,author,account,
           comments[]{ts,author,body,account}}    <- stripped below rnd
stock{price,prevClose,shares,listed,updated,history[]{label,price}}
shareholders{voterShares, equity[]{id,name,shares}, voters[]{id,name,shares}}
                                                   <- ceo-only, NOT in EDITABLE
financials{periods[]{label,revenue,expenses}, balance{cash,inventory,property,investments,liabilities}, note}
staff[]{name,role,dept,joined,note,internal}    <- dept: comma-separated block names
projects[]{name,status,visibility,progress,target,summary}
services[]{name,price,detail}
announcements[]{ts,author,audience,title,body}
requests[]{ts,from,contact,type,detail,status,account}
shifts[]{ts,username,occupation,timeIn,timeOut,output,account}  <- empty timeOut = open
transactions[]{ts,username,type,counterparty,amount,materials,detail,account}
applications[]{ts,username,discord,role,wage,experience,references,notes,status,account}
legalFilings[]{id,ts,kind,title,party,reference,status,detail,author,account,
               comments[]{ts,author,body,account}}   <- id is load-bearing; see below
legalTemplates[]{id,ts,name,kind,body,notes,author,account}   <- legal+ writes these
forum[]{id,ts,board,title,body,author,account,locked,
        replies[]{id,ts,author,body,account}}   <- `board` decides who may read it
deleted[]{id,kind,label,ts,by,entry{...}}   <- server-managed, NOT in EDITABLE
jobs[]{name,category}                              <- public; the dropdown reads it
discord{webhook,channel,guild,hooks[]{name,url,channel,events}}
users[]{username,role,passwordHash,added,self}     <- never sent to a client
settings{signupOpen,signupRole}
```

`PUT /api/data` merges `{...current, ...incoming, users: current.users}` — page
saves can never clobber accounts. Account changes go through `/api/users` only.

`ensureData()` seeds on first run and back-fills missing keys (`users`,
`settings`, `shifts`, `research`, `discord.hooks`) for records written by older
versions. Add migrations there.

**Two kinds of migration live in it, and they are not the same.** A missing
array becoming an empty one is idempotent — it does not matter how often it
runs, so most of them are unguarded and unwritten. Adding a *row* is not: doing
that on every load would mean an executive could delete the row and watch it
come straight back. Those are gated on `RECORD_VERSION` in `lib/seed.js`, and
the new version is **written** with the change, the same bargain the id
migration makes. The research department's block is the first of these: bumping
`RECORD_VERSION` is what makes a one-shot migration run, and the write is
wrapped in `try`/`catch` so a read-only token cannot take the site down.
Verified both ways — an old record gains the block once and no amount of
reloading adds a second, and a block an executive deletes stays deleted.

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

**A branch row is two tracks, not one box per child.** Every card sits in the
first track and every subtree in the second, so a subtree cannot start until
every card in the row has ended. Without that, a short block's children run
straight *through* the taller block beside it — which is what happened the
moment the research department had four people in it and the divisions row
crossed its card. `display: contents` on the child wrapper is what lets one node
contribute to both tracks; the card track is `align-self: stretch`, so two
blocks at the same level also come out the same height whatever their contents.
It is inside the `min-width: 768px` query — below that the wrapper is an
ordinary block and the row stacks, where none of this applies.

**A branch where one child carries a subtree and the rest are leaves gets equal
columns, and the subtree runs the full width underneath** (`.ucc-org-wide`, set
from `breakout` in `OrgNode`). This shape has two obvious layouts and both are
wrong: equal columns alone squeeze four trading divisions into half the page,
and columns weighted by what hangs under each leave the two department cards
plainly mismatched — one a wide short bar, the other a narrow tall block, which
is not how two blocks at the same level should read. Breaking out is sound
rather than a trick: a leaf column has nothing below it to collide with, and it
is the ordinary way a chart draws a unit that reports straight up with nobody
under it. The stem stays in the parent's own column so it still drops from the
middle of the card; only the strip and the row break out.

The width is exact, not approximate: `N * 100% + (N-1) * gap` where `100%` is
one column comes to the row's own width, so it can never overflow. It is inside
the `min-width: 768px` query — below that the row is a single column and there
is nothing to break out of.

**When more than one child carries a subtree there is nowhere to break out to,
and those fall back to columns weighted by `branchTemplate()`/`subtreeSpan()`** —
the subtree's width in cards at its widest row. That path uses `minmax(0, Nfr)`,
or a long word in a narrow card pushes its column past its share and drags the
stubs off the card centres. `subtreeSpan` carries the same `seen` cycle guard as
`OrgNode`, for the same reason.

**The research department reports to the Executive Committee directly**, not
through the Legal Department the trading divisions hang off, and nothing reports
to it — so it draws as a leaf beside Legal with no stem below it. That is the
chart doing what the tree says rather than anything special-cased: a node with
no children simply renders no `OrgStem` and no `OrgBranch`.

`parent` is free text from the control room, so a cycle is reachable. `OrgNode`
carries a `seen` set and stops rather than recursing forever; do not remove it.

`ensureData()` migrates a flat pre-tree record by hanging the existing entries
off a seeded governing chain and adding Lending under Capital, preserving names,
leads and blurbs. Like the other back-fills it is not written until something
saves, so it recomputes on each read until an executive saves the record.

**The two charts divide the work: the overview shows the shape, the People tab
shows who is in it.** The overview names nobody — no leads, no members — so the
two cannot end up disagreeing about who runs what.

`divisions[].lead` is therefore no longer rendered anywhere, and its input is
gone from the control room. Stored values were left in place rather than
stripped, so restoring it is one line in the divisions `ListEditor` and nothing
else.

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

## Moving the share price

`recordPrice(data, label, price)` in `Site.jsx` is the single implementation, used
by the control room's section II and by `PriceSetter` on the share page. The
order inside it matters: the current price becomes `prevClose` **before** the new
one lands, or the change figure on every stat card reads zero. Two copies of that
would drift the way the caps did — call the helper.

`PriceSetter` shows only at `ceo` and sits **inside section I** rather than as a
section of its own, so the numerals do not shift for everybody else when it is
hidden. That is the same trap `StaffRoom` works around with a counter.

The date label defaults to today in the bot's format (`en-GB`, day and month) and
stays editable, since the common case is posting today's close.

## The share register

Sections **III and IV** of the share page: two pie charts, one for equity
shareholders and one for voter shareholders. The full price record moved down to
**V** to make room.

### Two classes, two denominators

`shareholders.equity[]` and `shareholders.voters[]` are separate lists, not one
list with a flag — a holder usually appears in both with different numbers, and
money and control are different things.

**Equity is counted against `stock.shares`.** That is the existing "Shares
issued" figure the market capital and the book value per share are already
worked out from, so the register cannot disagree with the hero. The editor's
"Total shares issued" writes it, through the same route. **Votes are counted
against `shareholders.voterShares`**, which is the register's own, because
nothing else on the record knows how many votes exist.

Do not give equity its own total. Two share counts is exactly the shape the caps
were in before they were pulled into `lib/caps.js`.

### Who may write it

**Chief executive only, and here that is a permission rather than an
interface.** `/api/shareholders` checks `>= LEVEL.ceo`, and `shareholders` is
**not in `EDITABLE`**, so a page save cannot reach it — an executive who forges
one gets a 200 and no change. There is deliberately **no control room page for
the register**: adding one would mean putting `shareholders` in `EDITABLE`,
which would make the gate decorative.

Tested: a member, a visitor and an **executive** are all refused; the executive's
forged page save is ignored; an ordinary page save carries the register over
untouched.

The one thing an executive can still move is `stock.shares` itself, in the
control room, because that field predates the register and the market capital
reads it. The register — who holds what — is out of reach.

### Reading it

**Public, decided in `filterData` by not stripping it.** Who owns a listed
company is what a share register is for, and the share page is the public
investor page. Note the equity chart's hidden names are a *reading* decision made
in the browser and not a permission: anybody can hover. If it ever needs to be
restricted, gate it in `filterData` — hiding it in `Site.jsx` would only hide
what was still sent.

### The charts

- **Equity (III) names nobody.** Wedges carry a percentage and nothing else; the
  holder appears on hover, with the share of the company. That was asked for
  directly, and it is why this chart has no table under it — a legend would give
  the names straight back.
- **Voter (IV) names everybody**, inside the wedge, with a table beside it
  carrying every row including the ones too small to label.

`SHARE_SLICES` in `Site.jsx` is five colours, built in OKLCH against the paper
surface and **checked with a validator rather than by eye** — lightness band,
chroma floor, contrast, and colour-blind separation for **every pair** rather
than just neighbours, because any two wedges of a pie can be compared. They are
the house accents pushed to where they survive that. A sixth holder does not get
a sixth colour: `capTable` folds the rest into one neutral "smaller holders"
wedge. If you add a colour, re-run the validator.

**Labels are dropped by measurement, not by a percentage floor.** The arc a
label sits on is `2πr × the slice's share`, and the label needs about 6.4px per
character; a wedge that cannot hold its text gets none. A fixed floor gets this
wrong both ways — a long name crosses three wedges at 10% while a short one had
room at 6%, and the voter chart sits in half a column, so it has less arc for the
same percentage than the equity chart does. What is dropped is still on the
tooltip, and on the voter table.

### The hammer

Same idiom as the People tab: a 🔨 that shows only at `ceo`, on section III,
opening an editor for both classes at once.

It holds a **draft** rather than saving as you type. Both charts read the draft
while it is open, so a holding moves the pie as it is typed — that is the point
of editing it on the page — and the whole register goes to the server once, on
Save. Discard drops the draft; the record was never touched. The draft's
existence *is* the lock, so "unlocked" and "what is being edited" cannot
disagree.

Rows are removed **armed first** (`✕` → `Yes / Keep`), like the chart's two
removals and the legal delete.

The route mints an `entryId()` for a holder that arrives without one, cleans
names to 60 characters, floors shares to whole numbers, refuses a duplicate name
within a class, and **drops a wholly blank row** rather than refusing it —
otherwise adding a row and thinking better of it would block the save. A row with
a number but no name is still refused, and the page shows why.

`MAX_SHAREHOLDERS` (60) is per class, in `lib/caps.js` but not in `CAPS`: the
register is an object holding two lists, and the trim loop in the save route only
walks top-level arrays.

## The shift log

**A shift is one row, not two.** `POST /api/shifts` takes `action: "in" | "out"`.
Clocking in appends a row with an empty `timeOut`; clocking out finds that row
and fills it in. An empty `timeOut` is what marks a shift as still open, and the
staff room renders it as "18:00 → still on" with an Open badge.

Both dialogs carry an **AM / PM** picker beside the time. Times stay plain text,
so `withMeridiem()` composes rather than adding a field: "6:00" plus "PM" is
stored as "6:00 PM" and every entry already in the log keeps working. It
declines in two cases, both of which would otherwise write nonsense — when the
time already ends in AM/PM, and when the hour is 13 or more, since "18:00 PM"
helps nobody and 18:00 was never ambiguous. The picker can be left blank for
anyone writing 24-hour time.

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

## The control room

Sections I–III (post a notice, move the price, Discord) stay on the page.
**Everything past them is one page each**, reached from a hub of cards under
section IV. They used to be stacked in a single "Records" column, so reaching
the job list meant scrolling past the whole company.

The pages live in a `PAGES` array inside `ControlRoom` — the hub and the page
body both read it, so a card and its contents cannot drift apart. Add an entry
there and it appears in both. `count` is optional and shows on the card.

Which page is open is **local state, not in the address**: the tab itself is in
the hash, but the editor you last opened is not worth a history entry. Refresh
returns to the hub.

## Hiring

`POST /api/applications` gates on `effectiveRole(...) !== "public"`, **not** on a
level. `member` sits at level 0 alongside a visitor, and a member must be able
to apply — the point of an application is that the person does not work here
yet. The account requirement is what stops it being an anonymous spam endpoint;
self-registration is one click from the sign-in button.

Applications do not post to Discord, for the same reason requests do not.

Applications appear in **two places**, and the account block belongs on both:
the hiring board in the staff room, and the Applications page in the control
room. Put anything about an application on both or neither — landing on the one
without it reads as the feature being missing.

Each shows the **account it was filed from** underneath the notes, with a
`RolePicker` beside it, so hiring somebody is done where you read them rather
than by carrying a name to another screen. The account and the in-game name on
the form need not match; the account is what access hangs off.

Accounts never travel with the company record, so `useAccounts()` fetches
`/api/users` separately — shared by both views so they cannot drift. It is also
why an application whose account has since been deleted says so instead of
offering a control that would fail, and why one **typed in by hand** in the
control room reads "not recorded": `blank` has no `account`, only the form sets
it.

`ListEditor` takes an optional `footer(item, i)` for exactly this — a row needs
something that is not a plain value on the record.

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

## The research department

A subpage of the **staff room**, like the legal department, reached by a button
above section I and rendered only for `rnd` and above. Local state
(`showResearch`), so a refresh comes back to the staff room.

**Three kinds, one section each**, driven by `RESEARCH_KINDS` in
`lib/research.js`: market research, competitor analysis, and acquisition
targets. Adding a kind there adds the section, the button and the picker
together, exactly as the legal department works — and a file whose kind is no
longer offered still gets a section rather than vanishing.

### What is actually hidden

Two things, and they are stripped in `filterData` at `< LEVEL.rnd`:

- **`research`**, the files themselves.
- **`divisions[].remit`**, the second description a block can carry. The
  research department's block stays on the public chart with a bland `blurb`;
  what it is *for* — market research, competitor analysis, acquisition targets —
  is in `remit` and does not leave the server. It is stripped from **every**
  division rather than from that one by name, so any block can have a restricted
  remit without touching this code again.

`OrgRemit` in `Site.jsx` renders `d.remit` **with no level check of its own**.
That is deliberate: a viewer who was not meant to read it does not have it to
render, and testing the level in the component too would be a second, weaker
copy of the same decision — the sort that quietly stops matching. Both org cards
render it, so it shows on the overview chart and the People tab alike.

Why the whole list stops at `rnd` rather than at staff: a target list says what
the company is about to do, and it names firms that have not been approached and
prices that have not been offered. Note the bot is unaffected — `/api/bot`
filters at `LEVEL.staff`, which is below this, so none of it reaches Discord even
by that path. Nothing here posts to a webhook either.

### The rest of the shape

Mirrors the legal department deliberately, so there is one pattern to learn:
`id` is load-bearing and comments attach by it; a file typed in by hand in the
control room has none and says so instead of offering a box the route would
refuse; deleting is **ceo only**, checked inside the branch rather than at the
top, and arms first; a deleted file goes to Deleted records like a legal filing.
`research` **is** in `EDITABLE`, so an executive can still correct one on the
control room's Research files page — the ceo gate covers the department's own
page, where the files are read.

`valuation` is **text, not a number**, the same call the transaction log makes:
"about 40 stacks of diamond" is a real answer. The filing modal renames its two
loose fields per kind — Market/Size, Competitor/Their scale, Target/Asking —
because asking for the right thing is the difference between a useful file and
an empty box.

## The legal department

A subpage of the **staff room**, not a tab of its own — reached by a button above
section I, and only rendered for `legal` and above. It is local state
(`showLegal`), like the control room's pages: the staff room is in the hash, but
which subpage you last opened is not worth a history entry, and a refresh
returning to the staff room is the right default.

**Section I is Legal templates**, and the kinds run from II. The numeral for a
kind is `numerals[i + 1]` — if another fixed section is added above them, that
offset moves with it rather than the numbers being written by hand.

**One section per kind of document.** `LEGAL_KINDS` in `lib/legal.js` drives the
sections, the pickers and the "New …" buttons, so adding a kind there adds all
three. A filing whose `kind` is no longer in the list still gets a section of its
own rather than vanishing — same instinct as "Elsewhere on the books" on the
People tab.

The kind is **not a field on the filing form**: each kind has its own button, so
which one you pressed is the answer. Offering it twice only lets the two disagree.

**`id` is load-bearing.** Comments attach to a filing by `id`, never by index.
The control room's `ListEditor` can reorder and delete rows and the whole record
is read-modify-written as one object, so a comment addressed by position could
end up under a different document entirely. `filingId()` mints one; a filing
typed in by hand in the control room has none, and the page says so instead of
offering a comment box the route would refuse with a 404.

**Comments live on the filing, not in Discord.** That is the whole point — six
months on, nobody can find the channel message explaining why a clause reads the
way it does. Filings and comments therefore post nowhere; the rule that only a
notice reaches a webhook holds here too.

Reading is `>= LEVEL.legal`, which **executives clear**. Somebody has to be able
to read the files when counsel is offline, and an exec already sees everything
else. Staff do not: a filing names the other party to a dispute and the thread
under it is the department thinking aloud.

Two caps, not one: 200 filings on the record like the other logs, and **50
comments per filing**, so one long argument cannot grow the blob that every page
load reads.

### Templates

`legalTemplates[]` is boilerplate the department drafts from — one per kind,
written on the department's own page. It has its own action, `"template"`,
rather than going through a page save, because `legal` cannot PUT `/api/data`
and the people who write the templates are the ones who use them.

**Use copies, it does not link.** `LegalFilingModal` takes a `from` prop and
seeds the title and detail with the template's; after that the two have nothing
to do with each other. A live link would mean editing a template silently
rewrote filings already sent to somebody.

The body is capped at 8000 characters against 4000 for a filing's detail — a
template is a whole document, a filing's detail is usually a summary of one.

Templates are **not** in `ARCHIVED_LISTS`, so removing one is final. They are
reusable wording rather than a record of something that happened, and the diff
only earns its keep on lists where losing a row loses history. Correcting or
retiring one is the control room's job, like the job list.

### Deleting a filing

`action: "delete"` is **chief executive only**, checked inside the branch rather
than at the top of the route — the outer gate admits the whole department, and
everyone in it can file and comment. Deleting is the one action here that
retyping cannot undo, and the thread goes with the document.

The button **arms first** (`Delete` → `Delete this filing? Yes / Keep`), same
bargain as the chart's two removals, and for the same reason. Do not swap it for
`window.confirm`.

It addresses by `id`, so a filing typed in by hand has no Delete button — that
one comes off the record in the control room instead.

**This is not the only way a filing can be removed.** `legalFilings` is in
`EDITABLE`, so an executive can still delete a row on the control room's Legal
filings page. The ceo gate covers the department's own page, where filings are
actually read. If deletion should be genuinely ceo-exclusive, `legalFilings` has
to come out of `EDITABLE` — which also takes away the exec's ability to correct a
filing, so it is a trade rather than a fix.

## The forum

A tab of its own (`#ucc-forum`), sitting after the control room and before the
account tab. Three views behind it — boards, a board's threads, one thread —
held in **local state, not the address**, the same as the control room's pages.

**A board is gated exactly like a project.** `FORUM_BOARDS` in `lib/forum.js`
gives each one a `min` using the same role names, and `filterData` drops any
thread whose board outranks the viewer. Adding a board is one entry there; it
appears on the index, in the pickers and in the gate together.

`boardMin()` answers **`exec` for a board it does not recognise**, so this gate
fails closed. A thread whose board was renamed or removed goes quiet and waits
for an executive, rather than falling open to everybody because its key stopped
matching. That is the opposite of the `dept` behaviour on the People tab, and
deliberately so: one is a permission, the other is a tidiness problem.

**Reading takes no account; posting always does.** Like `applications`, the post
path checks `effectiveRole(...) !== "public"` rather than a level, because
`member` sits at level 0 and must be able to post. The account requirement is the
only thing between the forum and an anonymous spam endpoint.

The board's level is re-checked on **reply** as well as on read, or somebody who
learned a thread id could talk in the staff lounge. Tested: a member replying to
a staff thread by id is refused and nothing lands.

Moderation is **exec** — removing a thread or a reply, and closing a thread to
replies. Removing the opening post takes the whole thread with it, which the UI
knows, so it drops back to the board rather than rendering nothing. Both removals
arm first, like the chart's.

Removed posts go to **Deleted records** and can be restored; see the nested-kind
note there, because a reply is the one archived thing that is not a row in a
top-level list. Caps: 200 threads, and `MAX_REPLIES` 100 per thread.

## Deleted records

Removing a row used to be final: the list editor spliced it out, the save
overwrote the list, and nothing remembered. Four lists now keep what was removed
on **`deleted`**, read from Control room → Deleted records.

`ARCHIVED_LISTS` in `lib/archive.js` names them — `applications`,
`legalFilings`, `research`, `requests`, `projects`, `forum`. Not all of them on purpose: the
record is one blob every page load reads, and archiving `shifts` and
`transactions`, which turn over fastest and matter least individually, would grow
it for little gain.

### Nested kinds

A forum **reply** is the one archived thing that is not a row in a top-level
list, so it needs both halves doing differently:

- The save-time diff cannot see it — only `/api/forum` knows a reply went, and it
  archives one explicitly with `archiveEntry("forumReply", …)`, recording
  `threadId` and `threadTitle` on the entry.
- Restoring it cannot append to a list of its own. `NESTED_ARCHIVED` describes
  where it goes back — `parent`, `into`, and `ref` naming the field that holds
  the parent's id — and `/api/archive` follows that instead of the list path.

Two behaviours worth keeping:

- It goes back **in sequence**, not on the end. `entryId()` prefixes a base-36
  timestamp, so sorting the replies on their id sorts them by when they were
  written, and a restored middle reply lands back in the middle. Top-level
  restores still append, because nothing records where those sat.
- `threadId` / `threadTitle` are scaffolding for the archive and are **stripped**
  on the way back, so the restored reply matches its siblings' shape.

If the parent thread has since been removed too, the restore refuses and says to
restore the thread first — a thread carries its replies, so that brings the
conversation back whole. Both archive rows survive the refusal.

`ARCHIVE_KINDS` is the ordered list of everything that can appear on `deleted`,
and `archiveLabel()` names any of them; the Deleted records page groups on those
rather than on `ARCHIVED_LISTS`, or the nested kinds would have nowhere to show.

**The archive matches by `id`, never by value.** This is the whole design
constraint. The control room saves on **every keystroke**, so a value comparison
would read the half-typed state of a field as a deletion and file a copy per
character. An id survives an edit and disappears on a removal, which is exactly
the distinction needed. Verified: twelve consecutive keystroke-saves renaming a
project archive nothing.

That is why `ensureData()` **writes** after minting ids, unlike every other
back-fill in it. Ids recomputed per read would differ each time and the next save
would look like the whole list had been replaced. The write is wrapped in a
`try`/`catch` — with a read-only Upstash token it throws, and a failed migration
must not take the site down; it retries next load, and `archiveRemoved` skips
those lists in the meantime.

Two skips in `archiveRemoved`, both load-bearing:

- a list the save does not mention at all is not a deletion of everything in it;
- a list whose incoming rows carry **no** ids is a browser holding a pre-id copy.
  Trusting it would archive the entire list on the first save from a stale tab.

**`deleted` is not in `EDITABLE`**, which is the exception to the usual rule that
a new field goes in both places. It is server-managed: `PUT /api/data` appends
what the save dropped, `/api/legal`'s delete appends the filing it removed — the
one deletion no diff can see, since it never goes through PUT — and the cap
trims. Putting it in `EDITABLE` would let every save overwrite the archive with
the browser's copy, losing anything added since that tab loaded. Confirmed: a
save carrying a forged `deleted` is ignored.

It is stripped **below exec**, not per kind. It holds removed applications and
legal filings, so it takes the tightest gate of anything inside it.

Capped at 200 like the other logs.

### Restoring

`POST /api/archive` with `{action:"restore", id}`, where `id` is the **archive
row's** id, not the entry's. **Executive**, matching the page it is reached from
— looser than deleting a legal filing, which is ceo only, because putting
something back is a recovery rather than a destruction, and an executive who
could not undo their own mis-click would just retype it.

Three decisions the route makes, each of which had an obvious wrong answer:

- **It appends to the end of the list**, not to the row's old position. Nothing
  records where it sat and the rows around it have moved since. The entry keeps
  its own `ts`, so it still reads with the date it was originally filed.
- **It refuses when the target list is at its cap**, rather than appending and
  letting the slice push the oldest row off — that row would go without ever
  reaching the archive, so a restore would silently cost a record.
- **It refuses an entry whose id is already in the list.** Two rows sharing an id
  would break the two things ids exist for: the archive reads them into a Set,
  and a filing's comments are addressed by one. Defensive — the API gives no way
  to get a duplicate archive row, so this is unreachable in practice.

On success the archive row is removed, because a thing that is back on the record
should not still be listed as deleted.

The restored row keeps its id, so the diff sees it as present and unchanged: a
save straight after a restore archives nothing, and so do keystroke edits to the
restored row. Both verified, along with delete → restore → delete → restore.

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
# role must be ignored — the reply says "member". Do NOT use `password123`
# here: it is on the register route's OBVIOUS list, so the request is refused
# for being a weak password and the check passes without testing anything.
curl -s -X POST localhost:3000/api/auth/register \
  -d '{"username":"x","password":"ledger-tin-42","role":"exec"}'
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

## Phones

The desktop layout is the design; the phone rules are corrections to it, and they
live at the bottom of `globals.css` inside `max-width` queries so desktop is
untouched. Four things were actually wrong, none of which was a broken grid —
measured at 320/360/390/412/430px, document overflow was zero on every tab.

- **Form controls are forced to 16px under 768px.** iOS Safari zooms the whole
  page in when you focus a control whose text is under 16px, and does not zoom
  back out. Every field here was 14px, so tapping any box left the site zoomed —
  which is what "it goes weird on my iPhone" turned out to mean. **16 is a
  threshold, not a preference: do not tidy these back to 14.** `Editable` carries
  `ucc-inherit` to opt out, because those inputs take their type from the heading
  they replace and would shrink a 24px title as you edited it.
- **`100vh` → `.ucc-screen-min`**, which is `100dvh` where supported. iOS
  measures `100vh` against the viewport with the toolbars *hidden*, so the bottom
  of the page sat underneath them. On a desktop the two are identical.
- **The masthead collided under about 420px** — the buttons are `shrink-0`, the
  wordmark was not clipped, and "Commerce" ran underneath the settings gear at
  320px. The name now gives way instead: `.ucc-masthead-hq` is hidden and
  `.ucc-masthead-name` drops to 16.5px.
- **The tab strip has a right-edge fade** (`.ucc-nav-scroll`). It cannot fit on a
  phone at any sensible size, so it scrolls — but mobile browsers only show a
  scrollbar while it is moving, so it just looked cut off and nobody found the
  staff room. The gap tightens to 16px there too.

To re-measure: the app sends `frame-ancestors 'none'`, so it cannot be put in an
iframe, and window resizing did not take. What worked was a throwaway Node proxy
that strips `content-security-policy` and `x-frame-options`, serving a harness
page of fixed-width iframes — media queries and `vw` resolve against the iframe,
so it is a real test. Keep that out of the repo.

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
- **Vercel Web Analytics** (`<Analytics/>` in `app/layout.jsx`) reports nothing
  until Web Analytics is switched on for the project in the Vercel dashboard —
  the console says so in as many words. It needs no CSP change: in production it
  serves its script and posts its counts from `/_vercel/insights/*` on this
  domain, so `script-src 'self'` and `connect-src 'self'` already cover it. Its
  **debug** build is the exception — that one loads from `va.vercel-scripts.com`
  and the CSP will block it under `next dev`. That is only the local debug
  path; do not widen the policy for it.
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
- `requests`, `announcements`, `shifts`, `transactions`, `applications`,
  `legalFilings` and `deleted` are capped (200 / 60 / 200 / 200 / 200 / 200 /
  200) by slicing on write, `comments` at 50 per filing, and `stock.history` at
  120. These are rolling windows, not archives — past the cap the oldest fall off
  and are gone. That applies to `deleted` too: it is a safety net for a recent
  mis-click, not a permanent audit trail.
- Deleting a row from `staff`, `divisions`, `services`, `jobs`, `shifts`,
  `transactions`, `announcements` or `financials.periods` is still final —
  only the four in `ARCHIVED_LISTS` are kept.
- The staff room renders only the most recent 40 shifts and transactions. The
  rest are on the record and show in the control room; this is a page-length
  decision, not a cap.
- Concurrent exec edits are last-write-wins across the whole blob.

## The caps live in one place

`lib/caps.js`. `CAPS`, `MAX_COMMENTS` and `STOCK_HISTORY_CAP` are imported by
the save route, the append routes, the archive route and the control room's two
client-side trims (`publish()` and `addPricePoint()` in `Site.jsx`). Import it;
do not write the number again.

They used to be copied into each of those, and they drifted: publishing a notice
trimmed to 40 against a cap of 60, and recording a price trimmed history to 60
against 120, so a notice posted on the site quietly dropped entries that the same
notice posted from Discord would have kept. Restore needed a fourth copy, which
was the point to stop.

The two `slice(0, 40)` calls left in `Site.jsx` are **not** caps — they are how
many shift and transaction rows the staff room renders. See the note in "Known
limits".

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
