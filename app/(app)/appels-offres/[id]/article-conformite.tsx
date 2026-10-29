"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierArticleDao,
  creerLigneSpecification,
  modifierLigneSpecification,
  supprimerLigneSpecification,
  creerProduit,
  comparerProduitArticle,
  retirerProduitArticle,
  basculerProduitRetenu,
  forcerConformiteLigne,
  retirerConformiteForcee,
} from "@/lib/appels-offres/actions";
import {
  comparerSpecLine,
  produitKoSurAuMoinsUneLigne,
} from "@/lib/appels-offres/conformite-technique";
import {
  OPERATEURS_SPECIFICATION,
  STATUTS_CONFORMITE,
  type ArticleDao,
  type ArticleProduit,
  type ConformiteForcee,
  type LigneBpu,
  type LigneSpecification,
  type Produit,
  type SpecificationProduit,
  type StatutConformite,
} from "@/lib/appels-offres/types";
import { ProduitSpecifications } from "./produit-specifications";

const AUCUNE_LIGNE_BPU = "_aucune";
const NOUVEAU_PRODUIT = "_nouveau";

const VARIANT_STATUT: Record<StatutConformite, "default" | "destructive" | "secondary"> = {
  ok: "default",
  ko: "destructive",
  inconnu: "secondary",
};

const COULEUR_STATUT: Record<StatutConformite, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25",
  ko: "",
  inconnu: "",
};

function CelluleConformite({
  ligne,
  specsProduit,
  override,
  onForcer,
  onRetirer,
}: {
  ligne: LigneSpecification;
  specsProduit: SpecificationProduit[];
  override: ConformiteForcee | undefined;
  onForcer: (statut: StatutConformite, justification: string | null) => Promise<void>;
  onRetirer: () => Promise<void>;
}) {
  const t = useTranslations("AppelsOffres.detail.conformiteTechnique");
  const resultat = comparerSpecLine(ligne, specsProduit);
  const statut = override?.statut ?? resultat.statut;
  const [statutChoisi, setStatutChoisi] = useState<StatutConformite>(statut);
  const [justification, setJustification] = useState(override?.justification ?? "");
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  // statutChoisi/justification ne doivent pas rester figés sur la valeur
  // du premier montage : le statut calculé peut changer entre-temps (fiche
  // produit modifiée dans un autre panneau) sans que ce composant
  // remonte. Resynchronisé à l'ouverture plutôt qu'à chaque rendu, pour ne
  // pas écraser une saisie en cours pendant que le popover est ouvert.
  function surChangementOuverture(ouverture: boolean) {
    if (ouverture) {
      setStatutChoisi(statut);
      setJustification(override?.justification ?? "");
    }
    setOuvert(ouverture);
  }

  async function enregistrer() {
    setEnCours(true);
    await onForcer(statutChoisi, justification.trim().length > 0 ? justification : null);
    setEnCours(false);
    setOuvert(false);
  }

  async function retirer() {
    setEnCours(true);
    await onRetirer();
    setEnCours(false);
    setOuvert(false);
  }

  return (
    <Popover open={ouvert} onOpenChange={surChangementOuverture}>
      <PopoverTrigger asChild>
        <button type="button" className="flex flex-col items-start gap-0.5 text-left">
          <Badge
            variant={VARIANT_STATUT[statut]}
            className={statut === "ok" ? COULEUR_STATUT.ok : undefined}
          >
            {t(`statut.${statut}`)}
            {override && <span className="ml-1">*</span>}
          </Badge>
          {resultat.specificationProduit && (
            <span className="text-xs text-muted-foreground">
              {resultat.specificationProduit.valeur} {resultat.specificationProduit.unite ?? ""}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("forcerConformite")}</p>
        <Select value={statutChoisi} onValueChange={(v) => setStatutChoisi(v as StatutConformite)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUTS_CONFORMITE.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`statut.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder={t("justificationPlaceholder")}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={enregistrer} disabled={enCours}>
            {enCours && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonEnregistrer")}
          </Button>
          {override && (
            <Button type="button" size="sm" variant="ghost" onClick={retirer} disabled={enCours}>
              {t("boutonRetablirCalcul")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ArticleConformite({
  appelOffresId,
  article,
  lignesInitiales,
  articleProduitsInitiaux,
  produitsParId,
  specsProduitParProduit,
  conformiteForcee,
  catalogueProduits,
  lignesBpu,
  onArticleSupprime,
  onArticleModifie,
  onLignesChange,
  onArticleProduitsChange,
  onProduitCree,
  onSpecsProduitChange,
  onConformiteForceeChange,
  onProduitModifie,
}: {
  appelOffresId: string;
  article: ArticleDao;
  lignesInitiales: LigneSpecification[];
  articleProduitsInitiaux: ArticleProduit[];
  produitsParId: Record<string, Produit>;
  specsProduitParProduit: Record<string, SpecificationProduit[]>;
  conformiteForcee: Record<string, ConformiteForcee>;
  catalogueProduits: Produit[];
  lignesBpu: LigneBpu[];
  onArticleSupprime: () => void;
  onArticleModifie: (article: ArticleDao) => void;
  onLignesChange: (lignes: LigneSpecification[]) => void;
  onArticleProduitsChange: (articleProduits: ArticleProduit[]) => void;
  onProduitCree: (produit: Produit) => void;
  onSpecsProduitChange: (produitId: string, specs: SpecificationProduit[]) => void;
  onConformiteForceeChange: (cle: string, valeur: ConformiteForcee | null) => void;
  onProduitModifie: (produit: Produit) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.conformiteTechnique");
  const [numero, setNumero] = useState(article.numero ?? "");
  const [designation, setDesignation] = useState(article.designation);
  const [unite, setUnite] = useState(article.unite);
  const [quantite, setQuantite] = useState(String(article.quantite));
  const [ligneBpuId, setLigneBpuId] = useState(article.ligne_bpu_id ?? AUCUNE_LIGNE_BPU);

  const [lignes, setLignes] = useState(lignesInitiales);
  const [libelle, setLibelle] = useState("");
  const [operateur, setOperateur] = useState<(typeof OPERATEURS_SPECIFICATION)[number]>(">=");
  const [valeur, setValeur] = useState("");
  const [uniteLigne, setUniteLigne] = useState("");
  const [ajoutLigneEnCours, setAjoutLigneEnCours] = useState(false);

  const [articleProduits, setArticleProduits] = useState(articleProduitsInitiaux);
  const [produitChoisi, setProduitChoisi] = useState(NOUVEAU_PRODUIT);
  const [nouvelleMarque, setNouvelleMarque] = useState("");
  const [nouveauModele, setNouveauModele] = useState("");
  const [nouvelleReference, setNouvelleReference] = useState("");
  const [ajoutProduitEnCours, setAjoutProduitEnCours] = useState(false);
  const [produitsDeplies, setProduitsDeplies] = useState<Record<string, boolean>>({});
  const [justificationsEnEdition, setJustificationsEnEdition] = useState<Record<string, string>>(
    {},
  );

  async function enregistrerArticle() {
    const resultat = await modifierArticleDao(appelOffresId, article.id, {
      numero: numero.trim().length > 0 ? numero : null,
      designation,
      unite,
      quantite,
      ligneBpuId: ligneBpuId === AUCUNE_LIGNE_BPU ? null : ligneBpuId,
    });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onArticleModifie({
      ...article,
      numero: numero.trim().length > 0 ? numero : null,
      designation,
      unite,
      quantite: Number(quantite),
      ligne_bpu_id: ligneBpuId === AUCUNE_LIGNE_BPU ? null : ligneBpuId,
    });
  }

  async function ajouterLigne() {
    if (libelle.trim().length === 0 || valeur.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }
    setAjoutLigneEnCours(true);
    const resultat = await creerLigneSpecification(appelOffresId, article.id, {
      libelle,
      operateur,
      valeur,
      unite: uniteLigne.trim().length > 0 ? uniteLigne : null,
      sourceSection: null,
    });
    setAjoutLigneEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = [...lignes, resultat.ligne];
    setLignes(nouvelleListe);
    onLignesChange(nouvelleListe);
    setLibelle("");
    setValeur("");
    setUniteLigne("");
  }

  async function modifierLigne(ligne: LigneSpecification, champs: Partial<LigneSpecification>) {
    const ligneModifiee = { ...ligne, ...champs };
    const resultat = await modifierLigneSpecification(appelOffresId, ligne.id, {
      libelle: ligneModifiee.libelle,
      operateur: ligneModifiee.operateur,
      valeur: ligneModifiee.valeur,
      unite: ligneModifiee.unite,
      sourceSection: ligneModifiee.source_section,
    });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = lignes.map((l) => (l.id === ligne.id ? ligneModifiee : l));
    setLignes(nouvelleListe);
    onLignesChange(nouvelleListe);
  }

  async function supprimerLigne(ligneId: string) {
    const resultat = await supprimerLigneSpecification(appelOffresId, ligneId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = lignes.filter((l) => l.id !== ligneId);
    setLignes(nouvelleListe);
    onLignesChange(nouvelleListe);
  }

  async function ajouterProduitComparaison() {
    setAjoutProduitEnCours(true);

    let produitId = produitChoisi;
    if (produitChoisi === NOUVEAU_PRODUIT) {
      if (nouvelleMarque.trim().length === 0 || nouveauModele.trim().length === 0) {
        setAjoutProduitEnCours(false);
        toast.error(t("champsRequis"));
        return;
      }
      const resultatProduit = await creerProduit(appelOffresId, {
        marque: nouvelleMarque,
        modele: nouveauModele,
        reference: nouvelleReference.trim().length > 0 ? nouvelleReference : null,
      });
      if ("erreur" in resultatProduit) {
        setAjoutProduitEnCours(false);
        toast.error(resultatProduit.erreur);
        return;
      }
      onProduitCree(resultatProduit.produit);
      produitId = resultatProduit.produit.id;
    }

    const resultat = await comparerProduitArticle(appelOffresId, article.id, produitId);
    setAjoutProduitEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = [...articleProduits, resultat.articleProduit];
    setArticleProduits(nouvelleListe);
    onArticleProduitsChange(nouvelleListe);
    setProduitChoisi(NOUVEAU_PRODUIT);
    setNouvelleMarque("");
    setNouveauModele("");
    setNouvelleReference("");
  }

  async function retirerProduit(articleProduitId: string) {
    const resultat = await retirerProduitArticle(appelOffresId, articleProduitId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = articleProduits.filter((ap) => ap.id !== articleProduitId);
    setArticleProduits(nouvelleListe);
    onArticleProduitsChange(nouvelleListe);
  }

  async function basculerRetenu(ap: ArticleProduit, retenu: boolean) {
    const justification = justificationsEnEdition[ap.id] ?? ap.justification_ko ?? null;
    const resultat = await basculerProduitRetenu(
      appelOffresId,
      article.id,
      ap.id,
      ap.produit_id,
      retenu,
      justification,
    );
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    const nouvelleListe = articleProduits.map((item) =>
      item.id === ap.id
        ? { ...item, retenu, justification_ko: retenu ? justification : null }
        : item,
    );
    setArticleProduits(nouvelleListe);
    onArticleProduitsChange(nouvelleListe);
  }

  const produitsCatalogueDisponibles = catalogueProduits.filter(
    (p) => !articleProduits.some((ap) => ap.produit_id === p.id),
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champNumero")}</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} onBlur={enregistrerArticle} className="w-20" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champDesignation")}</Label>
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            onBlur={enregistrerArticle}
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champUnite")}</Label>
          <Input value={unite} onChange={(e) => setUnite(e.target.value)} onBlur={enregistrerArticle} className="w-20" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champQuantite")}</Label>
          <Input
            type="number"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            onBlur={enregistrerArticle}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("champLigneBpu")}</Label>
          <Select
            value={ligneBpuId}
            onValueChange={(v) => {
              setLigneBpuId(v);
              enregistrerArticle();
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUNE_LIGNE_BPU}>{t("optionAucuneLigneBpu")}</SelectItem>
              {lignesBpu.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.designation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onArticleSupprime} className="ml-auto">
          {t("supprimerArticle")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("titreLignesSpecification")}</p>
        {lignes.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("aucuneLigneSpecification")}</p>
        )}
        {lignes.map((ligne) => (
          <div key={ligne.id} className="flex flex-wrap items-center gap-2">
            <Input
              defaultValue={ligne.libelle}
              onBlur={(e) => modifierLigne(ligne, { libelle: e.target.value })}
              className="w-44"
            />
            <Select
              defaultValue={ligne.operateur}
              onValueChange={(v) =>
                modifierLigne(ligne, { operateur: v as (typeof OPERATEURS_SPECIFICATION)[number] })
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATEURS_SPECIFICATION.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              defaultValue={ligne.valeur}
              onBlur={(e) => modifierLigne(ligne, { valeur: e.target.value })}
              className="w-24"
            />
            <Input
              defaultValue={ligne.unite ?? ""}
              onBlur={(e) => modifierLigne(ligne, { unite: e.target.value || null })}
              placeholder={t("champCaracteristiqueUnite")}
              className="w-20"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => supprimerLigne(ligne.id)}>
              {t("supprimer")}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={t("champCaracteristiqueLibelle")}
            className="w-44"
          />
          <Select value={operateur} onValueChange={(v) => setOperateur(v as typeof operateur)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATEURS_SPECIFICATION.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            placeholder={t("champCaracteristiqueValeur")}
            className="w-24"
          />
          <Input
            value={uniteLigne}
            onChange={(e) => setUniteLigne(e.target.value)}
            placeholder={t("champCaracteristiqueUnite")}
            className="w-20"
          />
          <Button type="button" variant="outline" size="sm" onClick={ajouterLigne} disabled={ajoutLigneEnCours}>
            {ajoutLigneEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonAjouterLigne")}
          </Button>
        </div>
      </div>

      {lignes.length > 0 && articleProduits.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colonneCaracteristiqueExigee")}</TableHead>
                {articleProduits.map((ap) => {
                  const produit = produitsParId[ap.produit_id];
                  return (
                    <TableHead key={ap.id}>
                      {produit ? `${produit.marque} ${produit.modele}` : "-"}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((ligne) => (
                <TableRow key={ligne.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {ligne.libelle} {ligne.operateur} {ligne.valeur} {ligne.unite ?? ""}
                  </TableCell>
                  {articleProduits.map((ap) => (
                    <TableCell key={ap.id}>
                      <CelluleConformite
                        ligne={ligne}
                        specsProduit={specsProduitParProduit[ap.produit_id] ?? []}
                        override={conformiteForcee[`${ligne.id}:${ap.produit_id}`]}
                        onForcer={async (statut, justification) => {
                          const resultat = await forcerConformiteLigne(
                            appelOffresId,
                            ligne.id,
                            ap.produit_id,
                            { statut, justification },
                          );
                          if ("erreur" in resultat) {
                            toast.error(resultat.erreur);
                            return;
                          }
                          onConformiteForceeChange(
                            `${ligne.id}:${ap.produit_id}`,
                            resultat.conformite,
                          );
                        }}
                        onRetirer={async () => {
                          const resultat = await retirerConformiteForcee(
                            appelOffresId,
                            ligne.id,
                            ap.produit_id,
                          );
                          if ("erreur" in resultat) {
                            toast.error(resultat.erreur);
                            return;
                          }
                          onConformiteForceeChange(`${ligne.id}:${ap.produit_id}`, null);
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {articleProduits.map((ap) => {
          const produit = produitsParId[ap.produit_id];
          if (!produit) return null;
          const estKo = produitKoSurAuMoinsUneLigne(
            lignes,
            specsProduitParProduit[ap.produit_id] ?? [],
            Object.fromEntries(
              lignes
                .map((l) => {
                  const o = conformiteForcee[`${l.id}:${ap.produit_id}`];
                  return o ? ([l.id, o.statut] as const) : null;
                })
                .filter((v): v is readonly [string, StatutConformite] => v !== null),
            ),
          );
          return (
            <div key={ap.id} className="flex flex-col gap-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  id={`retenu-${ap.id}`}
                  checked={ap.retenu}
                  onCheckedChange={(v) => basculerRetenu(ap, v === true)}
                />
                <Label htmlFor={`retenu-${ap.id}`} className="font-normal">
                  {t("retenirPourCetArticle", { produit: `${produit.marque} ${produit.modele}` })}
                </Label>
                {estKo && (
                  <Badge variant="destructive">{t("produitNonConforme")}</Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setProduitsDeplies((m) => ({ ...m, [ap.produit_id]: !m[ap.produit_id] }))
                  }
                >
                  {t("gererCaracteristiques")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => retirerProduit(ap.id)}>
                  {t("retirerProduit")}
                </Button>
              </div>

              {estKo && (
                <Textarea
                  value={justificationsEnEdition[ap.id] ?? ap.justification_ko ?? ""}
                  onChange={(e) =>
                    setJustificationsEnEdition((m) => ({ ...m, [ap.id]: e.target.value }))
                  }
                  onBlur={() => ap.retenu && basculerRetenu(ap, true)}
                  placeholder={t("justificationKoPlaceholder")}
                  className="text-sm"
                />
              )}

              {produitsDeplies[ap.produit_id] && (
                <ProduitSpecifications
                  appelOffresId={appelOffresId}
                  produit={produit}
                  specsInitiales={specsProduitParProduit[ap.produit_id] ?? []}
                  onSpecsChange={(specs) => onSpecsProduitChange(ap.produit_id, specs)}
                  onProduitChange={onProduitModifie}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <Select value={produitChoisi} onValueChange={setProduitChoisi}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOUVEAU_PRODUIT}>{t("optionNouveauProduit")}</SelectItem>
            {produitsCatalogueDisponibles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.marque} {p.modele} {p.reference ?? ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {produitChoisi === NOUVEAU_PRODUIT && (
          <>
            <Input
              value={nouvelleMarque}
              onChange={(e) => setNouvelleMarque(e.target.value)}
              placeholder={t("champMarque")}
              className="w-32"
            />
            <Input
              value={nouveauModele}
              onChange={(e) => setNouveauModele(e.target.value)}
              placeholder={t("champModele")}
              className="w-32"
            />
            <Input
              value={nouvelleReference}
              onChange={(e) => setNouvelleReference(e.target.value)}
              placeholder={t("champReference")}
              className="w-32"
            />
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={ajouterProduitComparaison}
          disabled={ajoutProduitEnCours}
        >
          {ajoutProduitEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("boutonComparerProduit")}
        </Button>
      </div>
    </div>
  );
}
