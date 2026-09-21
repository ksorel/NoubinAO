# Formulaires standards pré-remplis

Date : 2026-09-21
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Priorité #2 de la feuille de route stratégique (artefact "Le Cap
NoubinAO", tier P1 — « ce qui fait gagner, pas seulement soumettre »),
brique 1 d'un item à deux briques indépendantes (la seconde, l'historique
de prix par ligne BPU, reste un sous-projet séparé, non traité ici).

La rédaction assistée par IA (Module 4, en prod) couvre les sections
narratives du sommaire attendu — mémoire technique, présentation
entreprise. Mais un DAO ivoirien impose aussi des **formulaires
administratifs à texte fixe**, récurrents d'un AO à l'autre : lettre de
soumission, déclaration sur l'honneur, pouvoir habilitant du signataire.
Aujourd'hui, l'utilisateur les saisit à la main à chaque AO alors que la
plupart des champs (nom, RCCM, représentant légal, adresse) sont déjà
connus de NoubinAO.

**Dépendance bloquante découverte pendant le cadrage** : la table
`entreprise` ne contient aujourd'hui que `nom` et `rccm` — aucune
adresse, aucun représentant légal, aucun IDU, et aucune page ne permet de
les saisir (`/parametres` n'a que le compte email et le taux de frais de
structure). Ce sous-projet ajoute donc d'abord ces champs et leur carte
de réglage, prérequis réel pour tout le reste.

## Décisions validées avec l'utilisateur

- **Portée du chiffrage** : deux briques indépendantes (formulaires
  standards / historique de prix BPU) — celle-ci ne traite que la
  première. Choisie en premier car elle apporte une valeur dès le
  premier AO traité après mise en prod, contrairement à l'historique de
  prix qui a besoin de volume d'usage accumulé pour être utile.
- **Aucune génération IA** : contrairement au mémoire technique, ces
  formulaires ont un texte légal fixe avec des blancs à remplir — un
  remplissage déterministe de gabarit, pas un appel Claude. Zéro risque
  d'hallucination, aucun coût API.
- **Champs entreprise strictement scopés aux 3 formulaires visés** : pas
  de « profil complet » spéculatif — `adresse`, `representant_legal_nom`,
  `representant_legal_qualite` (ex. « Directeur Général »), `idu`.
  Nouvelle carte dans `/parametres`, qui devient aussi le premier endroit
  où `nom`/`rccm` deviennent éditables (jamais possible nulle part
  aujourd'hui).
- **`Entreprise` (type TypeScript complet) coexiste avec les lectures
  ponctuelles existantes** (`obtenirNomEntreprise`,
  `obtenirTauxFraisStructureDefaut`) plutôt que de les remplacer — un
  refactor de ces fonctions déjà en prod est hors du périmètre de ce
  sous-projet (pas de renommage/suppression non lié à ce qui est
  construit ici).
- **Détection par mots-clés, pas par IA** : une pièce requise du DAO
  (`exigence_ao.libelle`, texte libre extrait par IA) est reconnue comme
  l'un des 3 formulaires connus via une correspondance de mots-clés,
  même patron que `deviserTypeDocumentPrefere` déjà utilisé pour
  suggérer un type de document — cohérent avec la philosophie déjà
  appliquée au module email (« ne passer à une classification IA que si
  le rattachement par règles s'avère insuffisant »).
- **Fusion dans l'export du dossier principal** (pas un fichier séparé
  comme la transformation de CV) — décision spécifique à ce sous-projet :
  le contenu n'étant pas généré par IA (substitution déterministe de
  champs connus), le risque d'hallucination qui justifiait « jamais de
  fusion » pour la rédaction IA ne s'applique pas ici. Éviter à
  l'utilisateur de rassembler N fichiers en plus du dossier principal à
  chaque AO.
- **Réutilisation intégrale de `section_dossier`** (table, Server
  Actions `modifierContenuSection`/`validerSection`/`devaliderSection`,
  et le filtre d'export existant dans `construirePlanExport`, qui inclut
  déjà toute section `validee` avec contenu non-null, peu importe son
  origine) — **aucun changement requis à `export/plan.ts`/`docx.ts`**.
  Seule la fonction qui produit le `contenu` initial change (gabarit au
  lieu d'un appel Claude), le reste du pipeline est déjà écrit et
  fonctionne tel quel. La fusion dans l'export (décision précédente) est
  donc gratuite grâce à cette réutilisation.
- **Montant total du BPU recalculé côté serveur**, jamais transmis par
  le client, pour la lettre de soumission — un document à valeur légale
  ne doit jamais afficher un montant que le serveur n'a pas lui-même
  vérifié depuis `ligne_bpu`.
- **Validation humaine obligatoire avant export**, héritée telle quelle
  de `section_dossier` : un formulaire généré reste `brouillon` tant
  qu'il n'est pas explicitement validé — protège contre un gabarit
  générique qui ne correspondrait pas exactement à ce qu'un DAO
  spécifique exige (l'utilisateur relit et ajuste avant validation,
  exactement comme pour une section rédigée par IA).

## Modèle de données

Nouvelle migration `supabase/migrations/20260921100000_profil_entreprise.sql` :

```sql
-- Formulaires standards pré-remplis (feuille de route stratégique,
-- tier P1, brique 1/2). entreprise n'avait jusqu'ici que nom/rccm —
-- aucun champ ni aucune page ne permettait de renseigner l'adresse, le
-- représentant légal ou l'IDU, pourtant nécessaires pour pré-remplir une
-- lettre de soumission, une déclaration sur l'honneur ou un pouvoir
-- habilitant. Scope strictement limité à ce que ces 3 formulaires
-- exigent — pas un profil entreprise complet.
alter table entreprise
  add column adresse text,
  add column representant_legal_nom text,
  add column representant_legal_qualite text,
  add column idu text;
```

Aucune autre migration : `section_dossier` (créée au Module 4) est
réutilisée sans modification de schéma.

Nouveau type dans `lib/utilisateur/types.ts` (fichier à créer — aucun
type `Entreprise` n'existe actuellement, vérifié par lecture directe du
code) :

```ts
export interface Entreprise {
  id: string;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representant_legal_nom: string | null;
  representant_legal_qualite: string | null;
  idu: string | null;
  taux_frais_structure_defaut: number | null;
  created_at: string;
}
```

## Section 1 — Profil entreprise

Nouvelle fonction dans `lib/utilisateur/queries.ts`, à côté de
`obtenirTauxFraisStructureDefaut` (`obtenirNomEntreprise`/
`obtenirTauxFraisStructureDefaut` restent inchangées, coexistent) :

```ts
export async function obtenirEntreprise(entrepriseId: string): Promise<Entreprise | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("*")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data as Entreprise | null;
}
```

Nouveau schéma Zod dans `lib/utilisateur/schema.ts` (fichier à créer) :

```ts
import { z } from "zod";

const champTexteOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

export const modifierProfilEntrepriseSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(200),
  rccm: champTexteOptionnel,
  adresse: champTexteOptionnel,
  representantLegalNom: champTexteOptionnel,
  representantLegalQualite: champTexteOptionnel,
  idu: champTexteOptionnel,
});

export type ModifierProfilEntrepriseInput = z.infer<typeof modifierProfilEntrepriseSchema>;
```

Nouvelle Server Action dans `lib/utilisateur/actions.ts` (fichier à
créer) :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import { modifierProfilEntrepriseSchema } from "./schema";

export async function modifierProfilEntreprise(
  input: {
    nom: string;
    rccm: string | null;
    adresse: string | null;
    representantLegalNom: string | null;
    representantLegalQualite: string | null;
    idu: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierProfilEntrepriseSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      nom: parsed.data.nom,
      rccm: parsed.data.rccm,
      adresse: parsed.data.adresse,
      representant_legal_nom: parsed.data.representantLegalNom,
      representant_legal_qualite: parsed.data.representantLegalQualite,
      idu: parsed.data.idu,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

Réutilise la policy `entreprise_update_membres` déjà créée au
sous-projet pyramide de coût BPU (Module 7) — aucune nouvelle policy RLS
nécessaire.

**Interface** : nouveau composant `app/(app)/parametres/profil-entreprise-card.tsx`
(même patron que `taux-frais-structure-card.tsx` — `Card` shadcn, état
local par champ, `onBlur` sauvegarde). `app/(app)/parametres/page.tsx`
charge `obtenirEntreprise(utilisateur.entreprise_id)` en plus de l'existant
et rend `<ProfilEntrepriseCard entreprise={entreprise} />` avant
`<TauxFraisStructureCard>`.

## Section 2 — Détection des formulaires standards

Nouveau fichier `lib/appels-offres/formulaires-standards.ts` :

```ts
export const TYPES_FORMULAIRE_STANDARD = [
  "lettre_soumission",
  "declaration_honneur",
  "pouvoir_habilitant",
] as const;

export type TypeFormulaireStandard = (typeof TYPES_FORMULAIRE_STANDARD)[number];

// Même patron que deviserTypeDocumentPrefere (suggestion-document.ts) :
// mots-clés sur le libellé en texte libre extrait du DAO, pas de
// classification IA tant qu'une règle simple suffit.
export function identifierFormulaireStandard(libelle: string): TypeFormulaireStandard | null {
  const l = libelle.toLowerCase();
  if (l.includes("lettre de soumission")) return "lettre_soumission";
  if (l.includes("déclaration sur l'honneur") || l.includes("declaration sur l'honneur")) {
    return "declaration_honneur";
  }
  if (l.includes("pouvoir habilitant")) return "pouvoir_habilitant";
  return null;
}
```

**Tests** (`lib/appels-offres/formulaires-standards.test.ts`) : un cas par
type connu (libellé exact vu en production, ex. « Lettre de soumission de
l'offre », « Formulaire de déclaration sur l'honneur », « Pouvoir
habilitant du soumissionnaire »), insensibilité à la casse, et un libellé
sans correspondance retourne `null`.

## Section 3 — Génération par gabarit

Nouvelles fonctions pures dans le même fichier
`lib/appels-offres/formulaires-standards.ts`, une par formulaire.
Chaque champ manquant (entreprise non encore renseignée) est marqué
`[à compléter]`, même convention que le prompt anti-invention de la
transformation de CV — jamais une valeur inventée.

```ts
import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";

function valeurOu(champ: string | null, remplacement = "[à compléter]"): string {
  return champ && champ.trim().length > 0 ? champ : remplacement;
}

export function genererLettreSoumission(
  entreprise: Entreprise,
  appelOffres: AppelOffres,
  montantTotalBpu: number | null,
): string {
  const montant =
    montantTotalBpu !== null && montantTotalBpu > 0
      ? `${montantTotalBpu.toLocaleString("fr-FR")} FCFA`
      : "[montant à compléter]";

  return `LETTRE DE SOUMISSION

Objet : ${valeurOu(appelOffres.titre)}
Acheteur : ${valeurOu(appelOffres.acheteur)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, dont le siège est situé à ${valeurOu(entreprise.adresse)}, après avoir pris connaissance du Dossier d'Appel d'Offres relatif au marché ci-dessus désigné, m'engage à exécuter les prestations conformément aux clauses et conditions dudit dossier, pour un montant total de ${montant}.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererDeclarationHonneur(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `DÉCLARATION SUR L'HONNEUR

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom} (RCCM ${valeurOu(entreprise.rccm)}, IDU ${valeurOu(entreprise.idu)}), déclare sur l'honneur :

- que l'entreprise n'est pas sous le coup d'une interdiction de participer aux marchés publics ;
- que l'entreprise n'est pas en état de faillite, de liquidation ou de cessation d'activité ;
- que les informations et pièces fournies dans le cadre de la présente offre sont exactes et sincères ;
- que l'entreprise s'engage à respecter la réglementation en vigueur en matière de marchés publics et à n'exercer ni offrir aucune forme de corruption dans le cadre de la présente procédure.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererPouvoirHabilitant(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `POUVOIR HABILITANT

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, donne par la présente pouvoir à [à compléter — nom et qualité du signataire habilité] à l'effet de signer, au nom et pour le compte de l'entreprise, tous documents relatifs à la présente procédure de passation de marché, et notamment l'offre déposée en réponse à l'appel d'offres susvisé.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}
```

**Tests** (mêmes fichier de test que la Section 2) : pour chaque fonction,
un cas avec entreprise entièrement renseignée (aucun `[à compléter]`
dans le résultat) et un cas avec entreprise vide (chaque champ manquant
remplacé, jamais une chaîne vide silencieuse) ; pour
`genererLettreSoumission`, un cas avec `montantTotalBpu` renseigné et un
cas `null`/`0` (texte `[montant à compléter]`).

Nouvelle Server Action dans `lib/appels-offres/actions.ts` :

```ts
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
} from "./formulaires-standards";
import { obtenirEntreprise } from "@/lib/utilisateur/queries";
import { listerBpu } from "./queries";
import { sommerMontants } from "./bpu";

export async function genererContenuFormulaireStandard(
  appelOffresId: string,
  exigenceId: string,
): Promise<
  | { erreur: string }
  | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const exigence = resultat.exigences.find((e) => e.id === exigenceId);
  if (!exigence) return { erreur: "Exigence introuvable." };

  const type = identifierFormulaireStandard(exigence.libelle);
  if (!type) return { erreur: "Ce type de formulaire n'est pas reconnu." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  let contenu: string;
  if (type === "lettre_soumission") {
    const bpu = await listerBpu(appelOffresId);
    const toutesLesLignes = bpu.sections.flatMap((s) => bpu.lignesParSection[s.id] ?? []);
    const montantTotal = sommerMontants(toutesLesLignes);
    contenu = genererLettreSoumission(entreprise, resultat.appelOffres, montantTotal);
  } else if (type === "declaration_honneur") {
    contenu = genererDeclarationHonneur(entreprise, resultat.appelOffres);
  } else {
    contenu = genererPouvoirHabilitant(entreprise, resultat.appelOffres);
  }

  const supabase = await createClient();
  const { data: section, error: erreurUpsert } = await supabase
    .from("section_dossier")
    .upsert(
      {
        dossier_reponse_id: resultat.dossierReponse.id,
        titre: exigence.libelle,
        contenu,
        statut: "brouillon",
        generated_at: new Date().toISOString(),
        created_by: utilisateur.id,
      },
      { onConflict: "dossier_reponse_id,titre" },
    )
    .select("id")
    .maybeSingle();

  if (erreurUpsert || !section) {
    return { erreur: "Échec de l'enregistrement du formulaire. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, sectionId: section.id, contenu, statut: "brouillon" };
}
```

`onConflict: "dossier_reponse_id,titre"` : une régénération remplace le
contenu existant (même comportement que `genererContenuSection`,
cohérent avec le reste du produit — pas d'historique de versions).

## Section 4 — Interface

Nouveau composant `app/(app)/appels-offres/[id]/formulaire-standard.tsx`,
volontairement séparé de `SectionRedaction` (qui embarque un sélecteur
de documents source non pertinent ici — un formulaire standard ne
dépend d'aucun document bibliothèque, seulement de l'entreprise et de
l'AO) :

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  genererContenuFormulaireStandard,
  modifierContenuSection,
  validerSection,
  devaliderSection,
} from "@/lib/appels-offres/actions";
import type { SectionDossier, StatutSectionDossier } from "@/lib/appels-offres/types";

export function FormulaireStandard({
  appelOffresId,
  exigenceId,
  libelleExigence,
  section,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  section: SectionDossier | undefined;
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.formulaireStandard");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function generer() {
    setGeneration(true);
    const resultat = await genererContenuFormulaireStandard(appelOffresId, exigenceId);
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSectionId(resultat.sectionId);
    setContenu(resultat.contenu);
    setStatut(resultat.statut);
  }

  async function sauvegarderContenu() {
    if (!sectionId) return;
    setEnregistrement(true);
    const resultat = await modifierContenuSection(appelOffresId, sectionId, contenu);
    setEnregistrement(false);
    if ("erreur" in resultat) toast.error(t("erreurEnregistrement"));
  }

  function basculerStatut() {
    if (!sectionId) return;
    const precedent = statut;
    const nouveauStatut: StatutSectionDossier = statut === "brouillon" ? "validee" : "brouillon";
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat =
        nouveauStatut === "validee"
          ? await validerSection(appelOffresId, sectionId)
          : await devaliderSection(appelOffresId, sectionId);
      if ("erreur" in resultat) {
        toast.error(t("erreurValidation"));
        setStatut(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4 border-l-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {t("titre")}
        </span>
        {sectionId && (
          <Badge variant={statut === "validee" ? "default" : "outline"}>
            {statut === "validee" ? t("statutValidee") : t("statutBrouillon")}
          </Badge>
        )}
      </div>

      {sectionId && (
        <Textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={10} />
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={generer} disabled={generation}>
          {generation ? t("generationEnCours") : sectionId ? t("boutonRegenerer") : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={sauvegarderContenu} disabled={enregistrement}>
              {t("boutonEnregistrerTexte")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={basculerStatut} disabled={isPending}>
              {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

**`documents-exigence.tsx`** reçoit deux nouvelles props :
`typeFormulaireStandard: TypeFormulaireStandard | null` (calculé par le
parent via `identifierFormulaireStandard(exigence.libelle)`, évite de
dupliquer l'import dans ce composant) et
`sectionFormulaire: SectionDossier | undefined` (la section déjà générée
pour cette exigence, si elle existe). Si `typeFormulaireStandard` n'est
pas `null`, rend `<FormulaireStandard>` en plus du sélecteur bibliothèque
existant (les deux ne s'excluent pas : un DAO peut accepter soit le
document déjà en bibliothèque, soit demander le formulaire signé — les
deux options restent visibles).

**`appel-offres-detail.tsx`** : dans la boucle `piecesRequises.map`, calcule
`identifierFormulaireStandard(exigence.libelle)` et cherche la section
correspondante dans `sections.find(s => s.titre === exigence.libelle)`,
transmis à `<DocumentsExigence>`.

**Traductions** : nouveau bloc `AppelsOffres.detail.exigences.formulaireStandard`
(titre, statuts, boutons — mêmes clés que `redaction` mais dans ce nouveau
namespace, pour ne pas coupler les deux composants) + bloc
`Parametres.profilEntreprise` (labels des 6 champs), fr + en.

## États et erreurs

- Exigence dont le libellé ne correspond à aucun des 3 types connus :
  aucun changement d'interface, comportement actuel inchangé.
- Champs entreprise non renseignés : le gabarit généré contient des
  `[à compléter]` visibles, jamais une valeur inventée ni une section
  vide silencieuse — l'utilisateur les repère et les complète dans la
  zone de texte avant de valider.
- BPU non chiffré au moment de la génération de la lettre de soumission :
  `montantTotalBpu` vaut `0` (aucune ligne chiffrée), affiché comme
  `[montant à compléter]` plutôt que « 0 FCFA » (qui laisserait croire à
  un montant réel).
- Régénération : remplace le contenu existant (comme la rédaction IA),
  repasse toujours en `brouillon` même si la version précédente était
  validée — cohérent avec `genererContenuSection`.
- Échec de la Server Action : toast d'erreur, aucune écriture partielle
  (l'upsert échoue avant tout état intermédiaire visible).

## Tests

- `identifierFormulaireStandard` et les 3 fonctions `genererXxx` (voir
  Sections 2-3) — fonctions pures, TDD.
- Aucun test sur les Server Actions ni les composants UI, cohérent avec
  le reste du projet.

## Hors périmètre

- Historique de prix par ligne BPU — sous-projet séparé (brique 2).
- Détection automatique d'autres formulaires que les 3 nommés (liste
  fermée en V1 — étendre la liste de mots-clés est trivial le jour où un
  4e formulaire récurrent est identifié, pas un chantier séparé).
- Signature électronique du formulaire généré.
- Un « profil entreprise » complet au-delà des 6 champs nécessaires à
  ces 3 formulaires précis.
- Remplacement des lectures ponctuelles existantes
  (`obtenirNomEntreprise`/`obtenirTauxFraisStructureDefaut`) par
  `obtenirEntreprise` — coexistence assumée, refactor non lié hors
  scope.
