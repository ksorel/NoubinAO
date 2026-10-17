"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { modifierParametresGoNoGo } from "@/lib/appels-offres/actions";

export function GoNoGoCard({
  parametresInitiaux,
}: {
  parametresInitiaux: { noteMinGo: number; margeMinVisee: number };
}) {
  const t = useTranslations("Parametres.goNoGo");
  const [noteMinGo, setNoteMinGo] = useState(String(parametresInitiaux.noteMinGo));
  const [margeMinVisee, setMargeMinVisee] = useState(String(parametresInitiaux.margeMinVisee * 100));

  async function enregistrer() {
    const resultat = await modifierParametresGoNoGo({ noteMinGo, margeMinVisee });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setNoteMinGo(String(parametresInitiaux.noteMinGo));
      setMargeMinVisee(String(parametresInitiaux.margeMinVisee * 100));
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="note-min-go">{t("champNoteMinGo")}</Label>
          <Input
            id="note-min-go"
            type="number"
            value={noteMinGo}
            onChange={(e) => setNoteMinGo(e.target.value)}
            onBlur={enregistrer}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="marge-min-visee">{t("champMargeMinVisee")}</Label>
          <Input
            id="marge-min-visee"
            type="number"
            value={margeMinVisee}
            onChange={(e) => setMargeMinVisee(e.target.value)}
            onBlur={enregistrer}
            className="w-24"
          />
        </div>
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link href="/parametres/go-no-go">{t("lienParametrage")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
