import { redirect } from "next/navigation";
import { obtenirUtilisateurEstSuperAdmin, listerBompNumeros } from "@/lib/veille/queries";
import { UploadBompForm } from "./upload-bomp-form";

export const instant = false;

// Au-delà de ce délai sans écriture de statut, un découpage encore affiché
// "extraction_en_cours" est très probablement mort : la fonction serverless
// a été tuée par le plafond de 60 s de Vercel, donc le bloc catch de
// traiterDecoupageBomp n'a jamais tourné et aucune erreur n'a été
// enregistrée. Un découpage sain (téléchargement + parse + insertion) tient
// largement en dessous. On n'infère rien de plus : on rend l'état visible.
const SEUIL_BLOCAGE_MS = 5 * 60 * 1000;

function libelleStatut(statut: string, misAJourLe: string): string {
  if (statut !== "extraction_en_cours") return statut;

  const ecoule = Date.now() - new Date(misAJourLe).getTime();
  if (ecoule < SEUIL_BLOCAGE_MS) return statut;

  const minutes = Math.floor(ecoule / 60000);
  return minutes < 60
    ? `bloqué depuis ${minutes} min`
    : `bloqué depuis ${Math.floor(minutes / 60)} h`;
}

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
                    {/* date_publication est une date seule (YYYY-MM-DD) :
                        sans timeZone UTC, Date la parse à minuit UTC puis
                        l'affiche en heure locale, soit un jour trop tôt sur
                        tout décalage négatif. Même correctif que
                        retroplanning.tsx. */}
                    {new Date(b.date_publication).toLocaleDateString("fr-FR", {
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="py-2">{libelleStatut(b.statut, b.mis_a_jour_le)}</td>
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
