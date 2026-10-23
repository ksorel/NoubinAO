import Anthropic from "@anthropic-ai/sdk";
import { ExtractionAoSchema, type ExtractionAo } from "./schema";
import type { SectionMarkdown } from "./markdown";

// Voir le commentaire équivalent dans ocr.ts : maxRetries augmenté après
// une vraie erreur 529 "Overloaded" d'Anthropic sur un traitement réel
// (2026-09-03).
const anthropic = new Anthropic({ maxRetries: 4 });

function normaliserPourComparaison(texte: string): string {
  return texte.replace(/['’‘]/g, "'").toUpperCase();
}

// La détection heuristique de titres (comparaison de texte pour le DOCX,
// taille de police pour le PDF) reste fiable pour repérer UNE borne isolée
// comme "Formulaires de soumission", mais s'est révélée trop fragile pour
// sélectionner précisément le contenu de CHAQUE section utile (AAO, DPAO,
// Critères) prise séparément : un DAO réel met parfois en emphase (police
// plus grande) une simple phrase de réponse en plein milieu d'un article
// ("ARTICLE 2 : OBJET" suivi de sa réponse en gros caractères), ce qui la
// fait passer pour un nouveau titre et fragmente la vraie section en
// micro-sections orphelines qu'une sélection par titre ne peut plus
// retrouver (confirmé sur un DAO réel, 2026-09-03 : le contenu de l'AAO
// disparaissait presque entièrement malgré une détection de titre par
// ailleurs correcte). Plutôt que d'affiner encore l'heuristique de titre au
// cas par cas, on envoie à Claude tout le contenu utile en un seul bloc
// continu, du début du document jusqu'à la borne "Formulaires de
// soumission" (juste avant les modèles de formulaires vierges, qui
// n'apportent rien à l'extraction) — un seul point de coupure fiable à
// trouver plutôt que plusieurs sections précises à isoler.
const BORNE_FIN_CONTENU = "FORMULAIRES DE SOUMISSION";
// La section "Instructions aux Candidats"/"Instructions aux
// Soumissionnaires" est un bloc juridique standardisé d'une vingtaine de
// pages, identique d'un DAO à l'autre ("les dispositions figurant dans
// cette Section I ne doivent pas être modifiées", CLAUDE.md) — elle ne
// contient jamais les faits propres à cet AO (acheteur, montant, date,
// critères). Incluse dans le bloc continu, elle gonflait le contenu au
// point de repousser le DPAO et les Critères au-delà de
// LONGUEUR_MAX_CONTENU_PERTINENT, les tronquant (confirmé le 2026-09-03 :
// régression du DOCX après le passage au bloc continu, alors que ce
// document n'avait jamais posé de problème avant). Exclue explicitement
// plutôt que comptée dans le plafond de sécurité.
const DEBUT_INSTRUCTIONS = "INSTRUCTIONS AUX";
const DEBUT_DPAO = "DONNÉES PARTICULIÈRES";
// Carve-out trouvé lors d'un test grandeur nature (2026-10-10) : la liste
// des pièces administratives requises (RCCM, CNPS, IDU...) vit souvent
// dans une sous-section d'Instructions aux Soumissionnaires ("Pièces
// administratives requises"/"Pièces à fournir"), pas dans le DPAO — la
// section était pourtant exclue en bloc (voir commentaire ci-dessus),
// faisant disparaître ces pièces de l'extraction (0 détectée sur 7
// présentes dans le Markdown normalisé, vérifié en base). Un sous-titre
// contenant ce mot-clé reste donc inclus même à l'intérieur de la plage
// Instructions-DPAO exclue — plus chirurgical que ré-inclure toute la
// section, qui a déjà causé une régression de troncature (voir
// LONGUEUR_MAX_CONTENU_PERTINENT ci-dessous).
const MOT_CLE_PIECES = "PIÈCES";
// Filet de sécurité si la borne de fin n'est pas trouvée (DAO au phrasé
// différent) : évite d'envoyer un document de plusieurs centaines de pages
// en entier à l'API. 60 000 s'est révélé insuffisant sur un vrai DAO DOCX
// (2026-09-04) : à contenu sémantique égal, le Markdown issu du DOCX
// (titres `#`/`##`/`###`, emphase `**gras**`) est nettement plus volumineux
// que le texte brut issu du PDF (confirmé : le PDF du même DAO atteignait
// intégralement les Critères d'évaluation bien en-dessous de 60 000
// caractères, tandis que le DOCX s'arrêtait à 2 pièces requises sur 16,
// avant même la fin du DPAO). Relevé à 250 000 caractères (~60-65k tokens,
// large marge sous la fenêtre de contexte de Claude) pour laisser au DOCX
// la même couverture réelle que le PDF sur un DAO de taille normale.
const LONGUEUR_MAX_CONTENU_PERTINENT = 250000;

export function construireContenuPertinent(sections: SectionMarkdown[]): string {
  const titresNormalises = sections.map((s) => normaliserPourComparaison(s.titre));

  const indexBorneFin = titresNormalises.findIndex((t) => t.includes(BORNE_FIN_CONTENU));
  const indexInstructions = titresNormalises.findIndex((t) => t.includes(DEBUT_INSTRUCTIONS));
  const indexDpao = titresNormalises.findIndex((t) => t.includes(DEBUT_DPAO));

  // La plage [indexInstructions, indexDpao) est exclue en bloc plutôt que
  // par titre : la section peut elle-même être fragmentée en plusieurs
  // sous-sections (A. Généralités, B. Contenu du dossier...) par une
  // détection de titre imparfaite — exclure une plage d'index reste fiable
  // même quand les titres internes varient.
  const sectionsPertinentes = sections.filter((_section, index) => {
    if (indexBorneFin !== -1 && index >= indexBorneFin) return false;
    if (
      indexInstructions !== -1 &&
      indexDpao !== -1 &&
      index >= indexInstructions &&
      index < indexDpao
    ) {
      // Carve-out : la sous-section "pièces" reste incluse (voir
      // MOT_CLE_PIECES ci-dessus), tout le reste d'Instructions-DPAO
      // demeure exclu.
      return titresNormalises[index].includes(MOT_CLE_PIECES);
    }
    return true;
  });

  const contenu = sectionsPertinentes.map((s) => `## ${s.titre}\n${s.contenu}`).join("\n\n");

  return contenu.length > LONGUEUR_MAX_CONTENU_PERTINENT
    ? contenu.slice(0, LONGUEUR_MAX_CONTENU_PERTINENT)
    : contenu;
}

export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo> {
  const contenuPertinent = construireContenuPertinent(sections);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    // 2000 s'est révélé insuffisant sur un vrai DAO (2026-09-03) : une fois
    // le vrai contenu de l'AAO/DPAO transmis (voir trouverSection ci-dessus),
    // la liste d'exigences générée est plus longue et le JSON se retrouvait
    // tronqué en plein milieu d'un tableau ("Expected ',' or ']'").
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Voici des sections extraites d'un dossier d'appel d'offres (DAO) ivoirien :

${contenuPertinent}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "titre": "string ou null (objet/intitulé de l'appel d'offres)",
  "acheteur": "string ou null (nom de l'autorité contractante)",
  "secteur": "string ou null (secteur d'activité concerné)",
  "date_limite": "string ou null (date et heure limite de dépôt, au format ISO 8601 UTC, ex. 2026-11-03T12:00:00Z)",
  "date_limite_questions": "string ou null (date et heure limites pour envoyer des questions/demandes de clarification à l'acheteur, même format ISO 8601 UTC)",
  "montant_caution": nombre ou null (montant de la caution de soumission, en chiffres, sans devise),
  "sommaire_attendu": ["string"],
  "type_acheteur": "public" | "entreprise_publique" | "prive" | "ong" | null,
  "procedure_marche": "ao_ouvert" | "ao_restreint" | "procedure_simplifiee" | "gre_a_gre" | "ami" | "demande_propositions" | "consultation_privee" | null,
  "canal_depot": "sigomap" | "papier" | "email" | "portail_acheteur" | "remise_main_propre" | null,
  "mode_evaluation": "points" | "conformite_moins_disant" | null,
  "fourchette_prix_basse": nombre ou null (ex. 80 pour 80 %),
  "fourchette_prix_haute": nombre ou null (ex. 110 pour 110 %),
  "variation_quantite_hausse": nombre ou null (ex. 50 pour +50 %),
  "variation_quantite_baisse": nombre ou null (ex. 20 pour -20 %),
  "taux_redevance_reglementation": nombre ou null (ex. 0.5 pour 0,5 %),
  "timbre_requis": booléen ou null,
  "delai_livraison_max_jours": nombre entier ou null (délai de livraison maximal exigé après notification/commande, en jours),
  "garantie_exigee_jours": nombre entier ou null (durée de garantie minimale exigée, en jours),
  "validite_offre_jours": nombre entier ou null (durée de validité de l'offre exigée, en jours, à compter du dépôt),
  "exigences": [
    { "type_exigence": "piece_requise", "libelle": "string", "description": "string ou null", "ponderation": null, "source_section": "nom de la section d'origine", "categorie_exigence": "eliminatoire" | "qualification" | "notee" | "formelle" },
    { "type_exigence": "critere_evaluation", "libelle": "string", "description": null, "ponderation": nombre ou null, "source_section": "nom de la section d'origine", "categorie_exigence": "eliminatoire" | "qualification" | "notee" | "formelle" }
  ],
  "points_flous": [
    { "description": "string (l'incohérence ou l'ambiguïté constatée)", "source_section": "nom de la section concernée, ou null" }
  ]
}

Indications pour "categorie_exigence" (ce qui arrive en cas de
non-respect de cette exigence) :
- "eliminatoire" uniquement si le texte du DAO qualifie EXPLICITEMENT
  cette exigence de facteur éliminatoire ou disqualifiant (ex. "sous
  peine de rejet", "sous peine d'exclusion", "critère éliminatoire",
  "rejet automatique de l'offre", "entraîne le rejet de la
  soumission", "condition impérative de recevabilité"). Ne déduis
  jamais ce caractère de l'importance perçue d'une pièce ou d'un
  critère.
- "qualification" si le texte en fait une condition obligatoire de
  recevabilité sans la qualifier d'éliminatoire ni lui donner de
  pondération (ex. "le candidat doit justifier de...", "pièce
  obligatoire" sans mention de rejet).
- "notee" si l'exigence contribue à une notation/pondération chiffrée
  (typiquement les critères d'évaluation).
- "formelle" pour toute autre pièce administrative ou condition sans
  enjeu de notation ni de rejet exprès — valeur par défaut à défaut
  d'indication contraire.

Indications pour "type_acheteur", "procedure_marche" et "canal_depot" —
ne mets une valeur que si le texte permet de trancher sans ambiguïté,
sinon laisse null plutôt que de deviner :
- "type_acheteur" : "public" pour un ministère, une mairie, un
  établissement public ; "entreprise_publique" pour une société d'État
  (ex. CI-ENERGIES, SODECI) ; "prive" pour une entreprise privée,
  industrielle ou commerciale ; "ong" pour une organisation non
  gouvernementale. Ne mets "public" par défaut que si l'acheteur est
  explicitement une administration — à défaut, laisse null.
- "procedure_marche" : "ao_ouvert" si le texte parle d'un appel d'offres
  ouvert sans restriction (cas le plus courant, à ne retenir que si
  explicitement qualifié d'"ouvert" ou en l'absence de toute mention
  contraire d'un mode différent) ; "ao_restreint" si une présélection ou
  une liste restreinte de candidats précède l'offre ; "procedure_simplifiee"
  pour une demande de cotation, une consultation simplifiée ou un marché
  à procédure simplifiée (PSO/PSL/PSC) ; "gre_a_gre" pour une entente
  directe ou une négociation sans mise en concurrence affichée ; "ami"
  pour un appel à manifestation d'intérêt (dossier de capacités, sans
  offre financière) ; "demande_propositions" pour une consultation de
  bureaux d'études/consultants avec note technique puis financière ;
  "consultation_privee" pour une consultation d'un acheteur privé, sans
  référence à une procédure réglementaire publique.
- "canal_depot" : "sigomap" si le dépôt se fait via la plateforme SIGOMAP ;
  "papier" si une adresse physique de dépôt (avec nombre d'exemplaires) est
  indiquée sans alternative en ligne ; "email" si une adresse e-mail de
  dépôt est fournie ; "portail_acheteur" pour une plateforme en ligne
  propre à l'acheteur, distincte de SIGOMAP ; "remise_main_propre" si le
  texte exige une remise contre récépissé en main propre.

Indications pour "mode_evaluation" et les paramètres de prix — là aussi,
laisse null à défaut d'une mention explicite :
- "mode_evaluation" : "points" si le DAO présente un barème de notation
  chiffré (critères pondérés, total sur 100 points ou équivalent) ;
  "conformite_moins_disant" si le texte retient l'offre conforme la
  moins-disante ou "évaluée conforme et économiquement la plus
  avantageuse", sans barème de points.
- "fourchette_prix_basse"/"fourchette_prix_haute" : uniquement si le DAO
  définit explicitement une fourchette des offres anormalement basses ou
  élevées (souvent autour de 80 % et 110 % d'une moyenne ou d'une
  estimation) — n'invente jamais ces valeurs si le DAO n'en mentionne pas.
- "variation_quantite_hausse"/"variation_quantite_baisse" : variation des
  quantités que l'acheteur se réserve le droit d'appliquer après
  attribution, si explicitement chiffrée dans le DAO.
- "taux_redevance_reglementation" : taux de la redevance de régulation
  (ARCOP, marché public ivoirien), seulement si le DAO la mentionne.
- "timbre_requis" : true seulement si le DAO exige explicitement un
  timbre fiscal sur la lettre de soumission, false s'il précise
  explicitement qu'aucun timbre n'est requis, null si le sujet n'est pas
  abordé.
- "delai_livraison_max_jours" : converti en jours même si le DAO l'exprime
  en semaines ou en mois (ex. "deux (02) mois" → 60). "garantie_exigee_jours"
  et "validite_offre_jours" suivent la même règle de conversion. Laisse
  null si la durée n'est pas chiffrée explicitement dans le texte.

Indications pour "points_flous" — signale UNIQUEMENT des incohérences ou
ambiguïtés réellement présentes dans le texte, jamais une supposition :
- un article, une pièce ou un poste mentionné dans une section (ex.
  spécifications techniques) mais absent d'une autre section qui devrait
  logiquement le reprendre (ex. bordereau de prix, devis quantitatif) ;
- un renvoi explicite vers une autre section ("voir Section X", "cf.
  article Y") qui, une fois ce renvoi suivi dans le contenu fourni, ne
  contient pas l'information annoncée ou semble vide sur ce point ;
- un même numéro de formulaire ou d'article qui apparaît deux fois pour
  des contenus différents ;
- une unité ou une valeur numérique ambiguë ou qui semble incohérente
  avec le contexte (ex. une dimension sans unité claire, un ordre de
  grandeur improbable) ;
- une quantité indiquée "N/A", absente, ou à "0" alors qu'un article est
  par ailleurs listé comme requis.
Pour chaque point flou, "description" résume le problème concrètement
(assez précis pour qu'une question puisse être posée à l'acheteur à
partir de cette seule phrase) et "source_section" nomme la ou les
sections concernées. Ne force jamais une entrée s'il n'y a pas
d'incohérence réelle — un DAO cohérent peut avoir "points_flous": [].

Indications pour la date_limite et le montant_caution, souvent formatés à
la française dans ces documents :
- La date et l'heure limites de dépôt sont indiquées séparément (ex. "Date :
  24/08/2026" et "Heure : 09 heures 30 minutes Temps Universel", ou une
  formulation similaire dans le corps du texte). Combine les deux en un
  seul horodatage ISO 8601 UTC ("Temps Universel" = UTC).
- "date_limite_questions" suit la même règle de combinaison date+heure,
  mais concerne la date limite pour poser des questions ou demander des
  clarifications à l'acheteur (souvent antérieure de plusieurs jours à
  date_limite) — ne la confonds pas avec la date de dépôt de l'offre.
- Les montants utilisent le point comme séparateur de milliers, pas comme
  séparateur décimal (ex. "545.000" francs CFA = 545000, pas 545). Le
  montant est aussi souvent écrit en toutes lettres juste à côté (ex.
  "Cinq cent quarante-cinq mille (545.000) francs CFA") — utilise cette
  écriture en lettres pour confirmer la valeur numérique exacte.

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null ou un tableau vide selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");

  if (debut === -1 || fin === -1 || fin < debut) {
    throw new Error("Réponse Claude sans JSON exploitable.");
  }

  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionAoSchema.parse(JSON.parse(jsonBrut));
}
