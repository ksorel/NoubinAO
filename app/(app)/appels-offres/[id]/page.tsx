import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  obtenirUtilisateurCourant,
  obtenirTauxFraisStructureDefaut,
  obtenirNomEntreprise,
  obtenirParametresGoNoGo,
  obtenirRegimeFiscal,
  obtenirEntreprise,
} from "@/lib/utilisateur/queries";
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirOuCreerGoNoGo,
  listerTypesMarcheGoNoGo,
  listerQuestionsGoNoGo,
  listerReponsesGoNoGo,
  obtenirSyntheseGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
  listerGroupement,
  listerCvTransformes,
  listerToursNegociation,
  obtenirConformiteTechnique,
  listerProduitsEntreprise,
  obtenirReferencesAppelOffres,
  listerReferencesEntreprise,
  obtenirOuCreerPvOuverture,
  listerConcurrentsPvOuverture,
} from "@/lib/appels-offres/queries";
import { calculerChecklistAutomatique } from "@/lib/appels-offres/checklist";
import { listerDocuments } from "@/lib/documents/queries";
import { listerEmailsLies, obtenirSuggestionsEmail } from "@/lib/email/queries";
import {
  suggererReponseAgrement,
  suggererReponseAttestations,
} from "@/lib/appels-offres/go-no-go-suggestions";
import { AppelOffresDetail } from "./appel-offres-detail";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function AppelOffresDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
  if (!resultat) notFound();

  const [
    bibliotheque,
    emailsLies,
    suggestions,
    checklistManuelle,
    goNoGo,
    syntheseGoNoGo,
    jalons,
    bpu,
    tauxFraisStructureDefaut,
    groupement,
    nomEntreprise,
    cvTransformeParDocument,
    typesMarcheGoNoGo,
    questionsGoNoGo,
    parametresGoNoGo,
    regimeFiscal,
    toursNegociation,
    conformiteTechnique,
    produitsEntreprise,
    referencesAppelOffres,
    catalogueReferences,
    entreprise,
    pvOuverture,
  ] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
    listerChecklistManuelle(resultat.dossierReponse.id),
    obtenirOuCreerGoNoGo(id, resultat.appelOffres.montant_caution),
    obtenirSyntheseGoNoGo(id),
    listerJalonsRetroplanning(id),
    listerBpu(id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
    listerGroupement(id),
    obtenirNomEntreprise(utilisateur.entreprise_id),
    listerCvTransformes(id),
    listerTypesMarcheGoNoGo(utilisateur.entreprise_id),
    listerQuestionsGoNoGo(utilisateur.entreprise_id),
    obtenirParametresGoNoGo(utilisateur.entreprise_id),
    obtenirRegimeFiscal(utilisateur.entreprise_id),
    listerToursNegociation(id),
    obtenirConformiteTechnique(id),
    listerProduitsEntreprise(utilisateur.entreprise_id),
    obtenirReferencesAppelOffres(id),
    listerReferencesEntreprise(utilisateur.entreprise_id),
    obtenirEntreprise(utilisateur.entreprise_id),
    obtenirOuCreerPvOuverture(id),
  ]);

  const reponsesGoNoGo = await listerReponsesGoNoGo(goNoGo.id);
  const concurrentsPvOuverture = await listerConcurrentsPvOuverture(pvOuverture.id);

  const checklistAutomatique = calculerChecklistAutomatique(
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    resultat.documentsParSection,
  );

  const tPage = await getTranslations("AppelsOffres.page");
  const titre =
    resultat.appelOffres.titre ??
    resultat.appelOffres.fichier_dao_nom_original ??
    "Appel d'offres sans titre";

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane
        items={[
          { label: tPage("filAriane"), href: "/appels-offres" },
          { label: titre },
        ]}
      />
      <h1 className="text-2xl font-bold">{titre}</h1>
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={emailsLies}
        suggestions={suggestions}
        dossierReponseId={resultat.dossierReponse.id}
        pointsFlous={resultat.pointsFlous}
        checklistAutomatique={checklistAutomatique}
        checklistManuelle={checklistManuelle}
        goNoGo={goNoGo}
        typesMarcheGoNoGo={typesMarcheGoNoGo}
        questionsGoNoGo={questionsGoNoGo}
        reponsesGoNoGo={reponsesGoNoGo}
        parametresGoNoGo={parametresGoNoGo}
        suggestionAgrement={suggererReponseAgrement(bibliotheque)}
        suggestionAttestations={suggererReponseAttestations(bibliotheque)}
        syntheseGoNoGo={syntheseGoNoGo}
        jalons={jalons}
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
        bpu={bpu}
        tauxFraisStructureDefaut={tauxFraisStructureDefaut}
        regimeFiscal={regimeFiscal}
        groupement={groupement}
        nomEntreprise={nomEntreprise}
        cvTransformeParDocument={cvTransformeParDocument}
        fichiersSupplementaires={resultat.fichiersSupplementaires}
        toursNegociation={toursNegociation}
        conformiteTechnique={conformiteTechnique}
        produitsEntreprise={produitsEntreprise}
        referencesAppelOffres={referencesAppelOffres}
        catalogueReferences={catalogueReferences}
        entrepriseContact={{
          telephone: entreprise?.telephone ?? null,
          email: entreprise?.email ?? null,
          adresse: entreprise?.adresse ?? null,
        }}
        pvOuverture={pvOuverture}
        concurrentsPvOuverture={concurrentsPvOuverture}
      />
    </div>
  );
}
