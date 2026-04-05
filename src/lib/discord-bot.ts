import { db } from "@/lib/db";

export async function sendCampaignAlertDM(userId: string, campaignName: string, description: string) {
  if (!process.env.DISCORD_BOT_TOKEN) return;

  try {
    // Create DM channel
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });
    const dm = await dmRes.json();

    // Send message
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `🎬 **New Campaign Alert!**\n\n**${campaignName}**\n${description}\n\n👉 Start clipping now: https://clipershq.com/login`
      }),
    });
  } catch (e) {
    console.error('Failed to send Discord DM:', e);
  }
}

export async function broadcastCampaignAlert(campaignName: string, description: string) {
  if (!db) return;

  try {
    const clippers = await db.user.findMany({
      where: { role: 'CLIPPER', status: 'ACTIVE' },
      select: { discordId: true, email: true },
    });

    for (const clipper of clippers) {
      // Send Discord DM
      if (clipper.discordId && process.env.DISCORD_BOT_TOKEN) {
        sendCampaignAlertDM(clipper.discordId, campaignName, description).catch(() => {});
      }

      // Send email alert
      if (clipper.email && process.env.EMAIL_API_KEY) {
        import("@/lib/email").then(({ sendCampaignAlertEmail }) =>
          sendCampaignAlertEmail(clipper.email!, campaignName, description).catch(() => {})
        ).catch(() => {});
      }

      // 1 second delay between each user to avoid Discord rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('Failed to broadcast campaign alert:', e);
  }
}
