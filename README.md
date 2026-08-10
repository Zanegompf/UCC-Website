# The United Commerce Corporation

The company website and Discord bot for UCC on DemocracyCraft. The site shows
the share price, the books, the staff and the projects. Clients and staff sign
in to see more. The bot reads and writes the same record, so Discord and the
website can never disagree.

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
does nothing. To change your password afterwards, use Control room → Accounts
and save your own username again with a new password.

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

## Part 5 — Discord (5 minutes, no bot needed)

The site can post to Discord on its own, with no bot and no hosting:

1. In Discord: **Channel Settings → Integrations → Webhooks → New Webhook**.
   Point it at your announcements channel and copy the URL.
2. On your site: **Control room → Discord**, paste it, then **Send a test
   message**.

Now the site posts to Discord when you publish a public notice, push a price
update, or a client sends a request through the client desk.

The webhook URL is only ever stored server-side and is never sent to a
visitor's browser. Still, treat it as a company secret — anyone holding it can
post messages that look like they came from you. If it leaks, delete the
webhook in Discord and make a new one.

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
are gated on Discord role IDs, so if you leave `STAFF_ROLE_ID` blank, nobody
can use `/finances` — including you.

---

## Running it on your own computer

```
npm install
npm run dev
```

Create a file called `.env.local` with the same variables from Part 3, then
open `localhost:3000`.

---

## How permissions actually work

There are four levels: **visitor, client, staff, executive**.

The important part is *where* the filtering happens. When anyone loads the
site, the server decides what they are allowed to see and strips everything
else out before sending the page. A visitor's browser never receives the
balance sheet, the internal staff notes, the client rate card or the hidden
projects — not hidden with CSS, not present at all. Opening developer tools
shows them nothing extra.

| | Visitor | Client | Staff | Executive |
|---|---|---|---|---|
| Mission, share price, public projects | yes | yes | yes | yes |
| Revenue, expenses, totals | yes | yes | yes | yes |
| Rate card and the client desk | — | yes | yes | yes |
| Client-only projects | — | yes | yes | yes |
| Balance sheet, internal staff notes | — | — | yes | yes |
| Incoming client requests | — | — | yes | yes |
| Editing anything, accounts, webhook | — | — | — | yes |

Passwords are hashed with bcrypt, so nobody can read them back out of the
database — not even you. If someone forgets theirs, reissue it in Control room
→ Accounts.

Sessions last a week and live in a signed, http-only cookie.

---

## Housekeeping

- **When someone leaves the company, delete their account.** That is the only
  thing that actually removes their access. Changing what a page says does not.
- Tell people to use a password they do not use anywhere else. This is a
  Minecraft roleplay site, not a bank, and it should never hold a password that
  protects anything real.
- Give out new passwords in a direct message, never in a public channel.

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
