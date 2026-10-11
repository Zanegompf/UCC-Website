import { readKey, writeKey, dropKey } from "@/lib/store";
import { MAX_THREADS, MAIL_BYTES } from "@/lib/caps";

/**
 * Messages between accounts.
 *
 * Deliberately NOT on the company record. That record is read whole by every
 * page load and written whole by every executive save, so mail on it would
 * mean `filterData` was the only thing between one person's messages and
 * everybody else — and a single slip there would publish them. Under its own
 * key, nothing reaches a browser except what /api/mail picks out for the
 * caller. It also keeps the record from growing with every conversation.
 *
 * A thread:
 *   { id, subject, from, to: {kind: "user" | "role", value}, ts, updated,
 *     messages[]{id, ts, from, body} }
 *
 * `from`, `to.value` (for a user) and each message's `from` are account
 * usernames, never in-game names. `ts` and `updated` are full ISO timestamps,
 * unlike the date-only ones on the record, because a conversation needs to know
 * which reply came first on the same day.
 */
export const MAIL_KEY = "ucc:mail:v1";

/**
 * Who has read what, one key per account: { threadId: isoTimestamp }.
 *
 * Kept off the mail itself on purpose. Opening a thread is far more common than
 * writing in one, and the mail is read, modified and written whole — so marking
 * a thread read inside it would race every message sent at the same moment, and
 * the loser of that race would be a message. Here only the account itself ever
 * writes its key.
 */
const marksKey = (account) => "ucc:mail:read:" + account;

/**
 * The roles a message can be addressed to. Company ranks only: `client` and
 * `member` are left out because writing to every client at once is a
 * broadcast, which is what a notice is for.
 */
export const MAIL_ROLES = ["ceo", "exec", "legal", "rnd", "staff"];

/**
 * What a deleted account's name becomes in the mail. Usernames are
 * `[a-z0-9_]`, so nobody can register one starting with `~` — which is what
 * stops a new account taking an old name and inheriting its conversations.
 */
export const RETIRED_PREFIX = "~";

export async function readMail() {
  const m = await readKey(MAIL_KEY);
  return { threads: Array.isArray(m?.threads) ? m.threads.filter(Boolean) : [] };
}

/**
 * Writes the mail back, trimmed. Most recently active first; past the thread
 * cap, and then past the byte budget, the quietest threads go. A rolling
 * window like the record's logs — see "Known limits" in CLAUDE.md.
 */
export async function writeMail(mail) {
  let threads = [...mail.threads]
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .slice(0, MAX_THREADS);
  while (threads.length > 1 && JSON.stringify({ threads }).length > MAIL_BYTES) {
    threads.pop();
  }
  return writeKey(MAIL_KEY, { threads });
}

export async function readMarks(account) {
  const m = await readKey(marksKey(account));
  return m && typeof m === "object" && !Array.isArray(m) ? m : {};
}

export async function writeMarks(account, marks) {
  return writeKey(marksKey(account), marks);
}

/**
 * Whether this account may read (and so reply to) a thread.
 *
 * A role thread follows the role, not the person: whoever holds it now sees it,
 * so a new chief executive inherits what was written to the last one. Anyone
 * who has posted in a thread keeps it too, so a demotion does not snatch away a
 * conversation somebody was part of.
 */
export function canSee(thread, account, role) {
  if (!thread || !account) return false;
  if (thread.from === account) return true;
  if (thread.to?.kind === "user" && thread.to.value === account) return true;
  if (thread.to?.kind === "role" && thread.to.value === role) return true;
  return (thread.messages || []).some((m) => m.from === account);
}

/** Unread means the last word is somebody else's and it is newer than your last look. */
export function isUnread(thread, account, marks) {
  const last = (thread.messages || [])[thread.messages.length - 1];
  if (!last || last.from === account) return false;
  return String(last.ts) > String(marks[thread.id] || "");
}

/**
 * Called when an account is deleted. Its name in the mail becomes `~name`, so
 * the people it wrote to keep the conversation and see who it was with, but a
 * later account registering the same name starts with an empty inbox.
 */
export async function retireAccount(name) {
  const gone = RETIRED_PREFIX + name;
  const swap = (v) => (v === name ? gone : v);
  const mail = await readMail();
  let touched = false;
  const threads = mail.threads.map((t) => {
    const mentions =
      t.from === name ||
      (t.to?.kind === "user" && t.to.value === name) ||
      (t.messages || []).some((m) => m.from === name);
    if (!mentions) return t;
    touched = true;
    return {
      ...t,
      from: swap(t.from),
      to: t.to?.kind === "user" ? { ...t.to, value: swap(t.to.value) } : t.to,
      messages: (t.messages || []).map((m) => ({ ...m, from: swap(m.from) })),
    };
  });
  if (touched) await writeMail({ threads });
  await dropKey(marksKey(name));
}
