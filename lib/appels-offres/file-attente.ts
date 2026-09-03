import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

function construireUrlCallback(): string {
  // VERCEL_URL pointe vers l'URL unique du déploiement en cours
  // (ex. noubinao-<hash>-k-nowledge.vercel.app), pas le domaine de
  // production — Vercel protège ces URLs par déploiement même quand
  // "Vercel Authentication" est désactivée pour le domaine principal,
  // ce qui faisait échouer tout callback QStash avec 401 "Protected
  // deployment". APP_URL est un domaine stable et explicite, à définir
  // dans les variables d'environnement Vercel (production) — voir
  // CLAUDE.md.
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/dao/traiter`;
}

export async function mettreEnFileTraitementDao(
  appelOffresId: string,
  mimeType: string,
): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallback(),
    body: { appelOffresId, mimeType },
  });
}
