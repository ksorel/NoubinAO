import { Client } from "@upstash/qstash";

async function main() {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.error("APP_URL manquante — impossible de construire la destination.");
    process.exit(1);
  }

  const { scheduleId } = await qstash.schedules.create({
    destination: `${appUrl}/api/email/sync`,
    cron: "0 * * * *", // toutes les heures, à l'heure pile
  });

  console.log(`Schedule créée : ${scheduleId}`);
}

main();
