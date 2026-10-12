import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Abonnement } from "@/lib/abonnement/types";

export async function AbonnementCard({
  abonnement,
  utilise,
}: {
  abonnement: Abonnement;
  utilise: number;
}) {
  const t = await getTranslations("Parametres.abonnement");
  const tPlans = await getTranslations("Plans");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          <span className="font-medium">{tPlans(abonnement.plan)}</span>
          {" — "}
          {t("usage", { utilise, quota: abonnement.quota_mensuel })}
        </p>
      </CardContent>
    </Card>
  );
}
