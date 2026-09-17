"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { modifierTauxFraisStructureDefaut } from "@/lib/appels-offres/actions";

export function TauxFraisStructureCard({ tauxInitial }: { tauxInitial: number | null }) {
  const t = useTranslations("Parametres.tauxFraisStructure");
  const [taux, setTaux] = useState(tauxInitial === null ? "" : String(tauxInitial));

  async function enregistrer() {
    const resultat = await modifierTauxFraisStructureDefaut(
      taux.trim().length > 0 ? taux : null,
    );
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setTaux(tauxInitial === null ? "" : String(tauxInitial));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            onBlur={enregistrer}
            aria-label={t("titre")}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </CardContent>
    </Card>
  );
}
