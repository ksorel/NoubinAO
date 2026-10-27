"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  ajouterSpecificationProduit,
  supprimerSpecificationProduit,
  demarrerTeleversementPieceProduit,
  finaliserTeleversementPieceProduit,
  supprimerPieceProduit,
  genererUrlTelechargementPieceProduit,
} from "@/lib/appels-offres/actions";
import type { Produit, SpecificationProduit } from "@/lib/appels-offres/types";

const MIME_TYPES_PIECE_PRODUIT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;

type TypePieceProduit = "fiche_technique" | "autorisation_fabricant" | "certificat_etalonnage";

// Pièce jointe produit (sprint S6, parcours expert v2, voir CLAUDE.md,
// Étape 5.2) : une seule pièce à la fois par type, uploadée directement
// navigateur → Supabase Storage via URL signée (même patron que
// televerser-dao-dialog.tsx), pour ne pas plafonner à ~4,5 Mo (limite du
// corps d'une Server Action sur Vercel).
function PieceProduit({
  appelOffresId,
  produitId,
  type,
  cheminActuel,
  nomActuel,
  dateValiditeActuelle,
  avecDate,
  onChange,
}: {
  appelOffresId: string;
  produitId: string;
  type: TypePieceProduit;
  cheminActuel: string | null;
  nomActuel: string | null;
  dateValiditeActuelle: string | null;
  avecDate: boolean;
  onChange: (chemin: string | null, nom: string | null, dateValidite: string | null) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.conformiteTechnique.piecesProduit");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [dateValidite, setDateValidite] = useState(dateValiditeActuelle ?? "");

  async function envoyer(fichier: File) {
    if (!MIME_TYPES_PIECE_PRODUIT.includes(fichier.type as (typeof MIME_TYPES_PIECE_PRODUIT)[number])) {
      toast.error(t("typeNonAccepte"));
      return;
    }

    setEnvoiEnCours(true);
    const demarrage = await demarrerTeleversementPieceProduit(
      produitId,
      type,
      fichier.name,
      fichier.type,
    );
    if ("erreur" in demarrage) {
      setEnvoiEnCours(false);
      toast.error(demarrage.erreur);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.storage
      .from("documents")
      .uploadToSignedUrl(demarrage.cheminStockage, demarrage.token, fichier, {
        contentType: fichier.type,
      });
    if (error) {
      setEnvoiEnCours(false);
      toast.error(t("echecEnvoi"));
      return;
    }

    const resultat = await finaliserTeleversementPieceProduit(
      appelOffresId,
      produitId,
      type,
      demarrage.cheminStockage,
      fichier.name,
      avecDate && dateValidite.trim().length > 0 ? dateValidite : null,
    );
    setEnvoiEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onChange(demarrage.cheminStockage, fichier.name, avecDate ? dateValidite || null : null);
    toast.success(t("toastEnvoyee"));
  }

  async function voir() {
    if (!cheminActuel) return;
    const resultat = await genererUrlTelechargementPieceProduit(cheminActuel);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  async function supprimer() {
    if (!cheminActuel) return;
    const resultat = await supprimerPieceProduit(appelOffresId, produitId, type, cheminActuel);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onChange(null, null, null);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="w-40 text-xs text-muted-foreground">{t(`type.${type}`)}</span>
      {nomActuel ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={voir}>
            {nomActuel}
          </Button>
          {avecDate && (
            <span className="text-xs text-muted-foreground">
              {dateValiditeActuelle
                ? t("validiteJusquau", {
                    date: new Date(dateValiditeActuelle).toLocaleDateString("fr-FR"),
                  })
                : t("validiteInconnue")}
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </>
      ) : (
        <>
          <Input
            type="file"
            accept={MIME_TYPES_PIECE_PRODUIT.join(",")}
            disabled={envoiEnCours}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) envoyer(fichier);
            }}
            className="w-56"
          />
          {avecDate && (
            <Input
              type="date"
              value={dateValidite}
              onChange={(e) => setDateValidite(e.target.value)}
              aria-label={t("champDateValidite")}
              className="w-36"
            />
          )}
          {envoiEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
        </>
      )}
    </div>
  );
}

export function ProduitSpecifications({
  appelOffresId,
  produit,
  specsInitiales,
  onSpecsChange,
  onProduitChange,
}: {
  appelOffresId: string;
  produit: Produit;
  specsInitiales: SpecificationProduit[];
  onSpecsChange: (specs: SpecificationProduit[]) => void;
  onProduitChange: (produit: Produit) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.conformiteTechnique");
  const [specs, setSpecs] = useState(specsInitiales);
  const [libelle, setLibelle] = useState("");
  const [valeur, setValeur] = useState("");
  const [unite, setUnite] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  async function ajouter() {
    if (libelle.trim().length === 0 || valeur.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await ajouterSpecificationProduit(appelOffresId, produit.id, {
      libelle,
      valeur,
      unite: unite.trim().length > 0 ? unite : null,
      sourceSection: null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = [...specs, resultat.specification];
    setSpecs(nouvelleListe);
    onSpecsChange(nouvelleListe);
    setLibelle("");
    setValeur("");
    setUnite("");
  }

  async function supprimer(specificationId: string) {
    const resultat = await supprimerSpecificationProduit(appelOffresId, specificationId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = specs.filter((s) => s.id !== specificationId);
    setSpecs(nouvelleListe);
    onSpecsChange(nouvelleListe);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t("caracteristiquesDe", { produit: `${produit.marque} ${produit.modele}` })}
      </p>

      {specs.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("aucuneCaracteristique")}</p>
      )}

      {specs.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {specs.map((spec) => (
            <li key={spec.id} className="flex items-center gap-2">
              <span className="flex-1">
                {spec.libelle} : {spec.valeur} {spec.unite ?? ""}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => supprimer(spec.id)}>
                {t("supprimer")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder={t("champCaracteristiqueLibelle")}
          className="w-48"
        />
        <Input
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          placeholder={t("champCaracteristiqueValeur")}
          className="w-28"
        />
        <Input
          value={unite}
          onChange={(e) => setUnite(e.target.value)}
          placeholder={t("champCaracteristiqueUnite")}
          className="w-20"
        />
        <Button type="button" variant="outline" size="sm" onClick={ajouter} disabled={ajoutEnCours}>
          {ajoutEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonAjouterCaracteristique")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-2">
        <PieceProduit
          appelOffresId={appelOffresId}
          produitId={produit.id}
          type="fiche_technique"
          cheminActuel={produit.fiche_technique_path}
          nomActuel={produit.fiche_technique_nom_original}
          dateValiditeActuelle={null}
          avecDate={false}
          onChange={(chemin, nom) =>
            onProduitChange({
              ...produit,
              fiche_technique_path: chemin,
              fiche_technique_nom_original: nom,
            })
          }
        />
        <PieceProduit
          appelOffresId={appelOffresId}
          produitId={produit.id}
          type="autorisation_fabricant"
          cheminActuel={produit.autorisation_fabricant_path}
          nomActuel={produit.autorisation_fabricant_nom_original}
          dateValiditeActuelle={produit.autorisation_valide_jusquau}
          avecDate
          onChange={(chemin, nom, date) =>
            onProduitChange({
              ...produit,
              autorisation_fabricant_path: chemin,
              autorisation_fabricant_nom_original: nom,
              autorisation_valide_jusquau: date,
            })
          }
        />
        <PieceProduit
          appelOffresId={appelOffresId}
          produitId={produit.id}
          type="certificat_etalonnage"
          cheminActuel={produit.certificat_etalonnage_path}
          nomActuel={produit.certificat_etalonnage_nom_original}
          dateValiditeActuelle={produit.certificat_etalonnage_valide_jusquau}
          avecDate
          onChange={(chemin, nom, date) =>
            onProduitChange({
              ...produit,
              certificat_etalonnage_path: chemin,
              certificat_etalonnage_nom_original: nom,
              certificat_etalonnage_valide_jusquau: date,
            })
          }
        />
      </div>
    </div>
  );
}
