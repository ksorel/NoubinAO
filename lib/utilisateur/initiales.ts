export function deriverInitiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);

  if (mots.length === 0) return "";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();

  return (mots[0][0] + mots[1][0]).toUpperCase();
}
