export function construireUrlCallbackSyncEmail(): string {
  // Même piège que lib/appels-offres/file-attente.ts : VERCEL_URL pointe
  // vers l'URL unique du déploiement en cours, protégée par "Vercel
  // Authentication" même quand cette protection est désactivée pour le
  // domaine de production principal — APP_URL est le domaine stable à
  // utiliser pour tout callback externe (QStash, webhooks).
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/sync`;
}
