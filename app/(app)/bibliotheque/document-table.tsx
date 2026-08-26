"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
} from "@/lib/documents/actions";
import type { Document, TypeDocument } from "@/lib/documents/types";

export function DocumentTable({ documents }: { documents: Document[] }) {
  const t = useTranslations("Bibliotheque");
  const [onglet, setOnglet] = useState<TypeDocument | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [aSupprimer, setASupprimer] = useState<Document | null>(null);
  const [isPending, startTransition] = useTransition();

  const onglets: { valeur: TypeDocument | "tous"; libelle: string }[] = [
    { valeur: "tous", libelle: t("tabs.tous") },
    { valeur: "piece_administrative", libelle: t("tabs.pieceAdministrative") },
    { valeur: "reference_projet", libelle: t("tabs.referenceProjet") },
    { valeur: "cv", libelle: t("tabs.cv") },
    { valeur: "agrement", libelle: t("tabs.agrement") },
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
    const resultat = await genererUrlTelechargement(doc.fichier_path);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
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
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Tabs
          value={onglet}
          onValueChange={(v) => setOnglet(v as TypeDocument | "tous")}
        >
          <TabsList>
            {onglets.map((o) => (
              <TabsTrigger key={o.valeur} value={o.valeur}>
                {o.libelle}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input
            placeholder={t("table.rechercherPlaceholder")}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full sm:w-64"
          />
          <AjouterDocumentDialog libelle={t("dialog.titreBouton")} />
        </div>
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
                <TableCell>{doc.nom}</TableCell>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => telecharger(doc)}
                  >
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
              {t("table.supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
