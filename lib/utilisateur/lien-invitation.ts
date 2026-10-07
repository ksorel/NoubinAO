export function construireLienInvitation(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/invitation/${token}`;
}
