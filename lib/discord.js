/**
 * Posts to the company webhook from the server. The webhook URL is stored
 * with the company record and is never sent to a browser.
 */
export async function postToDiscord(data, { title, body, footer, color }) {
  const url = (data?.discord?.webhook || "").trim();
  if (!url) return "No webhook saved, so nothing was sent.";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
    return res.ok
      ? "Posted to Discord."
      : "Discord refused it (" + res.status + "). Check the webhook URL.";
  } catch (e) {
    return "Could not reach Discord. Check the webhook URL.";
  }
}
