import type { LigneSpecification, OperateurSpecification, SpecificationProduit, StatutConformite } from "./types";

// Moteur de comparaison "miroir" (sprint S6, parcours expert v2, voir
// CLAUDE.md, Étape 5.2) : pour chaque ligne de spécification exigée, trouve
// la caractéristique correspondante dans la fiche du produit (par libellé)
// et compare selon l'opérateur du DAO, avec conversion d'unité quand les
// deux valeurs appartiennent à une famille connue. Volontairement simple —
// un cas non reconnu (libellé non trouvé, unité non convertible, valeur non
// numérique hors "includes"/"=") renvoie "inconnu" plutôt qu'un faux "ok" :
// à tester sur un échantillon réel de fiches avant d'enrichir les familles
// d'unités ci-dessous (même logique que la détection de titres PDF/DOCX).

// Facteur vers une unité canonique par famille — ex. puissance en W,
// longueur en m. Ajouter une unité : un facteur dans la bonne famille.
const FAMILLES_UNITES: Record<string, Record<string, number>> = {
  longueur: { mm: 0.001, cm: 0.01, m: 1 },
  puissance: { w: 1, kw: 1000 },
  intensite: { ma: 0.001, a: 1 },
  tension: { mv: 0.001, v: 1 },
  energie: { wh: 1, kwh: 1000 },
  temps: { s: 1 / 60, min: 1, h: 60 },
};

// Catégories ordinales non numériques (ex. CAT III pour une catégorie de
// sécurité électrique) — comparables avec >=/<= mais pas par conversion.
const ORDRES_CATEGORIELS: Record<string, Record<string, number>> = {
  cat: { i: 1, ii: 2, iii: 3, iv: 4 },
};

function normaliser(texte: string): string {
  return texte.trim().toLowerCase();
}

function trouverFamille(unite: string): { famille: string; facteur: number } | null {
  const u = normaliser(unite);
  for (const [famille, unites] of Object.entries(FAMILLES_UNITES)) {
    if (u in unites) return { famille, facteur: unites[u] };
  }
  return null;
}

function parseNombre(valeur: string): number | null {
  const v = valeur.trim();
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

// Convertit (valeur, unité) vers une valeur numérique canonique comparable
// à une autre — `type` distingue l'origine de la valeur (famille d'unité,
// "brut" pour un nombre sans unité, ou catégorie ordinale) : deux valeurs
// ne sont comparables que si elles partagent le même `type`, sans quoi une
// puissance en kW et une tension en V donneraient un résultat numérique
// incohérent. null si aucune forme ne s'applique.
function versValeurComparable(
  valeur: string,
  unite: string | null,
): { nombre: number; type: string } | null {
  const nombre = parseNombre(valeur);
  if (nombre !== null) {
    if (unite === null || unite.trim().length === 0) return { nombre, type: "brut" };
    const f = trouverFamille(unite);
    return f === null ? null : { nombre: nombre * f.facteur, type: f.famille };
  }

  if (unite !== null) {
    const cle = normaliser(unite);
    const ordres = ORDRES_CATEGORIELS[cle];
    if (ordres) {
      const rang = ordres[normaliser(valeur)];
      return rang === undefined ? null : { nombre: rang, type: `categoriel:${cle}` };
    }
  }

  return null;
}

export interface ResultatComparaisonSpecLine {
  statut: StatutConformite;
  specificationProduit: SpecificationProduit | null;
}

function comparerValeurs(
  operateur: OperateurSpecification,
  valeurExigee: string,
  uniteExigee: string | null,
  valeurProduit: string,
  uniteProduit: string | null,
): StatutConformite {
  if (operateur === "includes") {
    return normaliser(valeurProduit).includes(normaliser(valeurExigee)) ? "ok" : "ko";
  }

  if (operateur === "=") {
    const a = versValeurComparable(valeurExigee, uniteExigee);
    const b = versValeurComparable(valeurProduit, uniteProduit);
    if (a !== null && b !== null) {
      return a.type === b.type ? (a.nombre === b.nombre ? "ok" : "ko") : "inconnu";
    }
    // Ni l'un ni l'autre numérique/catégoriel reconnu : égalité textuelle.
    if (a === null && b === null) {
      return normaliser(valeurExigee) === normaliser(valeurProduit) ? "ok" : "ko";
    }
    return "inconnu";
  }

  // ">=" / "<="
  const a = versValeurComparable(valeurExigee, uniteExigee);
  const b = versValeurComparable(valeurProduit, uniteProduit);
  if (a === null || b === null || a.type !== b.type) return "inconnu";
  return operateur === ">=" ? (b.nombre >= a.nombre ? "ok" : "ko") : b.nombre <= a.nombre ? "ok" : "ko";
}

// Correspondance par libellé normalisé (trim + casse) — pas de matching
// flou : un libellé de fiche produit différent de celui du DAO (ex.
// "Courant nominal" vs "Intensité nominale") renvoie "inconnu", à corriger
// en renommant plutôt qu'en devinant une correspondance incertaine.
export function comparerSpecLine(
  ligneSpecification: Pick<LigneSpecification, "libelle" | "operateur" | "valeur" | "unite">,
  specsProduit: SpecificationProduit[],
): ResultatComparaisonSpecLine {
  const specificationProduit =
    specsProduit.find((s) => normaliser(s.libelle) === normaliser(ligneSpecification.libelle)) ??
    null;

  if (specificationProduit === null) {
    return { statut: "inconnu", specificationProduit: null };
  }

  const statut = comparerValeurs(
    ligneSpecification.operateur,
    ligneSpecification.valeur,
    ligneSpecification.unite,
    specificationProduit.valeur,
    specificationProduit.unite,
  );

  return { statut, specificationProduit };
}

// Un produit ko sur au moins une ligne ne peut être retenu sans
// justification écrite (spec 5.2) — les lignes forcées en "ok" par
// conformite_forcee ne comptent pas comme ko.
export function produitKoSurAuMoinsUneLigne(
  lignesSpecification: Pick<LigneSpecification, "id" | "libelle" | "operateur" | "valeur" | "unite">[],
  specsProduit: SpecificationProduit[],
  statutsForces: Record<string, StatutConformite>,
): boolean {
  return lignesSpecification.some((ligne) => {
    const statut = statutsForces[ligne.id] ?? comparerSpecLine(ligne, specsProduit).statut;
    return statut === "ko";
  });
}
