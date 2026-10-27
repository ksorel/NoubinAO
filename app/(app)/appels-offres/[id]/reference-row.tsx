"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  modifierReferenceProjet,
  supprimerReferenceProjet,
  retirerReferenceDuDossier,
  lierAbeDocument,
  retirerAbeDocument,
  ajouterJustificatifReference,
  retirerJustificatifReference,
  genererDemandeAbe,
} from "@/lib/appels-offres/actions";
import { referenceCorrespondCriteres } from "@/lib/appels-offres/reference-filtre";
import { calculerAlertesIntegrite, estReferenceRecevable } from "@/lib/appels-offres/reference-integrite";
import {
  ROLES_REFERENCE,
  type AppelOffresReference,
  type ReferenceProjet,
  type RoleReference,
} from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";

const AUCUN_DOCUMENT = "_aucun";

export function ReferenceRow({
  appelOffresId,
  appelOffresReference,
  reference,
  justificatifs,
  abeDocument,
  documentsAbe,
  documentsJustificatif,
  entrepriseContact,
  criteresAo,
  onReferenceModifiee,
  onLienSupprime,
  onJustificatifsChange,
  onAbeDocumentChange,
}: {
  appelOffresId: string;
  appelOffresReference: AppelOffresReference;
  reference: ReferenceProjet;
  justificatifs: Document[];
  abeDocument: Document | null;
  documentsAbe: Document[];
  documentsJustificatif: Document[];
  entrepriseContact: { telephone: string | null; email: string | null; adresse: string | null };
  criteresAo: {
    periodeDebut: string | null;
    periodeFin: string | null;
    natureTags: string[];
    montantMinimal: number | null;
  };
  onReferenceModifiee: (reference: ReferenceProjet) => void;
  onLienSupprime: () => void;
  onJustificatifsChange: (justificatifs: Document[]) => void;
  onAbeDocumentChange: (document: Document | null) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.references");
  const [clientNom, setClientNom] = useState(reference.client_nom);
  const [clientRccm, setClientRccm] = useState(reference.client_rccm ?? "");
  const [clientDateCreation, setClientDateCreation] = useState(reference.client_date_creation ?? "");
  const [clientTelephone, setClientTelephone] = useState(reference.client_telephone ?? "");
  const [clientEmail, setClientEmail] = useState(reference.client_email ?? "");
  const [clientAdresse, setClientAdresse] = useState(reference.client_adresse ?? "");
  const [objet, setObjet] = useState(reference.objet);
  const [natureTags, setNatureTags] = useState(reference.nature_tags.join(", "));
  const [montant, setMontant] = useState(reference.montant === null ? "" : String(reference.montant));
  const [role, setRole] = useState<RoleReference>(reference.role);
  const [dateDebut, setDateDebut] = useState(reference.date_debut ?? "");
  const [dateFin, setDateFin] = useState(reference.date_fin ?? "");
  const [documentAbeChoisi, setDocumentAbeChoisi] = useState(AUCUN_DOCUMENT);
  const [documentJustificatifChoisi, setDocumentJustificatifChoisi] = useState(AUCUN_DOCUMENT);
  const [genereEnCours, setGenereEnCours] = useState<"lettre" | "formulaire-f6" | null>(null);

  // Accepte un rôle en override explicite : un <Select> appelle
  // enregistrer() depuis son onValueChange, où le setState qui vient de
  // partir n'est pas encore reflété dans la fermeture — même piège que
  // operateur dans article-conformite.tsx (sprint S6).
  async function enregistrer(roleOverride?: RoleReference) {
    const roleEffectif = roleOverride ?? role;
    const resultat = await modifierReferenceProjet(reference.id, {
      clientNom,
      clientRccm: clientRccm.trim().length > 0 ? clientRccm : null,
      clientDateCreation: clientDateCreation.trim().length > 0 ? clientDateCreation : null,
      clientTelephone: clientTelephone.trim().length > 0 ? clientTelephone : null,
      clientEmail: clientEmail.trim().length > 0 ? clientEmail : null,
      clientAdresse: clientAdresse.trim().length > 0 ? clientAdresse : null,
      objet,
      natureTags,
      montant: montant.trim().length > 0 ? montant : null,
      role: roleEffectif,
      dateDebut: dateDebut.trim().length > 0 ? dateDebut : null,
      dateFin: dateFin.trim().length > 0 ? dateFin : null,
    });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onReferenceModifiee({
      ...reference,
      client_nom: clientNom,
      client_rccm: clientRccm.trim().length > 0 ? clientRccm : null,
      client_date_creation: clientDateCreation.trim().length > 0 ? clientDateCreation : null,
      client_telephone: clientTelephone.trim().length > 0 ? clientTelephone : null,
      client_email: clientEmail.trim().length > 0 ? clientEmail : null,
      client_adresse: clientAdresse.trim().length > 0 ? clientAdresse : null,
      objet,
      nature_tags: natureTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      montant: montant.trim().length > 0 ? Number(montant) : null,
      role: roleEffectif,
      date_debut: dateDebut.trim().length > 0 ? dateDebut : null,
      date_fin: dateFin.trim().length > 0 ? dateFin : null,
    });
  }

  async function retirerDuDossier() {
    const resultat = await retirerReferenceDuDossier(appelOffresId, appelOffresReference.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLienSupprime();
  }

  async function supprimerDefinitivement() {
    const resultat = await supprimerReferenceProjet(reference.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLienSupprime();
  }

  async function lierAbe() {
    if (documentAbeChoisi === AUCUN_DOCUMENT) return;
    const resultat = await lierAbeDocument(appelOffresId, reference.id, documentAbeChoisi);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const document = documentsAbe.find((d) => d.id === documentAbeChoisi) ?? null;
    onAbeDocumentChange(document);
    setDocumentAbeChoisi(AUCUN_DOCUMENT);
  }

  async function retirerAbe() {
    const resultat = await retirerAbeDocument(appelOffresId, reference.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onAbeDocumentChange(null);
  }

  async function ajouterJustificatif() {
    if (documentJustificatifChoisi === AUCUN_DOCUMENT) return;
    const resultat = await ajouterJustificatifReference(
      appelOffresId,
      reference.id,
      documentJustificatifChoisi,
    );
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const document = documentsJustificatif.find((d) => d.id === documentJustificatifChoisi);
    if (document) onJustificatifsChange([...justificatifs, document]);
    setDocumentJustificatifChoisi(AUCUN_DOCUMENT);
  }

  async function retirerJustificatif(documentId: string) {
    const resultat = await retirerJustificatifReference(appelOffresId, reference.id, documentId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onJustificatifsChange(justificatifs.filter((d) => d.id !== documentId));
  }

  async function generer(type: "lettre" | "formulaire-f6") {
    setGenereEnCours(type);
    const resultat = await genererDemandeAbe(reference.id, type);
    setGenereEnCours(null);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  const documentsJustificatifDisponibles = documentsJustificatif.filter(
    (d) => !justificatifs.some((j) => j.id === d.id),
  );

  const recevable = estReferenceRecevable(abeDocument !== null, justificatifs.length);
  const correspond = referenceCorrespondCriteres(reference, criteresAo);
  const alertes = calculerAlertesIntegrite(reference, entrepriseContact, abeDocument);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={recevable ? "default" : "secondary"}>
          {recevable ? t("recevable") : t("nonRecevable")}
        </Badge>
        {correspond && <Badge variant="outline">{t("correspondCriteres")}</Badge>}
        {alertes.clientAnterieurAuDebut && (
          <Badge variant="destructive">{t("alerte.clientAnterieurAuDebut")}</Badge>
        )}
        {alertes.coordonneesPartagees && (
          <Badge variant="destructive">{t("alerte.coordonneesPartagees")}</Badge>
        )}
        {alertes.abeFormatEditableSansSignature && (
          <Badge variant="destructive">{t("alerte.abeFormatEditable")}</Badge>
        )}
        {alertes.periodeModifiee && (
          <Badge variant="destructive">{t("alerte.periodeModifiee")}</Badge>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={retirerDuDossier}>
          {t("retirerDuDossier")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={supprimerDefinitivement}>
          {t("supprimerDefinitivement")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientNom")}</Label>
          <Input value={clientNom} onChange={(e) => setClientNom(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientRccm")}</Label>
          <Input value={clientRccm} onChange={(e) => setClientRccm(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientDateCreation")}</Label>
          <Input
            type="date"
            value={clientDateCreation}
            onChange={(e) => setClientDateCreation(e.target.value)}
            onBlur={() => enregistrer()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientTelephone")}</Label>
          <Input
            value={clientTelephone}
            onChange={(e) => setClientTelephone(e.target.value)}
            onBlur={() => enregistrer()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientEmail")}</Label>
          <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champClientAdresse")}</Label>
          <Input
            value={clientAdresse}
            onChange={(e) => setClientAdresse(e.target.value)}
            onBlur={() => enregistrer()}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">{t("champObjet")}</Label>
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champRole")}</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              const nouveauRole = v as RoleReference;
              setRole(nouveauRole);
              enregistrer(nouveauRole);
            }}
          >
            <SelectTrigger>
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
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champNatureTags")}</Label>
          <Input
            value={natureTags}
            onChange={(e) => setNatureTags(e.target.value)}
            onBlur={() => enregistrer()}
            placeholder={t("natureReferencesTagsPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champMontant")}</Label>
          <Input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champDateDebut")}</Label>
          <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} onBlur={() => enregistrer()} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champDateFin")}</Label>
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} onBlur={() => enregistrer()} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <span className="text-xs font-medium text-muted-foreground">{t("abeTitre")}</span>
        {abeDocument ? (
          <>
            <span className="text-sm">{abeDocument.nom}</span>
            <Button type="button" variant="ghost" size="sm" onClick={retirerAbe}>
              {t("retirer")}
            </Button>
          </>
        ) : (
          <>
            <Select value={documentAbeChoisi} onValueChange={setDocumentAbeChoisi}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUCUN_DOCUMENT}>{t("optionChoisirDocument")}</SelectItem>
                {documentsAbe.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={lierAbe}
              disabled={documentAbeChoisi === AUCUN_DOCUMENT}
            >
              {t("associer")}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generer("lettre")}
          disabled={genereEnCours === "lettre"}
        >
          {genereEnCours === "lettre" && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonLettreAbe")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generer("formulaire-f6")}
          disabled={genereEnCours === "formulaire-f6"}
        >
          {genereEnCours === "formulaire-f6" && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonFormulaireF6")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("justificatifsTitre")}</span>
        {justificatifs.length === 0 && (
          <span className="text-xs text-muted-foreground">{t("aucunJustificatif")}</span>
        )}
        {justificatifs.map((d) => (
          <span key={d.id} className="flex items-center gap-1 text-sm">
            {d.nom}
            <Button type="button" variant="ghost" size="sm" onClick={() => retirerJustificatif(d.id)}>
              {t("retirer")}
            </Button>
          </span>
        ))}
        <Select value={documentJustificatifChoisi} onValueChange={setDocumentJustificatifChoisi}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUCUN_DOCUMENT}>{t("optionChoisirDocument")}</SelectItem>
            {documentsJustificatifDisponibles.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={ajouterJustificatif}
          disabled={documentJustificatifChoisi === AUCUN_DOCUMENT}
        >
          {t("ajouter")}
        </Button>
      </div>
    </div>
  );
}
