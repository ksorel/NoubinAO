import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

function construireUrlCallback(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
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
