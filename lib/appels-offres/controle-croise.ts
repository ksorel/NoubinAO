import type {
  ArticleDao,
  ArticleProduit,
  AppelOffres,
  ConformiteForcee,
  ExigenceAo,
  LigneBpu,
  LigneSpecification,
  Produit,
  SectionDossier,
  SpecificationProduit,
  StatutConformite,
} from "./types";
import type { Document } from "@/lib/documents/types";
import { compterLignesNonChiffrees } from "./bpu";
import { comparerSpecLine, produitKoSurAuMoinsUneLigne } from "./conformite-technique";

// Contrôle croisé (parcours expert v2, voir CLAUDE.md) : relit le dossier
// comme la commission, avant elle — catalogue de règles par famille
// (MNT/EXH/ENG/TEC/IDN/PER/SIG/DAT/VAL/SAI/FMT/CAN/PRC dans la spec).
// Construites : EXH, VAL, SAI, IDN, ENG, et TEC-01/02/03 (sprint S6) ci-
// dessous. TEC-04 (autorisation fabricant "si exigée") et TEC-05 (aucune
// fiche jointe pour un produit non retenu) restent hors scope : la première
// suppose un indicateur "exigée" par article qui n'existe pas encore, la
// seconde est une règle d'hygiène de l'export (tableau Section III), pas
// une donnée à contrôler ici. Les autres familles dépendent d'une
// modélisation pas encore en place (ex. MNT compare des montants F4/DQE/F3
// qui n'existent pas comme entités distinctes ici).

export const SEVERITES_CONTROLE = ["bloquante", "avertissement", "info"] as const;
export type SeveriteControle = (typeof SEVERITES_CONTROLE)[number];

export interface ResultatControle {
  id: string;
  severite: SeveriteControle;
  ok: boolean;
  /** Nombre d'éléments concernés (0 si ok), pour un message type "2 lignes sans prix". */
  nombre: number;
}

export function calculerControleExhaustivite(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  lignesBpu: Pick<LigneBpu, "quantite" | "prix_unitaire">[],
): ResultatControle[] {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const piecesManquantes = piecesRequises.filter(
    (e) => (documentsParExigence[e.id] ?? []).length === 0,
  ).length;

  const lignesNonChiffrees = compterLignesNonChiffrees(lignesBpu);

  return [
    {
      id: "EXH-01",
      severite: "bloquante",
      ok: lignesNonChiffrees === 0,
      nombre: lignesNonChiffrees,
    },
    {
      id: "EXH-02",
      severite: "bloquante",
      ok: piecesManquantes === 0,
      nombre: piecesManquantes,
    },
  ];
}

// Même collecte de documents utilisés que calculerChecklistAutomatique
// (checklist.ts), mais comparée à la date de dépôt plutôt qu'à "maintenant" :
// un document encore valide aujourd'hui mais qui expirera avant le dépôt
// reste un vrai problème que la checklist actuelle ne détecte pas.
export function calculerControleValidite(
  documentsParExigence: Record<string, Document[]>,
  dateDepot: Date,
): ResultatControle[] {
  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }

  const documentsPerimes = Array.from(documentsUtilises.values()).filter(
    (doc) => doc.date_expiration !== null && new Date(doc.date_expiration) < dateDepot,
  ).length;

  return [
    {
      id: "VAL-01",
      severite: "bloquante",
      ok: documentsPerimes === 0,
      nombre: documentsPerimes,
    },
  ];
}

// Motifs volontairement étroits et ancrés sur les cas réels documentés dans
// la spec plutôt que des heuristiques larges ("..." seul, trop courant dans
// une prose normale, n'est pas retenu) : mieux vaut sous-détecter que noyer
// l'utilisateur sous de faux positifs sur une heuristique encore jamais
// éprouvée sur un échantillon réel.
const MOTIFS_TEXTE_EXEMPLE: RegExp[] = [
  /ins[ée]rer\s/i,
  /\(\s*indiquer\b/i,
  /\[\s*[àa]\s*compl[ée]ter\s*\]/i,
  // 4 points/points de suspension consécutifs ou plus : ligne à blanc à
  // remplir ("………"), distingué des "..." isolés d'une prose normale.
  /[.…]{4,}/,
];

// Un seul cas réel documenté ("OPTION (Section III…)") : motif délibérément
// étroit, à élargir seulement si d'autres cas réels l'exigent.
const MOTIFS_NOTE_INTERNE: RegExp[] = [/\boption\s*\(/i];

function texteContientMotif(texte: string | null, motifs: RegExp[]): boolean {
  if (!texte) return false;
  return motifs.some((motif) => motif.test(texte));
}

// Scanne le texte qui part effectivement dans le dossier exporté : les
// documents de bibliothèque rattachés à une pièce requise, et les sections
// rédigées (narratives). N'inclut pas documentsParSection (matériel source
// de la rédaction assistée, pas lui-même exporté tel quel).
export function calculerControleSaisie(
  documentsParExigence: Record<string, Document[]>,
  sections: Pick<SectionDossier, "contenu">[],
): ResultatControle[] {
  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }

  const textes: (string | null)[] = [
    ...Array.from(documentsUtilises.values()).map((doc) => doc.contenu_markdown),
    ...sections.map((section) => section.contenu),
  ];

  const nombreTexteExemple = textes.filter((texte) =>
    texteContientMotif(texte, MOTIFS_TEXTE_EXEMPLE),
  ).length;
  const nombreNoteInterne = textes.filter((texte) =>
    texteContientMotif(texte, MOTIFS_NOTE_INTERNE),
  ).length;

  return [
    {
      id: "SAI-01",
      severite: "bloquante",
      ok: nombreTexteExemple === 0,
      nombre: nombreTexteExemple,
    },
    {
      id: "SAI-02",
      severite: "bloquante",
      ok: nombreNoteInterne === 0,
      nombre: nombreNoteInterne,
    },
  ];
}

// IDN-01 seulement (une seule famille de champ d'identité : l'adresse
// e-mail) — téléphone, BP, RCCM et compte contribuable ont des formats
// bien plus ambigus en texte libre (un numéro à 10 chiffres peut être
// n'importe quoi d'autre) et sont délibérément laissés de côté tant que
// cette première coupe n'a pas été éprouvée sur un échantillon réel.
const REGEX_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function extraireValeursUniques(textes: (string | null)[], motif: RegExp): Set<string> {
  const valeurs = new Set<string>();
  for (const texte of textes) {
    if (!texte) continue;
    for (const valeur of texte.match(motif) ?? []) {
      valeurs.add(valeur.toLowerCase());
    }
  }
  return valeurs;
}

// Même périmètre de scan que calculerControleSaisie (documents de
// bibliothèque rattachés à une pièce requise + sections rédigées) : le
// texte qui part effectivement dans le dossier exporté.
export function calculerControleIdentite(
  documentsParExigence: Record<string, Document[]>,
  sections: Pick<SectionDossier, "contenu">[],
): ResultatControle[] {
  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }

  const textes: (string | null)[] = [
    ...Array.from(documentsUtilises.values()).map((doc) => doc.contenu_markdown),
    ...sections.map((section) => section.contenu),
  ];

  const emailsDistincts = extraireValeursUniques(textes, REGEX_EMAIL);
  const conflit = emailsDistincts.size > 1;

  return [
    {
      id: "IDN-01",
      severite: "avertissement",
      ok: !conflit,
      nombre: conflit ? emailsDistincts.size : 0,
    },
  ];
}

// Compare une valeur proposée par l'entreprise à la valeur exigée par le
// DAO. `sens: "max"` = la proposition ne doit pas dépasser l'exigence
// (délai) ; `sens: "min"` = la proposition doit au moins l'atteindre
// (garantie, validité). Tant que l'une des deux valeurs n'est pas encore
// renseignée, rien à contrôler — ok trivialement, comme les autres règles
// de ce module quand la donnée manque.
function comparerEngagement(
  propose: number | null,
  exige: number | null,
  sens: "max" | "min",
): { ok: boolean; ecartJours: number } {
  if (propose === null || exige === null) return { ok: true, ecartJours: 0 };
  const ok = sens === "max" ? propose <= exige : propose >= exige;
  const ecartJours = sens === "max" ? Math.max(0, propose - exige) : Math.max(0, exige - propose);
  return { ok, ecartJours };
}

// ENG-01/02/03 : délai de livraison, garantie et validité de l'offre,
// proposés par l'entreprise en regard de ce qu'exige le DAO. `nombre`
// porte ici l'écart en jours (pas un compte d'éléments) — plus informatif
// qu'un simple 0/1 pour une comparaison scalaire.
export function calculerControleEngagements(
  appelOffres: Pick<
    AppelOffres,
    | "delai_livraison_max_jours"
    | "delai_livraison_propose_jours"
    | "garantie_exigee_jours"
    | "garantie_proposee_jours"
    | "validite_offre_jours"
    | "validite_offre_propose_jours"
  >,
): ResultatControle[] {
  const delai = comparerEngagement(
    appelOffres.delai_livraison_propose_jours,
    appelOffres.delai_livraison_max_jours,
    "max",
  );
  const garantie = comparerEngagement(
    appelOffres.garantie_proposee_jours,
    appelOffres.garantie_exigee_jours,
    "min",
  );
  const validite = comparerEngagement(
    appelOffres.validite_offre_propose_jours,
    appelOffres.validite_offre_jours,
    "min",
  );

  return [
    { id: "ENG-01", severite: "bloquante", ok: delai.ok, nombre: delai.ecartJours },
    { id: "ENG-02", severite: "bloquante", ok: garantie.ok, nombre: garantie.ecartJours },
    { id: "ENG-03", severite: "bloquante", ok: validite.ok, nombre: validite.ecartJours },
  ];
}

// TEC-01/02/03 (sprint S6, parcours expert v2, voir CLAUDE.md, Étape 5.2) :
// conformité technique article par article ("miroir"). Ne regarde que les
// produits *retenus* — un produit comparé puis écarté n'a pas à être
// conforme. TEC-02 ne compte un produit retenu ko que s'il n'a aucune
// justification écrite : avec justification, le retenir est une décision
// assumée (spec 5.2), pas une anomalie à signaler.
export function calculerControleTechnique(
  articles: Pick<ArticleDao, "id">[],
  lignesParArticle: Record<string, LigneSpecification[]>,
  articleProduitsParArticle: Record<string, ArticleProduit[]>,
  specsProduitParProduit: Record<string, SpecificationProduit[]>,
  conformiteForceeParLigneProduit: Record<string, ConformiteForcee>,
  produitsParId: Record<string, Pick<Produit, "fiche_technique_path">>,
): ResultatControle[] {
  let lignesInconnues = 0;
  let produitsKoSansJustification = 0;
  let produitsSansFicheTechnique = 0;

  for (const article of articles) {
    const lignes = lignesParArticle[article.id] ?? [];
    const retenus = (articleProduitsParArticle[article.id] ?? []).filter((ap) => ap.retenu);

    for (const ap of retenus) {
      const specsProduit = specsProduitParProduit[ap.produit_id] ?? [];

      for (const ligne of lignes) {
        const override = conformiteForceeParLigneProduit[`${ligne.id}:${ap.produit_id}`];
        const statut: StatutConformite =
          override?.statut ?? comparerSpecLine(ligne, specsProduit).statut;
        if (statut === "inconnu") lignesInconnues += 1;
      }

      const statutsForces: Record<string, StatutConformite> = {};
      for (const ligne of lignes) {
        const override = conformiteForceeParLigneProduit[`${ligne.id}:${ap.produit_id}`];
        if (override) statutsForces[ligne.id] = override.statut;
      }
      const estKo = produitKoSurAuMoinsUneLigne(lignes, specsProduit, statutsForces);
      if (estKo && ap.justification_ko === null) produitsKoSansJustification += 1;

      const produit = produitsParId[ap.produit_id];
      if (!produit || produit.fiche_technique_path === null) produitsSansFicheTechnique += 1;
    }
  }

  return [
    { id: "TEC-01", severite: "bloquante", ok: lignesInconnues === 0, nombre: lignesInconnues },
    {
      id: "TEC-02",
      severite: "bloquante",
      ok: produitsKoSansJustification === 0,
      nombre: produitsKoSansJustification,
    },
    {
      id: "TEC-03",
      severite: "avertissement",
      ok: produitsSansFicheTechnique === 0,
      nombre: produitsSansFicheTechnique,
    },
  ];
}
