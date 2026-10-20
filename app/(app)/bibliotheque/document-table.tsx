"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ExpirationBadge } from "./expiration-badge";
import { AjouterDocumentDialog } from "./ajouter-document-dialog";
import {
  supprimerDocument,
  genererUrlTelechargement,
  modifierNomDocument,
} from "@/lib/documents/actions";
import type { Document, TypeDocument } from "@/lib/documents/types";

export function DocumentTable({ documents }: { documents: Document[] }) {
  const t = useTranslations("Bibliotheque");
  const [onglet, setOnglet] = useState<TypeDocument | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [aSupprimer, setASupprimer] = useState<Document | null>(null);
  const [telechargementId, setTelechargementId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Un seul document renommable à la fois (id de la ligne en édition) : pas
  // besoin d'un état par ligne, la table entière n'autorise qu'une édition
  // active — cohérent avec le reste de l'écran (un seul dialogue d'ajout
  // ouvert à la fois).
  const [renommageId, setRenommageId] = useState<string | null>(null);
  const [nomBrouillon, setNomBrouillon] = useState("");
  const [renommageEnvoi, setRenommageEnvoi] = useState(false);

  const onglets: { valeur: TypeDocument | "tous"; libelle: string }[] = [
    { valeur: "tous", libelle: t("tabs.tous") },
    { valeur: "piece_administrative", libelle: t("tabs.pieceAdministrative") },
    { valeur: "reference_projet", libelle: t("tabs.referenceProjet") },
    { valeur: "cv", libelle: t("tabs.cv") },
    { valeur: "agrement", libelle: t("tabs.agrement") },
    { valeur: "abe", libelle: t("tabs.abe") },
    { valeur: "organigramme", libelle: t("tabs.organigramme") },
    { valeur: "materiel", libelle: t("tabs.materiel") },
    { valeur: "diplome", libelle: t("tabs.diplome") },
    { valeur: "piece_identite", libelle: t("tabs.pieceIdentite") },
  ];

  const documentsFiltres = useMemo(() => {
    return documents.filter((doc) => {
      const correspondOnglet = onglet === "tous" || doc.type === onglet;
      const correspondRecherche = doc.nom
        .toLowerCase()
        .includes(recherche.toLowerCase());
      return correspondOnglet && correspondRecherche;
    });
  }, [documents, onglet, recherche]);

  async function telecharger(doc: Document) {
    setTelechargementId(doc.id);
    const resultat = await genererUrlTelechargement(doc.fichier_path);
    setTelechargementId(null);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  function demarrerRenommage(doc: Document) {
    setRenommageId(doc.id);
    setNomBrouillon(doc.nom);
  }

  function annulerRenommage() {
    setRenommageId(null);
    setNomBrouillon("");
  }

  async function confirmerRenommage(documentId: string) {
    if (nomBrouillon.trim().length === 0) return;
    setRenommageEnvoi(true);
    const resultat = await modifierNomDocument(documentId, nomBrouillon);
    setRenommageEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("table.toastRenomme"));
    setRenommageId(null);
    setNomBrouillon("");
  }

  function confirmerSuppression() {
    if (!aSupprimer) return;
    const cible = aSupprimer;
    startTransition(async () => {
      const resultat = await supprimerDocument(cible.id, cible.fichier_path);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("table.toastSupprime"));
      }
      setASupprimer(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={onglet}
        onValueChange={(v) => setOnglet(v as TypeDocument | "tous")}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {onglets.map((o) => (
            <TabsTrigger key={o.valeur} value={o.valeur}>
              {o.libelle}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Input
          placeholder={t("table.rechercherPlaceholder")}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full sm:w-64"
        />
        <AjouterDocumentDialog libelle={t("dialog.titreBouton")} />
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>{t("table.aucunDocument")}</p>
          <AjouterDocumentDialog libelle={t("table.ajouterPremier")} />
        </div>
      ) : documentsFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          {t("table.aucunResultat")}
        </p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneNom")}</TableHead>
              <TableHead>{t("table.colonneType")}</TableHead>
              <TableHead>{t("table.colonneExpiration")}</TableHead>
              <TableHead>{t("table.colonneAjouteLe")}</TableHead>
              <TableHead className="text-right">{t("table.colonneActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentsFiltres.map((doc) => (
              <TableRow key={doc.id}>
                {/* whitespace-normal : le composant Table de base force
                    whitespace-nowrap sur chaque cellule, ce qui étirait la
                    ligne à la largeur du nom le plus long au lieu de le
                    faire revenir à la ligne (même correctif que
                    veille-table.tsx). */}
                <TableCell className="whitespace-normal max-w-xs">
                  {renommageId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={nomBrouillon}
                        onChange={(e) => setNomBrouillon(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmerRenommage(doc.id);
                          if (e.key === "Escape") annulerRenommage();
                        }}
                        className="h-8"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={renommageEnvoi}
                        onClick={() => confirmerRenommage(doc.id)}
                      >
                        {renommageEnvoi && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("table.boutonEnregistrerNom")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={annulerRenommage}>
                        {t("table.annuler")}
                      </Button>
                    </div>
                  ) : (
                    doc.nom
                  )}
                </TableCell>
                <TableCell>
                  {onglets.find((o) => o.valeur === doc.type)?.libelle}
                </TableCell>
                <TableCell>
                  <ExpirationBadge dateExpiration={doc.date_expiration} />
                </TableCell>
                <TableCell>
                  {new Date(doc.created_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {renommageId !== doc.id && (
                    <Button variant="outline" size="sm" onClick={() => demarrerRenommage(doc)}>
                      {t("table.renommer")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={telechargementId === doc.id}
                    onClick={() => telecharger(doc)}
                  >
                    {telechargementId === doc.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("table.telecharger")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setASupprimer(doc)}
                  >
                    {t("table.supprimer")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={!!aSupprimer}
        onOpenChange={(open) => !open && setASupprimer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.confirmerSuppressionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("table.confirmerSuppressionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("table.annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerSuppression}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("table.supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
