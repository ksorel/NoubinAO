import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant, obtenirTauxFraisStructureDefaut } from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut] = await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
    </div>
  );
}
