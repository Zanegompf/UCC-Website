# The United Commerce Corporation

The company website and Discord bot for UCC on DemocracyCraft. The site shows
the share price, the books, the company chart, the staff and the projects.
Clients and staff sign in to see more. Staff clock their shifts and log the
deals done off the chest shops. The bot reads and writes the same record, so
Discord and the website can never disagree.

Nothing here is real money. It is a roleplay company on a Minecraft server.

---

## What you are setting up

Three free accounts, in this order:

1. **Upstash** — stores the company record.
2. **Vercel** — runs the website and holds your domain.
3. **Railway** — runs the Discord bot. Skip this if you only want the website.

Total cost: nothing, apart from the domain itself (about £10 a year).
Expect the website to take about 30 minutes the first time.

---

## Part 1 — The database (5 minutes)

1. Go to **upstash.com**, sign up, and create a **Redis** database. Any region
   near you is fine; pick the free tier.
2. Open the database and click the **Details** tab (the first one, left of
   Usage — the console may drop you on CLI instead). Scroll past the metrics to
   the **Connect to your database** box and select the **REST** or **.env** tab.
3. You will see a `.env`-style block. Copy both lines:

   ```
   UPSTASH_REDIS_REST_URL="https://your-db-name.upstash.io"
   UPSTASH_REDIS_REST_TOKEN="AX...long string..."
   ```

   Hover over a field and a copy button appears. If you cannot find the Connect
   section, scroll further down the database page — the endpoint and token are
   listed there too.

**Take the Standard token, not the Read Only one.** Upstash issues two per
database. With the read-only token the site will load but every save silently
fails, which is a miserable thing to debug.

That is the whole database step. There are no tables to create — the site
writes one record and creates it for you on first load.

---

## Part 2 — Your secrets (2 minutes)

You need two long random strings that nobody can guess. Generate each one by
running this in a terminal, or use a password generator:

```
openssl rand -base64 32
```

Run it twice. The first result is your `AUTH_SECRET` (it signs login cookies).
The second is your `BOT_API_KEY` (it lets the bot talk to the site).

**Do not** use words, your username, or anything from this file. Anyone with
`AUTH_SECRET` can forge an executive login.

---

## Part 3 — The website (15 minutes)

1. Put this folder in a GitHub repository. On github.com, create a new repo,
   then either drag the files into the web uploader or use:

   ```
   git init
   git add .
   git commit -m "United Commerce"
   git remote add origin https://github.com/YOUR_NAME/ucc-site.git
   git push -u origin main
   ```

2. Go to **vercel.com**, sign in with GitHub, and choose **Add New → Project**.
   Pick the repository. Vercel will detect Next.js on its own — do not change
   the build settings.

3. Before clicking Deploy, open **Environment Variables** and add these six:

   | Name | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | from Part 1 |
   | `UPSTASH_REDIS_REST_TOKEN` | from Part 1 |
   | `AUTH_SECRET` | your first random string |
   | `BOT_API_KEY` | your second random string |
   | `ADMIN_USERNAME` | the username you want to sign in with |
   | `ADMIN_PASSWORD` | a strong password, at least 12 characters |

4. Deploy. When it finishes you get a URL like `ucc-site.vercel.app`. Open it.

5. Sign in with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` you just set. You now
   have the **Control room** tab.

**Important:** `ADMIN_USERNAME` and `ADMIN_PASSWORD` are only used once, to
create the founding account on the very first page load. Changing them later
does nothing. To change your password afterwards, open the tab with your
username on it and use **Change your password** — it asks for the current one.

**Visitor numbers** are collected by Vercel's own analytics, which reports
nothing until you switch **Web Analytics** on for the project in the Vercel
dashboard. It is cookieless and served from your own domain, so there is
nothing to configure in the code.

---

## Part 4 — Your domain (10 minutes)

1. Buy the domain. **Cloudflare Registrar** sells at cost with no renewal
   markup, which is the cheapest honest option. Namecheap and Porkbun are fine
   too. Avoid GoDaddy — the first year is cheap and the renewals are not.

2. In Vercel: **Project → Settings → Domains → Add**. Type your domain.

3. Vercel shows you either a nameserver change or two DNS records. Copy what it
   shows into your registrar's DNS page. Vercel's instructions are accurate;
   follow them exactly rather than guessing.

4. Wait. It usually takes 10 minutes and occasionally a few hours. HTTPS is set
   up automatically once the DNS resolves.

---

## Part 5 — Discord webhooks (5 minutes, no bot needed)

The site can post to Discord on its own, with no bot and no hosting:

1. In Discord: **Channel Settings → Integrations → Webhooks → New Webhook**.
   Point it at your announcements channel and copy the URL.
2. On your site: **Control room → Discord → Webhooks → Add**. Give it a label,
   paste the URL, and save. Then press **Test every webhook**.

You can add **as many as you like, one per channel**. Each has a "What it
receives" setting so a channel only gets what you aimed at it. Only notices are
sent at the moment, so both settings behave the same — the pair is there so a
hook can be aimed precisely later.

**Publishing a public notice is the only thing on this site that posts to
Discord.** Client requests, shift logs, transactions and job applications all
stay on their boards on the site. Each of those is filed several times a day and
names a person, so none of them belongs in a channel. There is no "push the
price to Discord" button either — post the price as a notice with the figure in
it.

Webhook URLs are only ever stored server-side and are never sent to a visitor's
browser. Any executive can read them in the control room, so treat them as
shared company secrets. If one leaks, delete the webhook in Discord and add a
new one here.

---

## Part 6 — The bot (optional, 20 minutes)

Webhooks only push *out* to Discord. The bot is what lets people pull data
*from* the site with slash commands.

**Create the application**

1. Go to **discord.com/developers/applications → New Application**.
2. **Bot → Reset Token**, copy the token. This is a password for your bot;
   never paste it into a channel or commit it to GitHub.
3. **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then
   open the generated URL to invite it to your server.
4. From **General Information**, copy the Application ID.
5. In Discord, turn on Developer Mode (User Settings → Advanced), then
   right-click your server and your staff/executive roles to **Copy ID**.

**Run it**

1. Go to **railway.app**, sign in with GitHub, **New Project → Deploy from
   GitHub repo**, and pick this repository.
2. In **Settings**, set the root directory to `bot`.
3. In **Variables**, add:

   | Name | Value |
   |---|---|
   | `DISCORD_TOKEN` | the bot token |
   | `DISCORD_CLIENT_ID` | the application ID |
   | `DISCORD_GUILD_ID` | your server ID |
   | `SITE_URL` | `https://your-domain.com`, no trailing slash |
   | `BOT_API_KEY` | **the same string you gave Vercel** |
   | `STAFF_ROLE_ID` | your staff role ID |
   | `EXEC_ROLE_ID` | your executive role ID |

4. Deploy. Commands register within a minute.

**Commands**

| Command | Who can use it |
|---|---|
| `/stock` | anyone |
| `/mission` | anyone |
| `/staff` | anyone |
| `/projects` | anyone |
| `/finances` | staff and executive roles |
| `/setprice` | executive role |
| `/announce` | executive role |

`/setprice` and `/announce` write straight to the website. The private commands
are gated on **Discord role IDs**, not on site accounts, so if you leave
`STAFF_ROLE_ID` blank, nobody can use `/finances` — including you.

---

## Running it on your own computer

```
npm install
npm run dev
```

Create a file called `.env.local` with the same variables from Part 3, then
open `localhost:3000`.

---

## What is on the site

Every tab has its own address, so a link or a bookmark comes back to the same
place instead of dropping on the overview — `#share`, `#staff-room`,
`#control-room` and so on. Back and forward walk through the tabs.

| Tab | What it holds |
|---|---|
| **Overview** | Mission, the company chart, notices, and the job application form |
| **Share** | Price, market capital, book value, the chart and the full price table |
| **Financials** | Monthly revenue and costs, and the balance sheet for staff |
| **People** | The same chart as the overview, with the people in it |
| **Projects** | What is being built, with progress |
| **Client desk** | The rate card, and the form clients use to ask for something |
| **Staff room** | Requests, the hiring board, standing orders, shift and transaction logs, and the way through to the legal department |
| **Control room** | Everything that edits the record |

**The company chart.** Divisions are a tree, not a list: each one names the
entry it sits under, and a blank one is the top. Governing bodies (the board,
the committee, a department) carry **no code** and are drawn in the deeper
tone; operating divisions carry a code and get the gold badge. The hero's "N
divisions" counts the coded ones, so adding a board above or a desk below does
not inflate it.

The overview chart shows the **shape** and names nobody. The People tab is the
same chart with the **people** in it, so the two can never disagree about who
runs what. Who appears where comes from each staff member's department field,
which takes a comma-separated list — the chief executive can chair the board
and sit on the committee. A department that matches no block does not vanish;
those people are listed under "Elsewhere on the books" so a typo never deletes
somebody from the page.

**Editing the chart in place.** A chief executive gets a hammer button on the
People tab that unlocks the chart: click any name, title or description and
change it, and it saves when you click away. Renaming a block carries its
children and its people with it. Removing a block is only offered when nothing
hangs off it and nobody is in it, and both removals ask twice — the record is
the only copy.

**The shift log.** Staff clock in when they start and out when they finish, and
the two make **one entry**, not two. Times are typed rather than stamped from
the clock, with an AM/PM picker beside the field, because people log the shift
around the work and a forgotten clock-in still has to be enterable afterwards.
Leave the picker blank if you write 24-hour time. A shift with no time out is
still open and reads "still on" with an Open badge. You cannot clock in twice —
close the open one first, or payroll ends up reading a shift nobody can finish.

**The transaction log.** Deals settled off the chest shops: legal work,
materials contracts. The amount and the material count are **text, not
numbers**, because a deal here is as often "half the takings" or "3 stacks of
iron" as it is a figure. Fill in either or both. Staff file them, so staff can
read them.

**The legal department.** A **Legal Department** button sits at the top of the
staff room, above the incoming requests, and opens a page of its own. Only the
legal rank and executives see the button — staff would only reach a page the
server has already emptied.

The page has a section for each kind of document, because a contract and a court
filing are not the same job and one long list of everything would mean reading it
all to find either:

| Section | For |
|---|---|
| Contracts | Agreements the company has signed or is negotiating |
| Court filings | Anything lodged with, or served on us by, a court |
| Licence applications | Applications for the licences the trades need |
| Legal opinions | Written advice from counsel, and the question it answered |
| Compliance notices | Notices received or issued about rules and breaches |
| Company filings | Registrations, amendments, anything filed as the company |

Each section has its own **New …** button, so you never pick the kind from a
dropdown — the button you pressed is the answer. A filing takes a title, the
other party, a reference, a status (drafting, filed, in review, agreed, closed,
withdrawn) and as much detail as you want to write.

**Anyone in the department can comment on any filing**, and the thread stays
attached to the document. That is the point of keeping it here rather than in
Discord: six months later nobody can find the channel message that explained why
a clause reads the way it does. Filings and comments never post to Discord.

**Only the chief executive can delete a filing** from the department's page. The
button asks twice — it turns into "Delete this filing? Yes / Keep" — because the
filing and every comment on it go for good, and nothing else on that page is
irreversible. A filing typed in by hand in the control room has no Delete button;
remove that one in the control room instead.

Executives can correct a filing in Control room → Legal filings. That page does
not touch the comments — those are only added from the department's own page. It
does still have a Remove button on each row, so an executive can take a filing
off the record that way. If you want deletion to be the chief executive's alone,
that is the thing to change.

**Hiring.** Anyone with an account can apply from the front page, including a
plain member — the whole point is that they do not work here yet. The account
requirement is what stops it being an anonymous spam form. Applications are
**executive-only** to read, one level above client requests, because an
application states what somebody expects to be paid.

They appear in two places, the hiring board in the staff room and the
Applications page in the control room. Both show the **account the application
was filed from**, with the access tabs beside it, so hiring somebody is done
where you read them. The account and the in-game name on the form need not
match — the account is what access hangs off. The job list in the dropdown is
the server's own, and it is editable in the control room, because the server
changes it and that should not need a deploy.

**The control room.** Posting a notice, moving the price and Discord stay on
the page. Everything past them is **one page each**, reached from the cards
under "The rest of the record" — company details, divisions, staff, projects,
rate card, financials, client requests, transactions, shift log, applications,
legal filings, job list, deleted records and accounts. They used to be stacked in
one column, so reaching the job list meant scrolling past the whole company.
Everything on those pages saves the moment you type it.

**Deleted records.** Four lists remember what was removed from them: **job
applications, legal filings, client requests and projects**. Delete one and what
it said is kept on the Deleted records page, newest first, with who deleted it
and when. It exists because a mis-click on Remove used to be final — the save
overwrote the list and nothing on the record remembered.

It is **read-only**: the live record really is gone, this is the copy kept in
case it should not have been, to be read and retyped. It holds the last **200**
deletions, then the oldest fall off, so it is a safety net for a recent mistake
rather than a permanent archive.

Everything else is still deleted for good — staff, divisions, the rate card, the
job list, notices, shifts, transactions and the monthly figures. Those change
constantly and keeping every version would bloat the record that every visitor
loads.

**Settings** (the cog in the masthead) holds display preferences saved on that
device only — full figures instead of $1.68M, and which tab a plain visit opens
on. Anyone can use those, signed in or not. Executives also get the company
switches there: whether anyone may create an account, and what a new one starts
as.

---

## How permissions actually work

There are seven levels: **visitor, member, client, staff, legal, executive,
chief executive**.

**Member** is what anyone gets when they create their own account from the
sign-in box. They can sign in, but they see exactly what a visitor sees. That
is deliberate: making an account should not hand a stranger your rate card or
your client project list. Promote people yourself, either in Control room →
Accounts or straight from their application.

You can turn self-registration off entirely, or change what new accounts get,
in **Settings → Company**. Leave the default on Member unless you have a
reason not to.

The important part is *where* the filtering happens. When anyone loads the
site, the server decides what they are allowed to see and strips everything
else out before sending the page. A visitor's browser never receives the
balance sheet, the internal staff notes, the client rate card, the shift log or
the hidden projects — not hidden with CSS, not present at all. Opening
developer tools shows them nothing extra.

| | Visitor | Member | Client | Staff | Legal | Exec | CEO |
|---|---|---|---|---|---|---|---|
| Mission, share price, company chart, public projects | yes | yes | yes | yes | yes | yes | yes |
| Revenue, expenses, totals | yes | yes | yes | yes | yes | yes | yes |
| Change own password | — | yes | yes | yes | yes | yes | yes |
| Apply for a job | — | yes | yes | yes | yes | yes | yes |
| Rate card and the client desk | — | — | yes | yes | yes | yes | yes |
| Client-only projects, the full price table | — | — | yes | yes | yes | yes | yes |
| Balance sheet, internal staff notes | — | — | — | yes | yes | yes | yes |
| Incoming client requests | — | — | — | yes | yes | yes | yes |
| Shift log, transaction log, clocking in | — | — | — | yes | yes | yes | yes |
| Legal filings, and commenting on them | — | — | — | — | yes | yes | yes |
| Job applications and the hiring board | — | — | — | — | — | yes | yes |
| Deleted records | — | — | — | — | — | yes | yes |
| Editing anything, accounts, webhooks | — | — | — | — | — | yes | yes |
| Editing the company chart in place | — | — | — | — | — | — | yes |
| Deleting a legal filing from the department's page | — | — | — | — | — | — | yes |
| Seating or unseating a chief executive | — | — | — | — | — | first only | yes |

**Legal** is a department rather than a promotion. It sees everything a staff
member sees, plus the legal department's filings, which it can add to and comment
on. It sees nothing an executive sees — no accounts, no webhooks, no hiring
board, no control room. Give it to whoever does the company's legal work; it does
not count as an executive for the "last executive" guard.

**Chief executive** sees exactly what an executive sees. It adds three things:
unlocking the People chart to edit it in place, deleting a legal filing, and
control of its own seat.

**Only a chief executive may seat or unseat another.** The one exception is
getting started: where the company has no chief executive at all, an executive
may appoint the first, otherwise a site set up before the role existed could
never gain one. Seating somebody is done with the **CEO** tab on their row in
Control room → Accounts; the add/change form below only offers member through
exec.

One thing to know if you are deploying this for a different company: the site
seats the account named `OWNER_ACCOUNT` in `lib/seed.js` as chief executive
automatically, on any page load where that account exists and the seat is empty.
It ships set to this company's owner. Change it to your own username, or empty
it, before you deploy.

Passwords are hashed with bcrypt, so nobody can read them back out of the
database — not even you. If someone forgets theirs, reissue it in Control room
→ Accounts.

Sessions last a week and live in a signed, http-only cookie. Anyone can change
their own password from the tab with their username on it, which asks for the
current one first. Since passwords are hashed, a forgotten password cannot be
looked up — reissue it in Control room → Accounts instead.

**Changing someone's access level takes effect immediately**, on whatever
device they are already signed in on. Each account has a row of access tabs —
Member, Client, Staff, Exec, CEO — and clicking one changes their level
straight away. Deleting an account cuts them off just as fast. The site checks
the stored account on every request rather than trusting what their login
cookie says, so a demotion is real the moment you make it.

Two guardrails: you cannot change your own access level (ask another
executive), and the last executive account cannot be demoted or deleted. Both
exist so nobody locks themselves out of their own company. The second counts
the chief executive as an executive, so a company whose only privileged account
is the CEO is not treated as locked out of itself.

One limitation worth knowing: changing a *password* does not sign that person
out on their other devices, because the session itself is stateless. If an
account is genuinely compromised, delete it — that does cut off every device —
rather than only changing the password.

---

## Limits worth knowing

**The logs are rolling windows, not archives.** Client requests, shifts,
transactions, applications, legal filings and deleted records keep the most recent
**200** each, and a filing keeps its most recent **50** comments. Past that the oldest fall off
and are gone, so if a shift matters for payroll beyond that, write the total down
somewhere else. Notices keep the most recent **60**, and the price chart the most
recent **120** price points.

The staff room shows the **last 40** shifts and transactions to keep the page
readable. The rest are still on the record — Control room → Shift log and
Transactions list all of them.

**Forms are rate-limited per account or per connection.** Nothing here is
tight enough to get in the way of ordinary use, but a script gets stopped:

| What | Limit |
|---|---|
| Signing in | 10 failures / 10 min per connection, 25 / 15 min per account |
| Creating an account | 5 / hour per connection |
| Changing a password | 10 failures / 15 min |
| Client desk requests | 10 / hour |
| Shifts and transactions | 30 / hour each |
| Job applications | 5 / hour |
| Legal filings and comments | 40 / hour combined |
| Posting to Discord | 20 / hour |

Sign-in and password changes count **failures only**, so using the site
normally is never punished. A refusal comes back as "too many attempts" with a
wait; the counters clear themselves.

**Two executives editing at once is last-write-wins.** The whole company record
saves as one object, so if two people have the control room open on different
pages, whoever saves second overwrites the first. In practice this only bites
when two people edit simultaneously — worth knowing before you hand out a
second executive account.

**Usernames are first-come.** Nothing checks that a username matches the
Minecraft account it claims to be, and there is no log of who changed what.

---

## Housekeeping

- Check Deleted records if something has gone missing from an application list,
  the legal filings, the client desk or the projects. It keeps the last 200
  deletions, so a mis-click is recoverable by retyping — but only for a while.
- **When someone leaves the company, delete their account.** That is the only
  thing that actually removes their access. Changing what a page says does not,
  and neither does demoting them if they still know the password.
- If you open self-registration, check the account list now and then. Anyone
  can take a username, and usernames are first-come.
- Tell people to use a password they do not use anywhere else. This is a
  Minecraft roleplay site, not a bank, and it should never hold a password that
  protects anything real.
- Give out new passwords in a direct message, never in a public channel.
- Read the hiring board before promoting anybody. The wage somebody is asking
  for is on their application, and staff cannot see each other's.
- Keep an eye on open shifts. One left open sits in the log as "still on" until
  somebody closes it, and only that account can.

---

## Things that commonly go wrong

**"Storage is not configured"** — the two Upstash variables are missing or
misspelled in Vercel. Add them, then redeploy: environment variables only take
effect on a new deployment.

**The site loads but nothing ever saves** — you copied the Read Only token.
Go back to Connect → REST in Upstash, take the Standard token, update
`UPSTASH_REDIS_REST_TOKEN` in Vercel, and redeploy.

**Signed in but no Control room tab** — your account is not an executive. Sign
in with the `ADMIN_USERNAME` account.

**Cannot sign in at all** — if the site loaded once before you set
`ADMIN_USERNAME`, the record was created with no accounts. Delete the key
`ucc:company:v1` in the Upstash console, set the variables, redeploy, and load
the site again.

**No hammer on the People tab** — that is chief-executive only. An executive
edits the chart through Control room → Divisions and Staff instead.

**No Legal Department button in the staff room** — that account is Staff, not
Legal. Change it in Control room → Accounts. Executives see the button too.

**A filing will not take comments** — it was typed in by hand in the control
room, so it has no reference of its own for a thread to attach to. File it from
the Legal Department page instead and the comments will work. The same filing has
no Delete button, for the same reason.

**"Only the chief executive can delete a filing"** — an executive cannot delete
from the Legal Department page. Either sign in as the chief executive, or remove
the row in Control room → Legal filings.

**"Only the chief executive can change who holds that seat"** — an executive
can appoint the first CEO, but not a second one, and cannot unseat one. Sign in
as the chief executive, or clear the seat from that account first.

**"You are already clocked in"** — there is an open shift on that account. Clock
out of it before starting another; a second open row would strand the first.

**Nothing arrives in Discord** — check you pressed **Test every webhook** and
it reported back. If the test works but notices do not appear, the notice was
not public: only public notices post, and only with the box ticked.

**Vercel Web Analytics shows nothing** — it has to be switched on for the
project in the Vercel dashboard. The browser console says so in as many words.

**Bot says "Bad or missing bot key"** — `BOT_API_KEY` differs between Vercel and
Railway. They must be character-for-character identical.

**Bot commands do not appear** — check `DISCORD_CLIENT_ID` and
`DISCORD_GUILD_ID`, and confirm you invited it with the `applications.commands`
scope.

---

## A note on the Next.js version

This is pinned to Next 14.2.35. Next 15 changed `cookies()` to an async
function, which would break `lib/auth.js` as written. If you upgrade, add
`await` to the `cookies()` calls in that file first.
