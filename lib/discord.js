/**
 * Posts to the company's webhooks from the server. Webhook URLs are stored
 * with the company record and are never sent to a browser.
 *
 * There can be several. Each one carries an `events` setting so a channel can
 * take only what it wants — shift logs every day would drown an announcements
 * channel, which is the whole reason the list exists.
 */

/**
 * What a webhook can be pointed at.
 *
 * Client desk requests are deliberately absent: they name a client and arrive
 * whenever somebody fills the form, so they stay on the site and out of the
 * channel. A hook still storing the old "Client requests" value simply matches
 * nothing, which is the intended outcome — it is not migrated to something
 * else, because that would start sending it posts nobody asked it to carry.
 */
export const HOOK_EVENTS = ["All posts", "Announcements", "Shift log"];

/**
 * The webhooks that should receive one kind of post.
 *
 * A hook with no `events` counts as "All posts": that is what a migrated
 * legacy webhook looks like, and silently dropping its posts would be a
 * worse default than sending one too many.
 */
function hooksFor(data, event) {
  const list = Array.isArray(data?.discord?.hooks) ? data.discord.hooks : [];
  const configured = list.filter((h) => String(h?.url || "").trim());

  if (!configured.length) {
    // Nothing configured at all — fall back to the legacy single URL, in case
    // a record reached here without passing through ensureData().
    const legacy = String(data?.discord?.webhook || "").trim();
    return {
      configured: legacy ? 1 : 0,
      targets: legacy ? [{ name: "Main", url: legacy }] : [],
    };
  }

  // The fallback deliberately does NOT apply once hooks exist. Reaching for it
  // whenever routing excluded everything would quietly send a category to the
  // old URL precisely because somebody had routed it away from there.
  const targets = configured.filter((h) => {
    // No event, or an explicit "All posts", is a broadcast — that is what the
    // control room's test message uses to prove every hook is reachable.
    if (!event || event === "All posts") return true;
    const on = h.events || "All posts";
    return on === "All posts" || on === event;
  });

  return { configured: configured.length, targets };
}

async function postOne(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}

export async function postToDiscord(data, { title, body, footer, color, event }) {
  const { configured, targets } = hooksFor(data, event);
  if (!targets.length) {
    return configured
      ? "No webhook is set to receive that, so nothing was sent."
      : "No webhook saved, so nothing was sent.";
  }

  const payload = {
    username: (data.company?.short || "Company") + " Terminal",
    embeds: [
      {
        title: String(title || "").slice(0, 256),
        description: String(body || "").slice(0, 4000),
        color: color ?? 0x1e6a4f,
        footer: {
          text:
            footer ||
            (data.company?.ticker || "") + " · posted from the company site",
        },
      },
    ],
  };

  // One slow or dead webhook should not hold up the others.
  const results = await Promise.all(
    targets.map(async (h) => ({
      name: String(h.name || "").trim() || "webhook",
      ...(await postOne(String(h.url).trim(), payload)),
    }))
  );

  const sent = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (!failed.length) {
    return sent.length === 1
      ? "Posted to Discord."
      : `Posted to Discord (${sent.length} channels).`;
  }

  const names = failed.map((f) => f.name).join(", ");
  if (!sent.length) {
    return failed.length === 1
      ? "Discord refused it. Check the webhook URL."
      : `None of the ${failed.length} webhooks accepted it. Check the URLs.`;
  }
  return `Posted to ${sent.length}, but ${names} failed. Check that URL.`;
}
