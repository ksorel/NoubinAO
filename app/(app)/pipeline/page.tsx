import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { PipelineTable } from "./pipeline-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function PipelinePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const appelsOffres = await listerAppelsOffres(utilisateur.entreprise_id);
  const t = await getTranslations("Pipeline.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <PipelineTable appelsOffres={appelsOffres} />
    </div>
  );
}
