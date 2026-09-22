# Suivi de la caution de soumission comme tâche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un jalon de rétroplanning "Obtenir la caution de soumission", généré automatiquement (position 10 % du délai, juste après l'analyse Go/No-Go) uniquement quand `montant_caution` est déjà renseigné sur l'AO au moment de la génération.

**Architecture:** Extension purement additive de la fonction pure `genererJalonsParDefaut` (nouveau 3ᵉ paramètre optionnel) et de la Server Action `genererJalonsRetroplanning` (une colonne de plus dans sa requête). Aucun nouveau modèle de données, aucune nouvelle Server Action, aucun changement d'interface.

## Global Constraints

- Statut simple coché/décoché — aucun cycle de vie à plusieurs étapes.
- Jalon caution généré seulement si `montant_caution` est un nombre positif au moment du clic — jamais sur un AO sans montant connu.
- Position par défaut : même fraction (0.1) que l'analyse Go/No-Go, juste après elle dans l'ordre du tableau retourné.
- Aucune régénération/rattrapage automatique si le montant est renseigné après coup — l'utilisateur ajoute manuellement via `creerJalon`, déjà disponible.
- Paramètre `montantCaution` strictement optionnel et additif — tous les appels existants à 2 arguments doivent continuer de fonctionner sans modification.
- Aucun jalon ne doit être bloquant — cohérent avec Go/No-Go et la Checklist de soumission.
- Vérifier `npx tsc --noEmit`, `npx vitest run`, `npx next build` avant de clore la tâche.
- Commit conventionnel (`feat:`).

---

### Task 1: Jalon caution conditionnel dans le rétroplanning

**Files:**
- Modify: `lib/appels-offres/retroplanning.ts`
- Test: `lib/appels-offres/retroplanning.test.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: aucune nouvelle dépendance — `PHASES_PROPORTIONNELLES`, `formatDateISO`, `JOUR_MS` déjà présents dans `retroplanning.ts` ; `JalonRetroplanning` (existant, `lib/appels-offres/types.ts`).
- Produces: `genererJalonsParDefaut(dateLimite: Date, maintenant?: Date, montantCaution?: number | null): JalonGenere[]` — signature étendue, rétrocompatible. Consommée uniquement par `genererJalonsRetroplanning` dans ce plan.

- [ ] **Step 1: Écrire les tests qui échouent**

Le fichier `lib/appels-offres/retroplanning.test.ts` existant (4 tests, appels à 2 arguments) reste inchangé — ce sont des tests de non-régression pour le comportement par défaut (sans 3ᵉ argument). Ajouter un nouveau bloc `describe` à la fin du fichier, après le `describe("genererJalonsParDefaut", ...)` existant :

```ts
describe("genererJalonsParDefaut — jalon caution", () => {
  const MAINTENANT = new Date("2026-01-01T00:00:00.000Z");
  const DATE_LIMITE = new Date("2026-01-31T00:00:00.000Z"); // 30 jours après MAINTENANT

  it("ajoute le jalon caution en 2e position quand montantCaution est positif", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 5000000);

    expect(jalons).toEqual([
      { libelle: "Analyse du DAO et décision Go/No-Go", dateCible: "2026-01-04" },
      { libelle: "Obtenir la caution de soumission", dateCible: "2026-01-04" },
      {
        libelle: "Constitution du dossier (pièces, mapping, rédaction)",
        dateCible: "2026-01-13",
      },
      { libelle: "Revue interne de l'offre", dateCible: "2026-01-20" },
      { libelle: "Relecture finale et vérifications", dateCible: "2026-01-26" },
      { libelle: "Dépôt du dossier", dateCible: "2026-01-30" },
    ]);
  });

  it("retourne 6 jalons quand montantCaution est positif", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 5000000);
    expect(jalons.length).toBe(6);
  });

  it("n'ajoute aucun jalon caution quand montantCaution est null", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, null);
    expect(jalons.length).toBe(5);
    expect(jalons.some((j) => j.libelle === "Obtenir la caution de soumission")).toBe(false);
  });

  it("n'ajoute aucun jalon caution quand montantCaution est undefined", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, undefined);
    expect(jalons.length).toBe(5);
  });

  it("n'ajoute aucun jalon caution quand montantCaution vaut 0", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT, 0);
    expect(jalons.length).toBe(5);
  });

  it("n'ajoute aucun jalon caution en l'absence du 3e argument (rétrocompatibilité)", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons.length).toBe(5);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/appels-offres/retroplanning.test.ts`
Expected: les 6 nouveaux tests échouent (le jalon caution n'existe pas encore, `genererJalonsParDefaut` ignore tout 3ᵉ argument) ; les 4 tests existants passent toujours.

- [ ] **Step 3: Implémenter le jalon caution conditionnel**

Fichier `lib/appels-offres/retroplanning.ts`, état actuel complet :

```ts
const JOUR_MS = 24 * 60 * 60 * 1000;

export interface JalonGenere {
  libelle: string;
  dateCible: string;
}

const PHASES_PROPORTIONNELLES: { libelle: string; fraction: number }[] = [
  { libelle: "Analyse du DAO et décision Go/No-Go", fraction: 0.1 },
  { libelle: "Constitution du dossier (pièces, mapping, rédaction)", fraction: 0.4 },
  { libelle: "Revue interne de l'offre", fraction: 0.65 },
  { libelle: "Relecture finale et vérifications", fraction: 0.85 },
];

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
): JalonGenere[] {
  const dureeMs = dateLimite.getTime() - maintenant.getTime();

  const jalons = PHASES_PROPORTIONNELLES.map(({ libelle, fraction }) => ({
    libelle,
    dateCible: formatDateISO(new Date(maintenant.getTime() + fraction * dureeMs)),
  }));

  // Jamais le jour même de la date limite — l'ebook insiste sur cette
  // marge de sécurité (« Jour 14, H-24 : dépôt effectif »), un dépôt de
  // dernière minute étant le principal facteur de rejet administratif.
  jalons.push({
    libelle: "Dépôt du dossier",
    dateCible: formatDateISO(new Date(dateLimite.getTime() - JOUR_MS)),
  });

  return jalons;
}
```

Remplacer la signature et le corps de `genererJalonsParDefaut` par :

```ts
export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
  montantCaution?: number | null,
): JalonGenere[] {
  const dureeMs = dateLimite.getTime() - maintenant.getTime();

  const jalons = PHASES_PROPORTIONNELLES.map(({ libelle, fraction }) => ({
    libelle,
    dateCible: formatDateISO(new Date(maintenant.getTime() + fraction * dureeMs)),
  }));

  // Insérée juste après l'analyse Go/No-Go (même fraction, 10 %) : la
  // démarche bancaire pour obtenir la garantie prend souvent plusieurs
  // jours, elle doit démarrer dès la décision de répondre, pas attendre.
  // Générée seulement si un montant de caution est déjà connu — aucun
  // jalon caution sur un AO qui n'en a pas (ou pas encore).
  if (montantCaution !== null && montantCaution !== undefined && montantCaution > 0) {
    jalons.splice(1, 0, {
      libelle: "Obtenir la caution de soumission",
      dateCible: formatDateISO(new Date(maintenant.getTime() + 0.1 * dureeMs)),
    });
  }

  // Jamais le jour même de la date limite — l'ebook insiste sur cette
  // marge de sécurité (« Jour 14, H-24 : dépôt effectif »), un dépôt de
  // dernière minute étant le principal facteur de rejet administratif.
  jalons.push({
    libelle: "Dépôt du dossier",
    dateCible: formatDateISO(new Date(dateLimite.getTime() - JOUR_MS)),
  });

  return jalons;
}
```

(`jalons.splice(1, 0, ...)` insère juste après l'élément d'indice 0, qui est toujours "Analyse du DAO et décision Go/No-Go" — premier élément de `PHASES_PROPORTIONNELLES`.)

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/retroplanning.test.ts`
Expected: PASS — les 4 tests existants et les 6 nouveaux, 10/10.

- [ ] **Step 5: Brancher la Server Action `genererJalonsRetroplanning`**

Fichier `lib/appels-offres/actions.ts`, fonction actuelle (lignes 705-723) :

```ts
export async function genererJalonsRetroplanning(
  appelOffresId: string,
): Promise<{ erreur: string } | { succes: true; jalons: JalonRetroplanning[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(new Date(appelOffres.date_limite));
```

Remplacer par :

```ts
export async function genererJalonsRetroplanning(
  appelOffresId: string,
): Promise<{ erreur: string } | { succes: true; jalons: JalonRetroplanning[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite, montant_caution")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(
    new Date(appelOffres.date_limite),
    new Date(),
    appelOffres.montant_caution,
  );
```

Le reste de la fonction (insertion en base, `revalidatePath`, retour) reste inchangé.

- [ ] **Step 6: Vérifier l'ensemble**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npx vitest run`
Expected: suite complète verte, aucune régression.

Run: `npx next build`
Expected: build réussi.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/retroplanning.ts lib/appels-offres/retroplanning.test.ts lib/appels-offres/actions.ts
git commit -m "feat: jalon caution conditionnel dans le rétroplanning par défaut"
```

---

## Self-Review Notes

- **Spec coverage** : les deux changements de la spec (fonction pure + Server Action) sont couverts par cette tâche unique — le périmètre est trop petit pour justifier un découpage en plusieurs tâches (un seul fichier de logique, un seul point d'appel).
- **Placeholder scan** : aucun — chaque étape porte le code exact avant/après.
- **Type consistency** : `montantCaution?: number | null` correspond exactement au type de `appel_offres.montant_caution` (`number | null` dans `AppelOffres`, `lib/appels-offres/types.ts:37`) — Supabase renvoie `null` pour une colonne vide, jamais `undefined`, mais le paramètre accepte aussi `undefined` pour rester rétrocompatible avec tout appel futur à 2 arguments.
- **Rétrocompatibilité vérifiée** : les 4 tests existants de `retroplanning.test.ts` ne sont pas modifiés — paramètre strictement additif, comportement par défaut inchangé.
