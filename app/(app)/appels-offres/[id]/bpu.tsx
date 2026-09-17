"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { creerSectionBpu } from "@/lib/appels-offres/actions";
import { sommerMontants, compterLignesNonChiffrees } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuSection } from "./bpu-section";

export function Bpu({
  appelOffresId,
  sectionsInitiales,
  lignesParSectionInitiales,
  tauxFraisStructureDefaut,
}: {
  appelOffresId: string;
  sectionsInitiales: SectionBpu[];
  lignesParSectionInitiales: Record<string, LigneBpu[]>;
  tauxFraisStructureDefaut: number | null;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [sections, setSections] = useState(sectionsInitiales);
  const [lignesParSection, setLignesParSection] = useState(lignesParSectionInitiales);
  const [nouveauTitre, setNouveauTitre] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const toutesLesLignes = sections.flatMap((s) => lignesParSection[s.id] ?? []);
  const totalGeneral = sommerMontants(toutesLesLignes);
  const nonChiffrees = compterLignesNonChiffrees(toutesLesLignes);

  async function ajouterSection() {
    if (nouveauTitre.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerSectionBpu(appelOffresId, nouveauTitre);
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSections((liste) => [...liste, resultat.section]);
    setLignesParSection((carte) => ({ ...carte, [resultat.section.id]: [] }));
    setNouveauTitre("");
    toast.success(t("toastSectionAjoutee"));
  }

  function retirerSection(sectionId: string) {
    setSections((liste) => liste.filter((s) => s.id !== sectionId));
    setLignesParSection((carte) => {
      const copie = { ...carte };
      delete copie[sectionId];
      return copie;
    });
  }

  const sectionsTriees = sections.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <div className="text-right text-sm">
          <p className="font-semibold">
            {t("totalGeneral")} : {totalGeneral.toLocaleString("fr-FR")} FCFA
          </p>
          {nonChiffrees > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("lignesNonChiffrees", { count: nonChiffrees })}
            </p>
          )}
        </div>
      </div>

      {sectionsTriees.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("aucuneSection")}</p>
      )}

      {sectionsTriees.map((section, index) => (
        <BpuSection
          key={section.id}
          appelOffresId={appelOffresId}
          section={section}
          lignes={(lignesParSection[section.id] ?? []).slice().sort((a, b) => a.ordre - b.ordre)}
          estPremiere={index === 0}
          estDerniere={index === sectionsTriees.length - 1}
          tauxFraisStructureDefaut={tauxFraisStructureDefaut}
          onSectionModifiee={(sectionModifiee) =>
            setSections((liste) =>
              liste.map((s) => (s.id === sectionModifiee.id ? sectionModifiee : s)),
            )
          }
          onSectionSupprimee={retirerSection}
          onSectionsReordonnees={setSections}
          onLignesModifiees={(sectionId, updater) =>
            setLignesParSection((carte) => ({
              ...carte,
              [sectionId]: updater(carte[sectionId] ?? []),
            }))
          }
        />
      ))}

      <div className="flex items-end gap-2">
        <Input
          value={nouveauTitre}
          onChange={(e) => setNouveauTitre(e.target.value)}
          placeholder={t("titreSectionPlaceholder")}
          aria-label={t("champTitreSection")}
        />
        <Button type="button" variant="outline" onClick={ajouterSection} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterSection")}
        </Button>
      </div>
    </div>
  );
}
