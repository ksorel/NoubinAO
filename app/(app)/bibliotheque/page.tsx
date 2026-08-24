import { redirect } from "next/navigation";
import {
  obtenirUtilisateurCourant,
  listerDocuments,
} from "@/lib/documents/queries";
import { DocumentTable } from "./document-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function BibliothequePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const documents = await listerDocuments(utilisateur.entreprise_id);

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: "Bibliothèque" }]} />
      <h1 className="text-2xl font-bold">Bibliothèque documentaire</h1>
      <DocumentTable documents={documents} />
    </div>
  );
}
