import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// Même piège que lib/appels-offres/file-attente.ts : APP_URL est le
// domaine stable à utiliser pour tout callback externe QStash, jamais
// VERCEL_URL (protégé par "Vercel Authentication" par déploiement).
function base(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function construireUrlCallbackDecoupage(): string {
  return `${base()}/api/veille/decouper`;
}

export function construireUrlCallbackStructuration(): string {
  return `${base()}/api/veille/structurer`;
}

export async function mettreEnFileDecoupageBomp(bompNumeroId: string): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallbackDecoupage(),
    body: { bompNumeroId },
  });
}

export async function mettreEnFileStructurationAvis(avisId: string): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallbackStructuration(),
    body: { avisId },
  });
}
