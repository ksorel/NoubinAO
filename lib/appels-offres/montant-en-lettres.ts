const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES: Record<number, string> = {
  2: "vingt",
  3: "trente",
  4: "quarante",
  5: "cinquante",
  6: "soixante",
  8: "quatre-vingt",
};

function moinsDeCent(n: number, dernier: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;

  if (d === 7 || d === 9) {
    const base = d === 7 ? "soixante" : "quatre-vingt";
    if (u === 1 && d === 7) return `${base} et onze`;
    return `${base}-${UNITES[10 + u]}`;
  }
  if (u === 0) {
    return d === 8 && dernier ? "quatre-vingts" : DIZAINES[d];
  }
  if (u === 1 && d !== 8) {
    return `${DIZAINES[d]} et un`;
  }
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

// "cent" prend un -s seulement en bout de nombre (rien derrière, ou un nom
// comme "francs CFA") — jamais devant un autre mot de nombre ("mille",
// "million"...). `dernier` porte cette distinction depuis l'appelant.
function moinsDeMille(n: number, dernier: boolean): string {
  if (n < 100) return moinsDeCent(n, dernier);
  const c = Math.floor(n / 100);
  const r = n % 100;
  const prefixe = c === 1 ? "cent" : `${UNITES[c]} cent`;
  if (r === 0) return c > 1 && dernier ? `${prefixe}s` : prefixe;
  return `${prefixe} ${moinsDeCent(r, dernier)}`;
}

export function nombreEnLettres(n: number): string {
  if (n === 0) return "zéro";

  const milliards = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;

  const parties: string[] = [];
  if (milliards > 0) {
    parties.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  }
  if (millions > 0) {
    parties.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  }
  if (milliers > 0) {
    // "mille" suit toujours ce groupe — jamais de -s sur cent/quatre-vingts ici.
    parties.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  }
  if (reste > 0) {
    parties.push(moinsDeMille(reste, true));
  }
  return parties.join(" ");
}

export function montantEnLettres(montant: number, devise = "francs CFA"): string {
  const entier = Math.round(Math.abs(montant));
  const phrase = `${nombreEnLettres(entier)} ${devise}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
