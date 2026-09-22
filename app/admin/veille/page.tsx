import { redirect } from "next/navigation";
import { obtenirUtilisateurEstSuperAdmin, listerBompNumeros } from "@/lib/veille/queries";
import { UploadBompForm } from "./upload-bomp-form";

export const instant = false;

export default async function AdminVeillePage() {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) redirect("/bibliotheque");

  const bompNumeros = await listerBompNumeros();

  return (
    <div className="min-h-screen p-8 flex flex-col gap-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Veille — Administration</h1>
      <UploadBompForm />
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Éditions déjà traitées</h2>
        {bompNumeros.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune édition pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Numéro</th>
                <th className="py-2">Date</th>
                <th className="py-2">Statut</th>
                <th className="py-2">Avis extraits</th>
              </tr>
            </thead>
            <tbody>
              {bompNumeros.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="py-2">{b.numero}</td>
                  <td className="py-2">
                    {new Date(b.date_publication).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-2">{b.statut}</td>
                  <td className="py-2">{b.nombre_avis_extraits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
