# Rattachement email ↔ AO + fil de suivi (Module 6, sous-projet 3)

Date : 2026-09-14
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Troisième et dernier sous-projet planifié du Module 6 (Intégration email),
après la connexion OAuth Gmail (sous-projet 1) et la synchronisation
périodique (sous-projet 2), tous deux mergés sur `main`. Ce sous-projet
ferme la boucle du Module 6 telle que décrite dans `CLAUDE.md` :
« rattachement automatique des échanges à l'AO concerné (par règles
simples au départ : objet, expéditeur, mots-clés) » et « un fil de suivi
par AO qui centralise emails échangés ».

Les emails sont déjà synchronisés en base (table `email`, sous-projet 2)
mais tous privés à leur propriétaire (`appel_offres_id` toujours `null`,
RLS scopée à `utilisateur_id = auth.uid()`). Ce sous-projet : (1) calcule
une suggestion de correspondance email ↔ AO par heuristique simple, (2)
ajoute une interface pour que l'utilisateur confirme manuellement un
rattachement, (3) élargit la visibilité à toute l'équipe une fois un
email effectivement rattaché — c'est ce rattachement, pas la
synchronisation, qui déclenche la visibilité "équipe" actée au
sous-projet 1.

## Décisions validées avec l'utilisateur

- **Suggéré + confirmation manuelle, jamais de liaison automatique
  silencieuse.** Même principe que le mapping documents du Module 4
  (heuristique = tri des suggestions, jamais une décision prise à la
  place de l'utilisateur). Un mauvais rattachement automatique serait
  plus grave qu'un mauvais mapping de document : l'email deviendrait
  visible par toute l'équipe sur le mauvais AO, sans validation.
- **Trois signaux de correspondance**, combinés en un score simple (pas
  de classification IA — cohérent avec `CLAUDE.md`, qui réserve l'IA au
  cas où les règles simples s'avéreraient insuffisantes) :
  1. Nom de l'acheteur de l'AO présent dans l'objet, l'expéditeur ou le
     contenu de l'email — signal le plus fiable disponible avec le schéma
     actuel (pas de numéro de référence AO en colonne séparée).
  2. Mots-clés du titre de l'AO présents dans l'objet/contenu de l'email
     — plus bruité seul (titres souvent longs et génériques), pondéré
     plus faiblement.
  3. Date de réception de l'email proche de la date limite de l'AO —
     signal faible seul, renforce la confiance combiné aux deux autres.
- **Périmètre des emails suggérés : uniquement ceux de l'utilisateur
  courant**, jamais ceux d'un collègue. Cohérent avec la règle de
  confidentialité déjà posée aux sous-projets 1-2 (un email reste privé
  jusqu'à rattachement) — chacun rattache ce qu'il a reçu lui-même.

## Modèle de données

```sql
-- Rattachement email <-> AO (Module 6, sous-projet 3). Une fois
-- appel_offres_id renseigné sur un email, il devient visible par toute
-- l'équipe de l'entreprise — c'est ce rattachement qui déclenche la
-- visibilité "équipe" actée au sous-projet 1, pas la synchronisation
-- elle-même (email_select_self, sous-projet 2, reste inchangée : un
-- email non rattaché reste toujours privé à son propriétaire).
create policy "email_select_equipe_si_rattache" on email
  for select using (
    appel_offres_id is not null
    and exists (
      select 1 from utilisateur u
      where u.entreprise_id = email.entreprise_id and u.id = auth.uid()
    )
  );

-- Seul le propriétaire de la connexion (celui qui a reçu l'email) peut
-- le lier/délier — un email non rattaché n'est de toute façon visible
-- que par lui (email_select_self), donc lui seul peut jamais le
-- sélectionner dans l'interface pour le lier en premier lieu.
create policy "email_update_self" on email
  for update using (utilisateur_id = auth.uid());
```

Aucun changement de colonne — `email.appel_offres_id` existe déjà
(nullable, sous-projet 2). Seules deux nouvelles policies RLS
permissives, qui s'ajoutent à `email_select_self`/`email_insert_self`
sans les remplacer — même précédent que `utilisateur_select_membres`
(Module 5) et `email_select_self`/`email_insert_self` elles-mêmes.

## Heuristique de correspondance

Nouveau fichier `lib/email/correspondance.ts` :

```ts
const MOTS_VIDES = new Set([
  "de", "la", "le", "les", "des", "du", "un", "une", "et", "ou", "pour",
  "avec", "dans", "sur", "au", "aux", "en", "à", "d", "l", "et", "par",
]);

export function extraireMotsCles(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((mot) => mot.length >= 4 && !MOTS_VIDES.has(mot));
}

const QUARANTE_CINQ_JOURS_MS = 45 * 24 * 60 * 60 * 1000;

export interface EmailAScorer {
  objet: string | null;
  contenu: string | null;
  expediteur: string | null;
  recu_le: string | null;
}

export interface AppelOffresAScorer {
  titre: string | null;
  acheteur: string | null;
  date_limite: string | null;
}

export function calculerScoreCorrespondance(
  email: EmailAScorer,
  appelOffres: AppelOffresAScorer,
): number {
  const texteEmail = [email.objet, email.expediteur, email.contenu]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (appelOffres.acheteur && texteEmail.includes(appelOffres.acheteur.toLowerCase())) {
    score += 10;
  }

  if (appelOffres.titre) {
    const motsCles = extraireMotsCles(appelOffres.titre);
    const correspondances = motsCles.filter((mot) => texteEmail.includes(mot)).length;
    score += correspondances * 2;
  }

  if (appelOffres.date_limite && email.recu_le) {
    const diffMs = Math.abs(
      new Date(email.recu_le).getTime() - new Date(appelOffres.date_limite).getTime(),
    );
    if (diffMs <= QUARANTE_CINQ_JOURS_MS) score += 3;
  }

  return score;
}
```

Fonctions pures, testées unitairement (voir Tests). `extraireMotsCles`
retire une petite liste de mots vides français et les mots de moins de 4
caractères (élimine le bruit des numéros entre parenthèses type "(02)",
des articles, etc.) plutôt qu'une vraie tokenisation linguistique —
suffisant pour l'objectif (réduire le bruit), pas une garantie
d'exhaustivité.

## Lecture

Ajouts dans `lib/email/queries.ts` :

```ts
export async function listerEmailsLies(appelOffresId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}

export async function listerEmailsNonLies(utilisateurId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("utilisateur_id", utilisateurId)
    .is("appel_offres_id", null)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}
```

`listerEmailsLies` : repose sur `email_select_equipe_si_rattache`, lit
tous les emails déjà rattachés à cet AO, peu importe qui les a
synchronisés (visibilité équipe). `listerEmailsNonLies` : repose sur
`email_select_self`, ne renvoie jamais que les emails de l'utilisateur
courant — c'est cette fonction qui matérialise la décision "suggestions
scopées à l'utilisateur courant".

Nouveau type dans `lib/email/types.ts` :

```ts
export interface Email {
  id: string;
  entreprise_id: string;
  utilisateur_id: string;
  compte_email_connecte_id: string;
  appel_offres_id: string | null;
  message_id_gmail: string;
  expediteur: string | null;
  destinataires: string | null;
  objet: string | null;
  contenu: string | null;
  pieces_jointes: { nom: string; tailleOctets: number; typeMime: string }[];
  recu_le: string | null;
  created_at: string;
}
```

## Intégration dans `obtenirAppelOffres`

`lib/appels-offres/queries.ts::obtenirAppelOffres` gagne un paramètre
`utilisateurId` (déjà disponible côté appelant, `page.tsx` a
`utilisateur.id`) et deux champs dans son objet de retour :

```ts
export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
  utilisateurId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: Email[];
  emailsNonLies: Email[];
} | null> {
```

Corps de la fonction : après la lecture existante, ajouter
`const [emailsLies, emailsNonLies] = await Promise.all([listerEmailsLies(id), listerEmailsNonLies(utilisateurId)]);`
et inclure les deux dans l'objet retourné. Signature de
`app/(app)/appels-offres/[id]/page.tsx` mise à jour en conséquence
(`obtenirAppelOffres(id, utilisateur.entreprise_id, utilisateur.id)`).

## Server Actions

Nouveau bloc dans `lib/email/actions.ts` (fichier existant) :

```ts
export async function lierEmailAAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // .select("id") force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline
  // (lib/appels-offres/actions.ts) : sans elle, un emailId périmé ou déjà
  // rattaché ailleurs renverrait {succes: true} sans qu'aucune ligne
  // n'ait été modifiée. La policy email_update_self garantit déjà que
  // seul le propriétaire peut modifier CET email ; ce filtre supplémentaire
  // (utilisateur_id) est une seconde barrière explicite, pas la seule.
  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: appelOffresId })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec du rattachement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function delierEmailAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: null })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec de la dissociation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

**Délier reste réservé au propriétaire de l'email**, même une fois
l'email devenu visible par l'équipe — cohérent avec `email_update_self`
(seule policy d'écriture ajoutée) : un collègue peut *voir* un email
rattaché mais ne peut pas le délier ni le rattacher ailleurs. Pas de
délégation d'écriture à toute l'équipe dans ce sous-projet ; à
reconsidérer plus tard si un besoin réel apparaît (ex. le propriétaire a
quitté l'entreprise).

## Interface

Nouveau fichier `app/(app)/appels-offres/[id]/fil-suivi.tsx` (client
component), même patron que `documents-exigence.tsx` :

- Liste des emails déjà liés (`emailsLies`), triés du plus récent au plus
  ancien : expéditeur, objet, date, aperçu du contenu tronqué, bouton
  "Délier" (visible pour tous, mais l'action échoue proprement avec un
  message d'erreur si l'utilisateur courant n'est pas le propriétaire de
  cet email précis — cohérent avec la défense en profondeur RLS déjà
  pratiquée ailleurs dans le projet, pas besoin de le griser côté client).
- Un `Select` listant les **suggestions** (`emailsNonLies` filtrés par
  `calculerScoreCorrespondance(email, appelOffres) > 0`, triés par score
  décroissant, plafonné aux 10 meilleurs) — **pas** de repli "liste
  complète des emails non liés" façon `documents-exigence.tsx` : contrairement
  à la bibliothèque documentaire (toujours petite), le nombre d'emails non
  liés d'un utilisateur peut se compter en dizaines voire centaines après
  quelques semaines de synchronisation ; les afficher tous dans un simple
  menu déroulant ne serait pas utilisable. Si aucune suggestion (score >
  0), message "Aucun email correspondant trouvé" plutôt qu'un menu vide.
- Sélectionner un email dans les suggestions appelle
  `lierEmailAAppelOffres`, retire l'email de la liste de suggestions et
  l'ajoute à la liste des emails liés (mise à jour optimiste, même patron
  que `DocumentsExigence`).

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { lierEmailAAppelOffres, delierEmailAppelOffres } from "@/lib/email/actions";
import { calculerScoreCorrespondance } from "@/lib/email/correspondance";
import type { Email } from "@/lib/email/types";
import type { AppelOffres } from "@/lib/appels-offres/types";

const NB_SUGGESTIONS_MAX = 10;

export function FilSuivi({
  appelOffresId,
  appelOffres,
  emailsLies: emailsLiesInitial,
  emailsNonLies,
}: {
  appelOffresId: string;
  appelOffres: Pick<AppelOffres, "titre" | "acheteur" | "date_limite">;
  emailsLies: Email[];
  emailsNonLies: Email[];
}) {
  const t = useTranslations("AppelsOffres.detail.filSuivi");
  const [emailsLies, setEmailsLies] = useState(emailsLiesInitial);
  const [emailsRestants, setEmailsRestants] = useState(emailsNonLies);
  const [isPending, startTransition] = useTransition();

  const suggestions = emailsRestants
    .map((email) => ({ email, score: calculerScoreCorrespondance(email, appelOffres) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, NB_SUGGESTIONS_MAX)
    .map(({ email }) => email);

  function onLier(emailId: string) {
    const email = emailsRestants.find((e) => e.id === emailId);
    if (!email) return;

    startTransition(async () => {
      const resultat = await lierEmailAAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        return;
      }
      setEmailsLies((liste) => [email, ...liste]);
      setEmailsRestants((liste) => liste.filter((e) => e.id !== emailId));
    });
  }

  function onDelier(emailId: string) {
    const precedent = emailsLies;
    setEmailsLies((liste) => liste.filter((e) => e.id !== emailId));

    startTransition(async () => {
      const resultat = await delierEmailAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setEmailsLies(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {emailsLies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunEmailLie")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {emailsLies.map((email) => (
            <li key={email.id} className="border-b pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{email.objet ?? t("sansObjet")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onDelier(email.id)}
                >
                  {t("delier")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{email.expediteur}</p>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 ? (
        <Select key={emailsLies.length} onValueChange={onLier} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholderSelect")} />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((email) => (
              <SelectItem key={email.id} value={email.id}>
                {email.objet ?? t("sansObjet")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">{t("aucuneSuggestion")}</p>
      )}
    </div>
  );
}
```

Dans `appel-offres-detail.tsx` : nouvelle section "Fil de suivi" (nouveau
`<h2>` + `<FilSuivi />`) insérée après la section "Critères d'évaluation"
et avant "Rédaction assistée" — nouvelles props `emailsLies`/`emailsNonLies`
transmises depuis `page.tsx`.

## États et erreurs

| État | Comportement |
|---|---|
| Aucun email lié | "Aucun email lié pour l'instant." |
| Aucune suggestion (score > 0 pour aucun email non lié) | "Aucun email correspondant trouvé." — pas de menu vide |
| Lier un email | Mise à jour optimiste (passe immédiatement de "suggestions" à "liés") |
| Délier un email | Mise à jour optimiste avec rollback + toast si l'action échoue |
| Email introuvable/déjà traité (course, id périmé) | Toast d'erreur, pas de fausse confirmation |

## Tests

- Vitest pour `extraireMotsCles` et `calculerScoreCorrespondance`
  (`lib/email/correspondance.test.ts`) : mots vides filtrés, mots courts
  filtrés, score nul sans aucune correspondance, score qui augmente avec
  chaque signal présent (acheteur seul, titre seul, date seule, cumul des
  trois), insensibilité à la casse.
- Pas de test pour `listerEmailsLies`/`listerEmailsNonLies` ni pour les
  Server Actions — cohérent avec l'absence de test déjà acceptée sur les
  lectures Supabase directes et les Server Actions ailleurs dans le
  projet (ex. `modifierStatutPipeline`, `associerDocumentAExigence`).

## Hors périmètre

- Classification par IA du rattachement — à reconsidérer seulement si
  l'heuristique par règles s'avère insuffisante en usage réel (position
  déjà actée dans `CLAUDE.md`).
- Affichage des pièces jointes (téléchargement) dans le fil de suivi —
  seules les métadonnées existent (sous-projet 2), rien de plus ajouté
  ici.
- Recherche ou pagination dans les emails non liés au-delà des 10
  meilleures suggestions — si le besoin de parcourir manuellement au-delà
  des suggestions apparaît, à traiter dans un incrément futur.
- Notification (toast, badge) quand une nouvelle suggestion à forte
  confiance apparaît après une synchronisation — l'utilisateur découvre
  les suggestions en visitant la page de l'AO, pas de push proactif.
- Délégation du rattachement/dissociation à toute l'équipe (au-delà du
  propriétaire de l'email) — voir la note dédiée dans la section Server
  Actions.
- **Performance de `listerEmailsNonLies` à grande échelle** : la requête
  ne plafonne pas le nombre de lignes renvoyées — pour un utilisateur avec
  plusieurs centaines d'emails non liés accumulés, tout est chargé en
  mémoire côté serveur avant d'être scoré et réduit aux 10 meilleures
  suggestions côté client. Acceptable pour un premier usage (le volume
  réel dépend de l'adoption, pas encore mesuré) ; à revisiter avec une
  requête plafonnée/paginée côté base si constaté comme un problème réel.
