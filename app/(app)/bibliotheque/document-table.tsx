"use client";

import { useMemo, useState, useTransition } from "react";
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

const ONGLETS: { valeur: TypeDocument | "tous"; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "piece_administrative", libelle: "Pièces administratives" },
  { valeur: "reference_projet", libelle: "Références projets" },
  { valeur: "cv", libelle: "CV" },
  { valeur: "agrement", libelle: "Agréments" },
];

export function DocumentTable({ documents }: { documents: Document[] }) {
  const [onglet, setOnglet] = useState<TypeDocument | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [aSupprimer, setASupprimer] = useState<Document | null>(null);
  const [isPending, startTransition] = useTransition();

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
        toast.success("Document supprimé");
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
            {ONGLETS.map((o) => (
              <TabsTrigger key={o.valeur} value={o.valeur}>
                {o.libelle}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full sm:w-64"
          />
          <AjouterDocumentDialog />
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>Aucun document pour l&apos;instant.</p>
          <AjouterDocumentDialog libelle="Ajouter votre premier document" />
        </div>
      ) : documentsFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Aucun document ne correspond à ce filtre.
        </p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentsFiltres.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>{doc.nom}</TableCell>
                <TableCell>
                  {ONGLETS.find((o) => o.valeur === doc.type)?.libelle}
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
                    Télécharger
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setASupprimer(doc)}
                  >
                    Supprimer
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
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le fichier sera définitivement
              supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerSuppression}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
