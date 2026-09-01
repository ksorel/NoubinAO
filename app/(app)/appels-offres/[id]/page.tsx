import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirAppelOffres } from "@/lib/appels-offres/queries";
import { AppelOffresDetail } from "./appel-offres-detail";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function AppelOffresDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
  if (!resultat) notFound();

  const tPage = await getTranslations("AppelsOffres.page");
  const titre = resultat.appelOffres.titre ?? resultat.appelOffres.fichier_dao_nom_original;

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane
        items={[
          { label: tPage("filAriane"), href: "/appels-offres" },
          { label: titre },
        ]}
      />
      <h1 className="text-2xl font-bold">{titre}</h1>
      <AppelOffresDetail appelOffres={resultat.appelOffres} exigences={resultat.exigences} />
    </div>
  );
}
