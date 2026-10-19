import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerTypesMarcheGoNoGo, listerQuestionsGoNoGo } from "@/lib/appels-offres/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { ParametresGoNoGoClient } from "./client";

export default async function ParametresGoNoGoPage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");
  if (utilisateur.role !== "admin") redirect("/parametres");

  const [typesMarche, questions] = await Promise.all([
    listerTypesMarcheGoNoGo(utilisateur.entreprise_id),
    listerQuestionsGoNoGo(utilisateur.entreprise_id, true),
  ]);

  const t = await getTranslations("Parametres.goNoGoTypesMarche");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane
        items={[{ label: "Paramètres", href: "/parametres" }, { label: t("filAriane") }]}
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ParametresGoNoGoClient typesInitiaux={typesMarche} questionsInitiales={questions} />
    </div>
  );
}
