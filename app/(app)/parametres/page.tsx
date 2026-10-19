import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  obtenirUtilisateurCourant,
  obtenirTauxFraisStructureDefaut,
  obtenirEntreprise,
  listerUtilisateurs,
  listerInvitationsEnAttente,
  obtenirParametresGoNoGo,
} from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { obtenirAbonnementAvecUsage } from "@/lib/abonnement/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { ProfilEntrepriseCard } from "./profil-entreprise-card";
import { EnTetePiedPageCard } from "./entete-pied-page-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { EquipeCard } from "./equipe-card";
import { ToastConnexion } from "./toast-connexion";
import { AbonnementCard } from "./abonnement-card";
import { GoNoGoCard } from "./go-no-go-card";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const estAdmin = utilisateur.role === "admin";

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut, entreprise, membres, invitations, abonnementAvecUsage, parametresGoNoGo] =
    await Promise.all([
      obtenirCompteEmailConnecte(utilisateur.id),
      obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
      obtenirEntreprise(utilisateur.entreprise_id),
      estAdmin ? listerUtilisateurs(utilisateur.entreprise_id) : Promise.resolve([]),
      estAdmin ? listerInvitationsEnAttente(utilisateur.entreprise_id) : Promise.resolve([]),
      obtenirAbonnementAvecUsage(utilisateur.entreprise_id),
      obtenirParametresGoNoGo(utilisateur.entreprise_id),
    ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      {abonnementAvecUsage && (
        <AbonnementCard
          abonnement={abonnementAvecUsage.abonnement}
          utilise={abonnementAvecUsage.utilise}
        />
      )}
      <CompteEmailCard compte={compte} />
      {estAdmin && <ProfilEntrepriseCard entreprise={entreprise} />}
      {estAdmin && <EnTetePiedPageCard entreprise={entreprise} />}
      {estAdmin && <GoNoGoCard parametresInitiaux={parametresGoNoGo} />}
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
      {estAdmin && <EquipeCard membres={membres} invitationsInitiales={invitations} />}
    </div>
  );
}
