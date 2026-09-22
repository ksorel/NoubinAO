import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAvisNational, listerImportationsEntreprise } from "@/lib/veille/queries";
import { VeilleTable } from "./veille-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function VeillePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const [avis, importations] = await Promise.all([
    listerAvisNational(),
    listerImportationsEntreprise(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Veille.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <VeilleTable avis={avis} avisImportesIds={[...importations]} />
    </div>
  );
}
