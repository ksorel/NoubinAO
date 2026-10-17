"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  creerTypeMarcheGoNoGo,
  modifierTypeMarcheGoNoGo,
  desactiverTypeMarcheGoNoGo,
} from "@/lib/appels-offres/actions";
import type { TypeMarcheGoNoGo } from "@/lib/appels-offres/types";

export function TypesMarcheTable({
  typesInitiaux,
  typeSelectionneId,
  onSelectionChange,
}: {
  typesInitiaux: TypeMarcheGoNoGo[];
  typeSelectionneId: string | null;
  onSelectionChange: (id: string) => void;
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [types, setTypes] = useState(typesInitiaux);
  const [nomsEdition, setNomsEdition] = useState<Record<string, string>>({});
  const [nouveauNom, setNouveauNom] = useState("");

  async function ajouter() {
    if (nouveauNom.trim().length === 0) return;
    const resultat = await creerTypeMarcheGoNoGo({ nom: nouveauNom });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => [
      ...liste,
      { id: resultat.id, entreprise_id: "", nom: nouveauNom, actif: true, ordre: liste.length, created_at: new Date().toISOString() },
    ]);
    setNouveauNom("");
    toast.success(t("toastEnregistre"));
  }

  async function renommer(id: string) {
    const nom = nomsEdition[id];
    if (!nom || nom.trim().length === 0) return;
    const resultat = await modifierTypeMarcheGoNoGo(id, { nom });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => liste.map((type) => (type.id === id ? { ...type, nom } : type)));
    toast.success(t("toastEnregistre"));
  }

  async function desactiver(id: string) {
    const resultat = await desactiverTypeMarcheGoNoGo(id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => liste.filter((type) => type.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {types.map((type) => (
        <div key={type.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectionChange(type.id)}
            className={`flex-1 text-left px-2 py-1 rounded ${typeSelectionneId === type.id ? "bg-muted font-medium" : ""}`}
          >
            {type.nom}
          </button>
          <Input
            className="w-48"
            placeholder={t("champNom")}
            value={nomsEdition[type.id] ?? ""}
            onChange={(e) => setNomsEdition((m) => ({ ...m, [type.id]: e.target.value }))}
          />
          <Button variant="outline" size="sm" onClick={() => renommer(type.id)}>
            {t("boutonEnregistrer")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => desactiver(type.id)}>
            {t("boutonDesactiver")}
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          className="w-48"
          placeholder={t("champNom")}
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={ajouter}>
          {t("boutonAjouterType")}
        </Button>
      </div>
    </div>
  );
}
