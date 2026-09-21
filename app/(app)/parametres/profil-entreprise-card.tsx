"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { modifierProfilEntreprise } from "@/lib/utilisateur/actions";
import type { Entreprise } from "@/lib/utilisateur/types";

export function ProfilEntrepriseCard({ entreprise }: { entreprise: Entreprise | null }) {
  const t = useTranslations("Parametres.profilEntreprise");
  const [nom, setNom] = useState(entreprise?.nom ?? "");
  const [rccm, setRccm] = useState(entreprise?.rccm ?? "");
  const [adresse, setAdresse] = useState(entreprise?.adresse ?? "");
  const [representantLegalNom, setRepresentantLegalNom] = useState(
    entreprise?.representant_legal_nom ?? "",
  );
  const [representantLegalQualite, setRepresentantLegalQualite] = useState(
    entreprise?.representant_legal_qualite ?? "",
  );
  const [idu, setIdu] = useState(entreprise?.idu ?? "");
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await modifierProfilEntreprise({
      nom,
      rccm: rccm.trim().length > 0 ? rccm : null,
      adresse: adresse.trim().length > 0 ? adresse : null,
      representantLegalNom: representantLegalNom.trim().length > 0 ? representantLegalNom : null,
      representantLegalQualite:
        representantLegalQualite.trim().length > 0 ? representantLegalQualite : null,
      idu: idu.trim().length > 0 ? idu : null,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
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
          <Label htmlFor="profil-nom">{t("champNom")}</Label>
          <Input id="profil-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-rccm">{t("champRccm")}</Label>
          <Input id="profil-rccm" value={rccm} onChange={(e) => setRccm(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-adresse">{t("champAdresse")}</Label>
          <Input id="profil-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-nom">{t("champRepresentantLegalNom")}</Label>
          <Input
            id="profil-representant-nom"
            value={representantLegalNom}
            onChange={(e) => setRepresentantLegalNom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-qualite">{t("champRepresentantLegalQualite")}</Label>
          <Input
            id="profil-representant-qualite"
            value={representantLegalQualite}
            onChange={(e) => setRepresentantLegalQualite(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-idu">{t("champIdu")}</Label>
          <Input id="profil-idu" value={idu} onChange={(e) => setIdu(e.target.value)} />
        </div>
        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {t("boutonEnregistrer")}
        </Button>
      </CardContent>
    </Card>
  );
}
