import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { listerDocuments } from "@/lib/documents/queries";
import { listerNotifications } from "@/lib/notifications/actions";
import { getUserLocale } from "@/i18n/locale";
import {
  calculerKpiAccueil,
  calculerRepartitionPipeline,
  listerAoEcheanceProche,
  listerDocumentsExpirant,
} from "@/lib/accueil/kpi";
import { RepartitionPipelineChart } from "@/components/accueil/repartition-pipeline-chart";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function formaterEcheanceRelative(dateIso: string, locale: string): string {
  const jours = Math.ceil(
    (new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  const formateur = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return formateur.format(jours, "day");
}

export default async function AccueilPage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const [appelsOffres, documents, { nonLues }, locale] = await Promise.all([
    listerAppelsOffres(utilisateur.entreprise_id),
    listerDocuments(utilisateur.entreprise_id),
    listerNotifications(),
    getUserLocale(),
  ]);

  const kpi = calculerKpiAccueil(appelsOffres, documents, nonLues);
  const repartition = calculerRepartitionPipeline(appelsOffres);
  const aoEcheanceProche = listerAoEcheanceProche(appelsOffres);
  const documentsExpirant = listerDocumentsExpirant(documents);

  const t = await getTranslations("Accueil");

  const cartes = [
    { libelle: t("kpiAoEnCours"), valeur: kpi.aoEnCours, href: "/pipeline" },
    { libelle: t("kpiAoEcheanceProche"), valeur: kpi.aoEcheanceProche, href: "/pipeline" },
    { libelle: t("kpiDocumentsExpirant"), valeur: kpi.documentsExpirant, href: "/bibliotheque" },
    { libelle: t("kpiNotificationsNonLues"), valeur: kpi.notificationsNonLues, href: "/veille" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("page.filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("page.titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cartes.map((carte) => (
          <Link key={carte.libelle} href={carte.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {carte.libelle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{carte.valeur}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("graphiqueTitre")}</CardTitle>
        </CardHeader>
        <CardContent>
          {repartition.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunAo")}</p>
          ) : (
            <RepartitionPipelineChart repartition={repartition} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("listeEcheanceTitre")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {aoEcheanceProche.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucunAoEcheanceProche")}</p>
            ) : (
              aoEcheanceProche.map((ao) => (
                <Link
                  key={ao.id}
                  href={`/appels-offres/${ao.id}`}
                  className="flex flex-col gap-0.5 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">
                    {ao.titre ?? ao.fichierDaoNomOriginal}
                  </span>
                  <span className="text-muted-foreground">
                    {t("echeanceLabel", {
                      relatif: formaterEcheanceRelative(ao.dateLimite, locale),
                    })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("listeDocumentsTitre")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {documentsExpirant.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucunDocumentExpirant")}</p>
            ) : (
              documentsExpirant.map((doc) => (
                <Link
                  key={doc.id}
                  href="/bibliotheque"
                  className="flex flex-col gap-0.5 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{doc.nom}</span>
                  <span className="text-muted-foreground">
                    {t("echeanceLabel", {
                      relatif: formaterEcheanceRelative(doc.dateExpiration, locale),
                    })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
