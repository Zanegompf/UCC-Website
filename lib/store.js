const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "ucc:company:v1";

/**
 * Run one Redis command over Upstash's REST endpoint.
 *
 * Exported because lib/guard.js keeps its rate-limit counters in the same
 * database, under short-lived `ucc:rl:*` keys. Those deliberately do NOT live
 * in the company record: that record is read, modified and written whole, so
 * counting sign-in attempts inside it would mean a full rewrite per attempt.
 */
export async function redis(args) {
  return cmd(args);
}

async function cmd(args) {
  if (!URL || !TOKEN) {
    throw new Error(
      "Storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Storage refused the request (" + res.status + ")");
  const json = await res.json();
  return json.result;
}

export async function readData() {
  const raw = await cmd(["GET", KEY]);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

export async function writeData(data) {
  await cmd(["SET", KEY, JSON.stringify(data)]);
  return data;
}
