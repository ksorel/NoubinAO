"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { creerReferenceProjet, ajouterReferenceAuDossier } from "@/lib/appels-offres/actions";
import type {
  AppelOffresReference,
  ReferenceProjet,
  RoleReference,
} from "@/lib/appels-offres/types";
import { ROLES_REFERENCE } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";
import { ReferenceRow } from "./reference-row";

const NOUVELLE_REFERENCE = "_nouvelle";

export function References({
  appelOffresId,
  appelOffresReferencesInitiales,
  referencesParIdInitial,
  justificatifsParReferenceInitial,
  abeDocumentParReferenceInitial,
  catalogueReferences,
  bibliotheque,
  entrepriseContact,
  criteresAo,
}: {
  appelOffresId: string;
  appelOffresReferencesInitiales: AppelOffresReference[];
  referencesParIdInitial: Record<string, ReferenceProjet>;
  justificatifsParReferenceInitial: Record<string, Document[]>;
  abeDocumentParReferenceInitial: Record<string, Document | null>;
  catalogueReferences: ReferenceProjet[];
  bibliotheque: Document[];
  entrepriseContact: { telephone: string | null; email: string | null; adresse: string | null };
  criteresAo: {
    periodeDebut: string | null;
    periodeFin: string | null;
    natureTags: string[];
    montantMinimal: number | null;
  };
}) {
  const t = useTranslations("AppelsOffres.detail.references");
  const [liens, setLiens] = useState(appelOffresReferencesInitiales);
  const [referencesParId, setReferencesParId] = useState(referencesParIdInitial);
  const [justificatifsParReference, setJustificatifsParReference] = useState(
    justificatifsParReferenceInitial,
  );
  const [abeDocumentParReference, setAbeDocumentParReference] = useState(
    abeDocumentParReferenceInitial,
  );
  const [catalogue, setCatalogue] = useState(catalogueReferences);

  const [referenceChoisie, setReferenceChoisie] = useState(NOUVELLE_REFERENCE);
  const [clientNom, setClientNom] = useState("");
  const [objet, setObjet] = useState("");
  const [role, setRole] = useState<RoleReference>("principal");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const documentsAbe = bibliotheque.filter((d) => d.type === "abe");
  const documentsJustificatif = bibliotheque.filter((d) => d.type === "reference_projet");

  const referencesDuCatalogueDisponibles = catalogue.filter(
    (r) => !liens.some((l) => l.reference_projet_id === r.id),
  );

  async function ajouter() {
    setAjoutEnCours(true);

    let referenceId = referenceChoisie;
    if (referenceChoisie === NOUVELLE_REFERENCE) {
      if (clientNom.trim().length === 0 || objet.trim().length === 0) {
        setAjoutEnCours(false);
        toast.error(t("champsRequis"));
        return;
      }
      const resultatReference = await creerReferenceProjet({
        clientNom,
        clientRccm: null,
        clientDateCreation: null,
        clientTelephone: null,
        clientEmail: null,
        clientAdresse: null,
        objet,
        natureTags: "",
        montant: null,
        role,
        dateDebut: null,
        dateFin: null,
      });
      if ("erreur" in resultatReference) {
        setAjoutEnCours(false);
        toast.error(resultatReference.erreur);
        return;
      }
      setReferencesParId((carte) => ({ ...carte, [resultatReference.reference.id]: resultatReference.reference }));
      setJustificatifsParReference((carte) => ({ ...carte, [resultatReference.reference.id]: [] }));
      setAbeDocumentParReference((carte) => ({ ...carte, [resultatReference.reference.id]: null }));
      setCatalogue((liste) => [...liste, resultatReference.reference]);
      referenceId = resultatReference.reference.id;
    }

    const resultat = await ajouterReferenceAuDossier(appelOffresId, referenceId);
    setAjoutEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setLiens((liste) => [...liste, resultat.appelOffresReference]);
    setReferenceChoisie(NOUVELLE_REFERENCE);
    setClientNom("");
    setObjet("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <p className="text-sm text-muted-foreground">{t("explication")}</p>
      </div>

      {liens.length === 0 && <p className="text-sm text-muted-foreground">{t("aucuneReference")}</p>}

      {liens.map((lien) => {
        const reference = referencesParId[lien.reference_projet_id];
        if (!reference) return null;
        return (
          <ReferenceRow
            key={lien.id}
            appelOffresId={appelOffresId}
            appelOffresReference={lien}
            reference={reference}
            justificatifs={justificatifsParReference[reference.id] ?? []}
            abeDocument={abeDocumentParReference[reference.id] ?? null}
            documentsAbe={documentsAbe}
            documentsJustificatif={documentsJustificatif}
            entrepriseContact={entrepriseContact}
            criteresAo={criteresAo}
            onReferenceModifiee={(referenceModifiee) =>
              setReferencesParId((carte) => ({ ...carte, [referenceModifiee.id]: referenceModifiee }))
            }
            onLienSupprime={() => setLiens((liste) => liste.filter((l) => l.id !== lien.id))}
            onJustificatifsChange={(justificatifs) =>
              setJustificatifsParReference((carte) => ({ ...carte, [reference.id]: justificatifs }))
            }
            onAbeDocumentChange={(document) =>
              setAbeDocumentParReference((carte) => ({ ...carte, [reference.id]: document }))
            }
          />
        );
      })}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Select value={referenceChoisie} onValueChange={setReferenceChoisie}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOUVELLE_REFERENCE}>{t("optionNouvelleReference")}</SelectItem>
            {referencesDuCatalogueDisponibles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.client_nom} - {r.objet}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {referenceChoisie === NOUVELLE_REFERENCE && (
          <>
            <Input
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder={t("champClientNom")}
              className="w-48"
            />
            <Input
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder={t("champObjet")}
              className="w-56"
            />
            <Select value={role} onValueChange={(v) => setRole(v as RoleReference)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES_REFERENCE.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <Button type="button" variant="outline" onClick={ajouter} disabled={ajoutEnCours}>
          {ajoutEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
