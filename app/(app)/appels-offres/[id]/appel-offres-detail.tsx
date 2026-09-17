"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StatutTraitementBadge } from "../statut-traitement-badge";
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
  exporterDossierReponse,
} from "@/lib/appels-offres/actions";
import { versValeurDatetimeLocal } from "@/lib/appels-offres/datetime-local";
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CvTransforme,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
} from "@/lib/appels-offres/types";
import { DocumentsExigence } from "./documents-exigence";
import type { Document } from "@/lib/documents/types";
import { SectionRedaction } from "./section-redaction";
import type { SectionDossier } from "@/lib/appels-offres/types";
import { FilSuivi } from "./fil-suivi";
import type { EmailResume } from "@/lib/email/types";
import { ChecklistSoumission } from "./checklist-soumission";
import type { ItemChecklistAutomatique } from "@/lib/appels-offres/checklist";
import { GoNoGo } from "./go-no-go";
import { Retroplanning } from "./retroplanning";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bpu } from "./bpu";
import { GroupementCard } from "./groupement-card";
import { ModeleCv } from "./modele-cv";

export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle,
  evaluationGoNoGo,
  jalons,
  dateLimiteConnue,
  bpu,
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
  cvTransformeParDocument: cvTransformeParDocumentInitial,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  evaluationGoNoGo: EvaluationGoNoGo;
  jalons: JalonRetroplanning[];
  dateLimiteConnue: boolean;
  bpu: { sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> };
  tauxFraisStructureDefaut: number | null;
  groupement: { membres: MembreGroupement[]; piecesParMembre: Record<string, ClePieceGroupement[]> };
  nomEntreprise: string | null;
  cvTransformeParDocument: Record<string, CvTransforme>;
}) {
  const t = useTranslations("AppelsOffres.detail");
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);
  const [exportation, setExportation] = useState(false);
  // Levé au parent (et non local à DocumentsExigence) : un même CV peut
  // être associé à plusieurs exigences (table exigence_document,
  // many-to-many), donc plusieurs instances de DocumentsExigence peuvent
  // rendre le même document. Sans cet état partagé, transformer un CV
  // depuis une instance ne met pas à jour les autres, qui restent
  // capables de redéclencher un appel Claude payant pour la même
  // transformation.
  const [cvTransformes, setCvTransformes] = useState(cvTransformeParDocumentInitial);

  const pret = appelOffres.statut_traitement === "termine";

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await modifierAppelOffres(appelOffres.id, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("form.toastEnregistre"));
  }

  async function telecharger() {
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(appelOffres.fichier_dao_path);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  async function exporter() {
    setExportation(true);
    const resultat = await exporterDossierReponse(appelOffres.id);
    setExportation(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const criteresEvaluation = exigences.filter((e) => e.type_exigence === "critere_evaluation");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <StatutTraitementBadge
          statut={appelOffres.statut_traitement}
          erreurTraitement={appelOffres.erreur_traitement}
          dateCreation={appelOffres.created_at}
        />
        <Button variant="outline" onClick={telecharger} disabled={telechargement}>
          {t("boutonTelecharger")}
        </Button>
      </div>

      {!pret && (
        <p className="text-muted-foreground">
          {appelOffres.statut_traitement === "erreur"
            ? appelOffres.erreur_traitement
            : t("messageTraitementEnCours")}
        </p>
      )}

      <Tabs defaultValue="vue-ensemble">
        <TabsList>
          <TabsTrigger value="vue-ensemble">{t("onglets.vueEnsemble")}</TabsTrigger>
          <TabsTrigger value="bpu">{t("onglets.bpu")}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="vue-ensemble"
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
          forceMount
        >
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="titre">{t("form.champTitre")}</Label>
              <Input
                id="titre"
                name="titre"
                defaultValue={appelOffres.titre ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="acheteur">{t("form.champAcheteur")}</Label>
              <Input
                id="acheteur"
                name="acheteur"
                defaultValue={appelOffres.acheteur ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="secteur">{t("form.champSecteur")}</Label>
              <Input
                id="secteur"
                name="secteur"
                defaultValue={appelOffres.secteur ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dateLimite">{t("form.champDateLimite")}</Label>
              <Input
                id="dateLimite"
                name="dateLimite"
                type="datetime-local"
                defaultValue={versValeurDatetimeLocal(appelOffres.date_limite)}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="montantCaution">{t("form.champMontantCaution")}</Label>
              <Input
                id="montantCaution"
                name="montantCaution"
                type="number"
                defaultValue={appelOffres.montant_caution ?? ""}
                disabled={!pret}
              />
            </div>

            <Button type="submit" disabled={!pret || envoi}>
              {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
            </Button>
          </form>

          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          <GroupementCard
            appelOffresId={appelOffres.id}
            membresInitiaux={groupement.membres}
            piecesParMembreInitial={groupement.piecesParMembre}
            nomEntreprise={nomEntreprise}
          />

          <ModeleCv
            appelOffresId={appelOffres.id}
            modeleCvPath={appelOffres.modele_cv_path}
            modeleCvNomOriginal={appelOffres.modele_cv_nom_original}
          />

          <Retroplanning
            appelOffresId={appelOffres.id}
            dateLimiteConnue={dateLimiteConnue}
            jalonsInitiaux={jalons}
          />

          {pret && (
            <>
              {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold">{t("exigences.titreSommaire")}</h2>
                  <ul className="list-disc pl-5 text-sm">
                    {appelOffres.sommaire_attendu.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("exigences.titrePiecesRequises")}</h2>
                {piecesRequises.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("exigences.aucunePiece")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {piecesRequises.map((exigence) => (
                      <li key={exigence.id} className="border-b pb-2">
                        <p className="font-medium">{exigence.libelle}</p>
                        {exigence.description && (
                          <p className="text-sm text-muted-foreground">{exigence.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t("exigences.source")} : {exigence.source_section}
                        </p>
                        <div className="mt-2">
                          <DocumentsExigence
                            appelOffresId={appelOffres.id}
                            exigenceId={exigence.id}
                            libelleExigence={exigence.libelle}
                            documentsAssocies={documentsParExigence[exigence.id] ?? []}
                            bibliotheque={bibliotheque}
                            modeleCvDisponible={appelOffres.modele_cv_path !== null}
                            cvTransformeParDocument={cvTransformes}
                            onCvTransforme={(documentId, cv) =>
                              setCvTransformes((carte) => ({ ...carte, [documentId]: cv }))
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
                {criteresEvaluation.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {criteresEvaluation.map((exigence) => (
                      <li
                        key={exigence.id}
                        className="flex items-center justify-between border-b pb-2"
                      >
                        <div>
                          <p className="font-medium">{exigence.libelle}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("exigences.source")} : {exigence.source_section}
                          </p>
                        </div>
                        {exigence.ponderation !== null && (
                          <Badge variant="outline">{exigence.ponderation}%</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("filSuivi.titre")}</h2>
                <FilSuivi
                  appelOffresId={appelOffres.id}
                  emailsLies={emailsLies}
                  suggestions={suggestions}
                />
              </div>

              {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold">{t("redaction.titre")}</h2>
                  {appelOffres.sommaire_attendu.map((titreSection) => {
                    const section = sections.find((s) => s.titre === titreSection);
                    return (
                      <SectionRedaction
                        key={titreSection}
                        appelOffresId={appelOffres.id}
                        titreSection={titreSection}
                        section={section}
                        documentsSource={section ? (documentsParSection[section.id] ?? []) : []}
                        bibliotheque={bibliotheque}
                      />
                    );
                  })}
                </div>
              )}

              <ChecklistSoumission
                appelOffresId={appelOffres.id}
                dossierReponseId={dossierReponseId}
                checklistAutomatique={checklistAutomatique}
                checklistManuelle={checklistManuelle}
              />

              <Button onClick={exporter} disabled={exportation}>
                {t("boutonExporter")}
              </Button>
            </>
          )}
        </TabsContent>

        <TabsContent value="bpu" className="data-[state=inactive]:hidden" forceMount>
          <Bpu
            appelOffresId={appelOffres.id}
            sectionsInitiales={bpu.sections}
            lignesParSectionInitiales={bpu.lignesParSection}
            tauxFraisStructureDefaut={tauxFraisStructureDefaut}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
