"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  creerArticleDao,
  supprimerArticleDao,
  genererTableauSectionIII,
} from "@/lib/appels-offres/actions";
import type {
  ArticleDao,
  ArticleProduit,
  ConformiteForcee,
  LigneBpu,
  LigneSpecification,
  Produit,
  SpecificationProduit,
} from "@/lib/appels-offres/types";
import { ArticleConformite } from "./article-conformite";

// Sentinel pour l'option "Non rattaché au BPU" d'un <Select> Radix, qui
// interdit value="" — même patron que VALEUR_NON_RENSEIGNE dans
// appel-offres-detail.tsx.
const AUCUNE_LIGNE_BPU = "_aucune";

export function ConformiteTechnique({
  appelOffresId,
  articlesInitiaux,
  lignesParArticleInitial,
  articleProduitsParArticleInitial,
  produitsParIdInitial,
  specsProduitParProduitInitial,
  conformiteForceeInitiale,
  produitsEntreprise,
  lignesBpu,
}: {
  appelOffresId: string;
  articlesInitiaux: ArticleDao[];
  lignesParArticleInitial: Record<string, LigneSpecification[]>;
  articleProduitsParArticleInitial: Record<string, ArticleProduit[]>;
  produitsParIdInitial: Record<string, Produit>;
  specsProduitParProduitInitial: Record<string, SpecificationProduit[]>;
  conformiteForceeInitiale: Record<string, ConformiteForcee>;
  produitsEntreprise: Produit[];
  lignesBpu: LigneBpu[];
}) {
  const t = useTranslations("AppelsOffres.detail.conformiteTechnique");
  const [articles, setArticles] = useState(articlesInitiaux);
  const [lignesParArticle, setLignesParArticle] = useState(lignesParArticleInitial);
  const [articleProduitsParArticle, setArticleProduitsParArticle] = useState(
    articleProduitsParArticleInitial,
  );
  const [produitsParId, setProduitsParId] = useState(produitsParIdInitial);
  const [specsProduitParProduit, setSpecsProduitParProduit] = useState(
    specsProduitParProduitInitial,
  );
  const [conformiteForcee, setConformiteForcee] = useState(conformiteForceeInitiale);
  const [catalogueProduits, setCatalogueProduits] = useState(produitsEntreprise);

  const [numero, setNumero] = useState("");
  const [designation, setDesignation] = useState("");
  const [unite, setUnite] = useState("");
  const [quantite, setQuantite] = useState("");
  const [ligneBpuId, setLigneBpuId] = useState(AUCUNE_LIGNE_BPU);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [exportSectionIIIEnCours, setExportSectionIIIEnCours] = useState(false);

  async function exporterSectionIII() {
    setExportSectionIIIEnCours(true);
    const resultat = await genererTableauSectionIII(appelOffresId);
    setExportSectionIIIEnCours(false);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  function enregistrerNouveauProduit(produit: Produit) {
    setProduitsParId((carte) => ({ ...carte, [produit.id]: produit }));
    setSpecsProduitParProduit((carte) => ({ ...carte, [produit.id]: carte[produit.id] ?? [] }));
    setCatalogueProduits((liste) =>
      liste.some((p) => p.id === produit.id) ? liste : [...liste, produit],
    );
  }

  async function ajouterArticle() {
    if (designation.trim().length === 0 || unite.trim().length === 0 || quantite.trim().length === 0) {
      toast.error(t("champsRequis"));
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerArticleDao(appelOffresId, {
      numero: numero.trim().length > 0 ? numero : null,
      designation,
      unite,
      quantite,
      ligneBpuId: ligneBpuId === AUCUNE_LIGNE_BPU ? null : ligneBpuId,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setArticles((liste) => [...liste, resultat.article]);
    setLignesParArticle((carte) => ({ ...carte, [resultat.article.id]: [] }));
    setArticleProduitsParArticle((carte) => ({ ...carte, [resultat.article.id]: [] }));
    setNumero("");
    setDesignation("");
    setUnite("");
    setQuantite("");
    setLigneBpuId(AUCUNE_LIGNE_BPU);
    toast.success(t("toastArticleAjoute"));
  }

  async function supprimerArticle(articleId: string) {
    const resultat = await supprimerArticleDao(appelOffresId, articleId);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setArticles((liste) => liste.filter((a) => a.id !== articleId));
  }

  const articlesTries = articles.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("titre")}</h2>
          <p className="text-sm text-muted-foreground">{t("explication")}</p>
        </div>
        {articlesTries.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exporterSectionIII}
            disabled={exportSectionIIIEnCours}
          >
            {exportSectionIIIEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonGenererSectionIII")}
          </Button>
        )}
      </div>

      {articlesTries.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("aucunArticle")}</p>
      )}

      {articlesTries.map((article) => (
        <ArticleConformite
          key={article.id}
          appelOffresId={appelOffresId}
          article={article}
          lignesInitiales={lignesParArticle[article.id] ?? []}
          articleProduitsInitiaux={articleProduitsParArticle[article.id] ?? []}
          produitsParId={produitsParId}
          specsProduitParProduit={specsProduitParProduit}
          conformiteForcee={conformiteForcee}
          catalogueProduits={catalogueProduits}
          lignesBpu={lignesBpu}
          onArticleSupprime={() => supprimerArticle(article.id)}
          onArticleModifie={(articleModifie) =>
            setArticles((liste) => liste.map((a) => (a.id === articleModifie.id ? articleModifie : a)))
          }
          onLignesChange={(lignes) =>
            setLignesParArticle((carte) => ({ ...carte, [article.id]: lignes }))
          }
          onArticleProduitsChange={(articleProduits) =>
            setArticleProduitsParArticle((carte) => ({ ...carte, [article.id]: articleProduits }))
          }
          onProduitCree={enregistrerNouveauProduit}
          onSpecsProduitChange={(produitId, specs) =>
            setSpecsProduitParProduit((carte) => ({ ...carte, [produitId]: specs }))
          }
          onConformiteForceeChange={(cle, valeur) =>
            setConformiteForcee((carte) => {
              const copie = { ...carte };
              if (valeur === null) delete copie[cle];
              else copie[cle] = valeur;
              return copie;
            })
          }
          onProduitModifie={(produit) =>
            setProduitsParId((carte) => ({ ...carte, [produit.id]: produit }))
          }
        />
      ))}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouvel-article-numero" className="text-xs text-muted-foreground">
            {t("champNumero")}
          </Label>
          <Input
            id="nouvel-article-numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouvel-article-designation" className="text-xs text-muted-foreground">
            {t("champDesignation")}
          </Label>
          <Input
            id="nouvel-article-designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouvel-article-unite" className="text-xs text-muted-foreground">
            {t("champUnite")}
          </Label>
          <Input
            id="nouvel-article-unite"
            value={unite}
            onChange={(e) => setUnite(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouvel-article-quantite" className="text-xs text-muted-foreground">
            {t("champQuantite")}
          </Label>
          <Input
            id="nouvel-article-quantite"
            type="number"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouvel-article-ligne-bpu" className="text-xs text-muted-foreground">
            {t("champLigneBpu")}
          </Label>
          <Select value={ligneBpuId} onValueChange={setLigneBpuId}>
            <SelectTrigger id="nouvel-article-ligne-bpu" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUNE_LIGNE_BPU}>{t("optionAucuneLigneBpu")}</SelectItem>
              {lignesBpu.map((ligne) => (
                <SelectItem key={ligne.id} value={ligne.id}>
                  {ligne.designation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={ajouterArticle} disabled={ajoutEnCours}>
          {ajoutEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterArticle")}
        </Button>
      </div>
    </div>
  );
}
