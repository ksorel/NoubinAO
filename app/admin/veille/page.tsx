import { redirect } from "next/navigation";
import { obtenirUtilisateurEstSuperAdmin, listerVeilleExecutions } from "@/lib/veille/queries";

export const instant = false;

export default async function AdminVeillePage() {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) redirect("/bibliotheque");

  const executions = await listerVeilleExecutions();

  return (
    <div className="min-h-screen p-8 flex flex-col gap-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Veille — Administration</h1>
      <p className="text-sm text-muted-foreground">
        Synchronisation quotidienne automatique depuis marchespublics.ci — rien à déposer manuellement.
      </p>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Historique des exécutions</h2>
        {executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune exécution pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Statut</th>
                <th className="py-2">AO trouvés</th>
                <th className="py-2">Nouveaux AO</th>
                <th className="py-2">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">
                    {new Date(e.execute_le).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2">{e.statut}</td>
                  <td className="py-2">{e.nombre_ao_trouves ?? "—"}</td>
                  <td className="py-2">{e.nombre_nouveaux_ao ?? "—"}</td>
                  <td className="py-2">{e.erreur_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
