#!/bin/sh
# Re-apply docs/channel-posts.json to the pinned intro posts (edits in place, pins stay).
# Run on the VPS from the repo: sh scripts/edit-channel-posts.sh
# REST with the bot token inside the running container — no second gateway login.
cd "$(dirname "$0")/.." && docker compose exec -T bot node --input-type=module -e '
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { posts } = JSON.parse(raw);
const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "content-type": "application/json" };
for (const [name, p] of Object.entries(posts)) {
  const res = await fetch(`https://discord.com/api/v10/channels/${p.channel_id}/messages/${p.message_id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ embeds: [p.embed], allowed_mentions: { parse: [] } }),
  });
  console.log(name, res.ok ? "edited" : `FAIL ${res.status} ${(await res.text()).slice(0, 200)}`);
}' < docs/channel-posts.json
