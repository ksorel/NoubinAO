"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  creerMembreGroupement,
  modifierMembreGroupement,
  deplacerMembreGroupement,
  supprimerMembreGroupement,
  basculerPieceMembreGroupement,
} from "@/lib/appels-offres/actions";
import { calculerSommePourcentages } from "@/lib/appels-offres/groupement";
import {
  ROLES_MEMBRE_GROUPEMENT,
  PIECES_GROUPEMENT,
  type MembreGroupement,
  type RoleMembreGroupement,
  type ClePieceGroupement,
} from "@/lib/appels-offres/types";

function LignePieces({
  appelOffresId,
  membreId,
  piecesInitiales,
  onPiecesModifiees,
}: {
  appelOffresId: string;
  membreId: string;
  piecesInitiales: ClePieceGroupement[];
  onPiecesModifiees: (
    updater: (piecesCourantes: ClePieceGroupement[]) => ClePieceGroupement[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [isPending, startTransition] = useTransition();

  function basculer(cle: ClePieceGroupement, coche: boolean) {
    onPiecesModifiees((liste) => (coche ? [...liste, cle] : liste.filter((c) => c !== cle)));

    startTransition(async () => {
      const resultat = await basculerPieceMembreGroupement(appelOffresId, membreId, cle);
      if ("erreur" in resultat) {
        toast.error(t("erreurBascule"));
        // Revert = opération inverse appliquée à l'état courant (pas un
        // instantané figé) : voir ChecklistSoumission.basculer pour le patron.
        onPiecesModifiees((liste) => (coche ? liste.filter((c) => c !== cle) : [...liste, cle]));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        {t("piecesAFournir")}
      </h4>
      <ul className="flex flex-col gap-1 text-sm">
        {PIECES_GROUPEMENT.map((cle) => {
          const coche = piecesInitiales.includes(cle);
          return (
            <li key={cle} className="flex items-center gap-2">
              <Checkbox
                id={`piece-${membreId}-${cle}`}
                checked={coche}
                aria-busy={isPending}
                onCheckedChange={(valeur) => basculer(cle, valeur === true)}
              />
              <Label htmlFor={`piece-${membreId}-${cle}`}>{t(`pieces.${cle}`)}</Label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LigneMembre({
  appelOffresId,
  membre,
  piecesInitiales,
  estPremiere,
  estDerniere,
  onMembresModifies,
  onPiecesModifiees,
}: {
  appelOffresId: string;
  membre: MembreGroupement;
  piecesInitiales: ClePieceGroupement[];
  estPremiere: boolean;
  estDerniere: boolean;
  onMembresModifies: (updater: (membresCourants: MembreGroupement[]) => MembreGroupement[]) => void;
  onPiecesModifiees: (
    updater: (piecesCourantes: ClePieceGroupement[]) => ClePieceGroupement[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [nom, setNom] = useState(membre.nom);
  const [role, setRole] = useState<RoleMembreGroupement>(membre.role);
  const [pourcentage, setPourcentage] = useState(
    membre.pourcentage === null ? "" : String(membre.pourcentage),
  );

  function reinitialiser() {
    setNom(membre.nom);
    setRole(membre.role);
    setPourcentage(membre.pourcentage === null ? "" : String(membre.pourcentage));
  }

  async function enregistrer(champsRole?: RoleMembreGroupement) {
    const input = {
      nom,
      role: champsRole ?? role,
      pourcentage: pourcentage.trim().length > 0 ? pourcentage : null,
    };

    const resultat = await modifierMembreGroupement(appelOffresId, membre.id, input);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      reinitialiser();
      return;
    }

    onMembresModifies((membresCourants) =>
      membresCourants.map((m) =>
        m.id === membre.id
          ? {
              ...m,
              nom: input.nom,
              role: input.role,
              pourcentage: input.pourcentage === null ? null : Number(input.pourcentage),
            }
          : m,
      ),
    );
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerMembreGroupement(appelOffresId, membre.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const membresRetournes = resultat.membres;
    onMembresModifies(() => membresRetournes);
  }

  async function supprimer() {
    const resultat = await supprimerMembreGroupement(appelOffresId, membre.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onMembresModifies((membresCourants) => membresCourants.filter((m) => m.id !== membre.id));
    toast.success(t("toastMembreSupprime"));
  }

  return (
    <li className="flex flex-col gap-2 border-b pb-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-nom-${membre.id}`}>{t("champNom")}</Label>
          <Input
            id={`membre-nom-${membre.id}`}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onBlur={() => enregistrer()}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-role-${membre.id}`}>{t("champRole")}</Label>
          <Select
            value={role}
            onValueChange={(valeur) => {
              const nouveauRole = valeur as RoleMembreGroupement;
              setRole(nouveauRole);
              void enregistrer(nouveauRole);
            }}
          >
            <SelectTrigger id={`membre-role-${membre.id}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES_MEMBRE_GROUPEMENT.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`role.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`membre-pourcentage-${membre.id}`}>{t("champPourcentage")}</Label>
          <Input
            id={`membre-pourcentage-${membre.id}`}
            type="number"
            value={pourcentage}
            onChange={(e) => setPourcentage(e.target.value)}
            onBlur={() => enregistrer()}
            className="w-24"
          />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("haut")}
            disabled={estPremiere}
            aria-label={t("deplacerHaut")}
          >
            {t("fleche.haut")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("bas")}
            disabled={estDerniere}
            aria-label={t("deplacerBas")}
          >
            {t("fleche.bas")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </div>
      </div>

      {role === "co_traitant" && (
        <LignePieces
          appelOffresId={appelOffresId}
          membreId={membre.id}
          piecesInitiales={piecesInitiales}
          onPiecesModifiees={onPiecesModifiees}
        />
      )}
    </li>
  );
}

export function GroupementCard({
  appelOffresId,
  membresInitiaux,
  piecesParMembreInitial,
  nomEntreprise,
}: {
  appelOffresId: string;
  membresInitiaux: MembreGroupement[];
  piecesParMembreInitial: Record<string, ClePieceGroupement[]>;
  nomEntreprise: string | null;
}) {
  const t = useTranslations("AppelsOffres.detail.groupement");
  const [membres, setMembres] = useState(membresInitiaux);
  const [piecesParMembre, setPiecesParMembre] = useState(piecesParMembreInitial);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [nouveauMembre, setNouveauMembre] = useState(() =>
    membresInitiaux.length === 0
      ? { nom: nomEntreprise ?? "", role: "mandataire" as RoleMembreGroupement, pourcentage: "" }
      : { nom: "", role: "mandataire" as RoleMembreGroupement, pourcentage: "" },
  );

  const somme = calculerSommePourcentages(membres);

  async function ajouterMembre() {
    if (nouveauMembre.nom.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerMembreGroupement(appelOffresId, {
      nom: nouveauMembre.nom,
      role: nouveauMembre.role,
      pourcentage: nouveauMembre.pourcentage.trim().length > 0 ? nouveauMembre.pourcentage : null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setMembres((liste) => [...liste, resultat.membre]);
    setPiecesParMembre((carte) => ({ ...carte, [resultat.membre.id]: [] }));
    setNouveauMembre({ nom: "", role: "mandataire", pourcentage: "" });
    toast.success(t("toastMembreAjoute"));
  }

  const membresTries = membres.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>

      {membresTries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("aucunMembre")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {membresTries.map((membre, index) => (
            <LigneMembre
              key={membre.id}
              appelOffresId={appelOffresId}
              membre={membre}
              piecesInitiales={piecesParMembre[membre.id] ?? []}
              estPremiere={index === 0}
              estDerniere={index === membresTries.length - 1}
              onMembresModifies={(updater) => setMembres(updater)}
              onPiecesModifiees={(updater) =>
                setPiecesParMembre((carte) => ({
                  ...carte,
                  [membre.id]: updater(carte[membre.id] ?? []),
                }))
              }
            />
          ))}
        </ul>
      )}

      {somme !== null && (
        <p className="text-sm">
          {t("totalPourcentage")} : {somme}%
        </p>
      )}
      {somme !== null && Math.abs(somme - 100) > 0.005 && (
        <p className="text-sm text-[hsl(var(--checklist-attention))]">
          {t("avertissementSomme", { total: somme })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-nom">{t("champNom")}</Label>
          <Input
            id="nouveau-membre-nom"
            value={nouveauMembre.nom}
            onChange={(e) => setNouveauMembre((v) => ({ ...v, nom: e.target.value }))}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-role">{t("champRole")}</Label>
          <Select
            value={nouveauMembre.role}
            onValueChange={(valeur) =>
              setNouveauMembre((v) => ({ ...v, role: valeur as RoleMembreGroupement }))
            }
          >
            <SelectTrigger id="nouveau-membre-role" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES_MEMBRE_GROUPEMENT.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`role.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-membre-pourcentage">{t("champPourcentage")}</Label>
          <Input
            id="nouveau-membre-pourcentage"
            type="number"
            value={nouveauMembre.pourcentage}
            onChange={(e) => setNouveauMembre((v) => ({ ...v, pourcentage: e.target.value }))}
            className="w-24"
          />
        </div>
        <Button type="button" variant="outline" onClick={ajouterMembre} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
