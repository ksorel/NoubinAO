// À lancer une fois par environnement après déploiement, jamais au runtime.
import { Client } from "@upstash/qstash";

async function main() {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.error("APP_URL manquante — impossible de construire la destination.");
    process.exit(1);
  }

  const { scheduleId } = await qstash.schedules.create({
    destination: `${appUrl}/api/veille/marches-publics/sync`,
    cron: "0 3 * * *", // tous les jours à 3h du matin (faible trafic, avant l'ouverture des bureaux)
  });

  console.log(`Schedule créée : ${scheduleId}`);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
