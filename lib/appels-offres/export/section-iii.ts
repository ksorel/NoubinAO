import type {
  AppelOffres,
  ArticleDao,
  ArticleProduit,
  ConformiteForcee,
  LigneSpecification,
  Produit,
  SpecificationProduit,
} from "../types";
import type { Entreprise } from "@/lib/utilisateur/types";
import { comparerSpecLine } from "../conformite-technique";

// Tableau Section III (sprint S6, parcours expert v2, voir CLAUDE.md, Étape
// 5.2) : format du DAO ivoirien — N°, Équipement, Spécifications exigées,
// Spécifications proposées — une ligne par article, pas par SpecLine (les
// caractéristiques d'un même article sont listées ensemble dans la même
// cellule, comme dans le DAO).

export interface LigneSectionIII {
  numero: string | null;
  equipement: string;
  specsExigees: string[];
  specsProposees: string[];
  produitRetenuLabel: string | null;
}

export interface PlanSectionIII {
  titre: string;
  acheteur: string | null;
  lignes: LigneSectionIII[];
  representantLegalNom: string | null;
  representantLegalQualite: string | null;
  nomEntreprise: string;
}

function formaterLigneExigee(ligne: Pick<LigneSpecification, "libelle" | "operateur" | "valeur" | "unite">): string {
  return `${ligne.libelle} ${ligne.operateur} ${ligne.valeur}${ligne.unite ? ` ${ligne.unite}` : ""}`;
}

export function construirePlanSectionIII(
  appelOffres: Pick<AppelOffres, "titre" | "acheteur" | "fichier_dao_nom_original">,
  entreprise: Pick<Entreprise, "nom" | "representant_legal_nom" | "representant_legal_qualite">,
  articles: ArticleDao[],
  lignesParArticle: Record<string, LigneSpecification[]>,
  articleProduitsParArticle: Record<string, ArticleProduit[]>,
  produitsParId: Record<string, Produit>,
  specsProduitParProduit: Record<string, SpecificationProduit[]>,
  conformiteForceeParLigneProduit: Record<string, ConformiteForcee>,
): PlanSectionIII {
  const lignes: LigneSectionIII[] = articles.map((article) => {
    const lignesSpecification = lignesParArticle[article.id] ?? [];
    const produitRetenu = (articleProduitsParArticle[article.id] ?? []).find((ap) => ap.retenu);

    const specsProposees = lignesSpecification.map((ligne) => {
      if (!produitRetenu) return "—";
      const specsProduit = specsProduitParProduit[produitRetenu.produit_id] ?? [];
      const override = conformiteForceeParLigneProduit[`${ligne.id}:${produitRetenu.produit_id}`];
      const resultat = comparerSpecLine(ligne, specsProduit);
      const statut = override?.statut ?? resultat.statut;
      if (!resultat.specificationProduit) return `— (${statut})`;
      const valeur = `${resultat.specificationProduit.valeur}${
        resultat.specificationProduit.unite ? ` ${resultat.specificationProduit.unite}` : ""
      }`;
      return statut === "ok" ? valeur : `${valeur} (${statut})`;
    });

    const produit = produitRetenu ? produitsParId[produitRetenu.produit_id] : null;

    return {
      numero: article.numero,
      equipement: article.designation,
      specsExigees: lignesSpecification.map(formaterLigneExigee),
      specsProposees,
      produitRetenuLabel: produit ? `${produit.marque} ${produit.modele}` : null,
    };
  });

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original ?? "Appel d'offres sans titre",
    acheteur: appelOffres.acheteur,
    lignes,
    representantLegalNom: entreprise.representant_legal_nom,
    representantLegalQualite: entreprise.representant_legal_qualite,
    nomEntreprise: entreprise.nom,
  };
}
