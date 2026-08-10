/**
 * United Commerce Discord bot.
 *
 * Reads and writes the same company record the website uses, through the
 * site's /api/bot endpoint. The bot holds no data of its own, so the site
 * and Discord can never disagree.
 */
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  SITE_URL,
  BOT_API_KEY,
  STAFF_ROLE_ID,
  EXEC_ROLE_ID,
} = process.env;

const INK = 0x10233f;
const LEDGER = 0x1e6a4f;
const SEAL = 0x8c2f2a;

const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
};

async function siteGet(scope = "public") {
  const res = await fetch(`${SITE_URL}/api/bot?scope=${scope}`, {
    headers: { "x-bot-key": BOT_API_KEY },
  });
  if (!res.ok) throw new Error("The site refused the request (" + res.status + ")");
  const body = await res.json();
  return body.data;
}

async function sitePost(payload) {
  const res = await fetch(`${SITE_URL}/api/bot`, {
    method: "POST",
    headers: { "x-bot-key": BOT_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The site refused the change.");
  return body;
}

const hasRole = (interaction, roleId) =>
  Boolean(roleId) && interaction.member?.roles?.cache?.has(roleId);

const commands = [
  new SlashCommandBuilder().setName("stock").setDescription("Current UCC share price and market capital"),
  new SlashCommandBuilder().setName("mission").setDescription("What the company is for"),
  new SlashCommandBuilder().setName("staff").setDescription("Who works here and what they do"),
  new SlashCommandBuilder().setName("projects").setDescription("What the company is building"),
  new SlashCommandBuilder().setName("finances").setDescription("Latest month's figures (staff only)"),
  new SlashCommandBuilder()
    .setName("setprice")
    .setDescription("Record a new share price (executives only)")
    .addNumberOption((o) => o.setName("price").setDescription("New price").setRequired(true))
    .addStringOption((o) => o.setName("label").setDescription("Date label, e.g. 15 July")),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post a notice to the website (executives only)")
    .addStringOption((o) => o.setName("headline").setDescription("Headline").setRequired(true))
    .addStringOption((o) => o.setName("body").setDescription("The notice itself"))
    .addStringOption((o) =>
      o
        .setName("audience")
        .setDescription("Who can read it")
        .addChoices(
          { name: "public", value: "public" },
          { name: "client", value: "client" },
          { name: "staff", value: "staff" }
        )
    ),
].map((c) => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (c) => {
  console.log(`Signed in as ${c.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      DISCORD_GUILD_ID
        ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
        : Routes.applicationCommands(DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log("Commands registered.");
  } catch (e) {
    console.error("Could not register commands:", e.message);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply();
    const name = interaction.commandName;

    if (name === "stock") {
      const d = await siteGet();
      const s = d.stock;
      const change = s.price - s.prevClose;
      const up = change >= 0;
      const embed = new EmbedBuilder()
        .setTitle(`${d.company.ticker} · $${s.price.toFixed(2)}`)
        .setColor(up ? LEDGER : SEAL)
        .addFields(
          { name: "Change", value: `${up ? "+" : ""}${change.toFixed(2)}`, inline: true },
          { name: "Market capital", value: compact(s.price * s.shares), inline: true },
          { name: "Shares issued", value: s.shares.toLocaleString("en-US"), inline: true },
          { name: "Book value per share", value: "$" + (d.financials.equity / s.shares).toFixed(2), inline: true }
        )
        .setFooter({ text: `Last posted ${s.updated} · ${d.company.exchange}` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (name === "mission") {
      const d = await siteGet();
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(d.company.name)
            .setDescription(d.company.mission)
            .setColor(INK)
            .setFooter({ text: d.company.tagline }),
        ],
      });
    }

    if (name === "staff") {
      const d = await siteGet();
      const embed = new EmbedBuilder().setTitle("Who works here").setColor(INK);
      d.staff.slice(0, 25).forEach((m) => {
        embed.addFields({ name: `${m.name} — ${m.role}`, value: m.note || "\u200b" });
      });
      return interaction.editReply({ embeds: [embed] });
    }

    if (name === "projects") {
      const d = await siteGet();
      const embed = new EmbedBuilder().setTitle("What we are building").setColor(INK);
      d.projects.slice(0, 25).forEach((p) => {
        embed.addFields({
          name: `${p.name} — ${p.progress}%`,
          value: `${p.status}, target ${p.target}\n${p.summary}`,
        });
      });
      return interaction.editReply({ embeds: [embed] });
    }

    if (name === "finances") {
      if (!hasRole(interaction, STAFF_ROLE_ID) && !hasRole(interaction, EXEC_ROLE_ID)) {
        return interaction.editReply("Staff only. Ask an executive for the role.");
      }
      const d = await siteGet("staff");
      const p = d.financials.periods[d.financials.periods.length - 1] || {};
      const net = (p.revenue || 0) - (p.expenses || 0);
      const embed = new EmbedBuilder()
        .setTitle(`The books — ${p.label || "latest"}`)
        .setColor(net >= 0 ? LEDGER : SEAL)
        .addFields(
          { name: "Revenue", value: money(p.revenue), inline: true },
          { name: "Expenses", value: money(p.expenses), inline: true },
          { name: "Net", value: money(net), inline: true },
          { name: "Total assets", value: money(d.financials.assets), inline: true },
          { name: "Equity", value: money(d.financials.equity), inline: true }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (name === "setprice") {
      if (!hasRole(interaction, EXEC_ROLE_ID)) {
        return interaction.editReply("Executives only.");
      }
      const price = interaction.options.getNumber("price");
      const label = interaction.options.getString("label");
      const r = await sitePost({ action: "price", price, label });
      return interaction.editReply(
        `Recorded. ${price.toFixed(2)} is the new last-traded price, up from ${r.prevClose.toFixed(2)}. The website is already showing it.`
      );
    }

    if (name === "announce") {
      if (!hasRole(interaction, EXEC_ROLE_ID)) {
        return interaction.editReply("Executives only.");
      }
      await sitePost({
        action: "announce",
        title: interaction.options.getString("headline"),
        body: interaction.options.getString("body") || "",
        audience: interaction.options.getString("audience") || "public",
        author: interaction.user.username,
      });
      return interaction.editReply("Posted to the website.");
    }
  } catch (e) {
    const message = "That did not work: " + e.message;
    if (interaction.deferred) return interaction.editReply(message);
    return interaction.reply({ content: message, ephemeral: true });
  }
});

client.login(DISCORD_TOKEN);
