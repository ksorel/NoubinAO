"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { mettreAJourGoNoGo, mettreAJourReponseGoNoGo } from "@/lib/appels-offres/actions";
import {
  calculerSectionB,
  noteMargeAuto,
  noteTresorerieAuto,
  calculerNoteTotale,
  calculerDecision,
} from "@/lib/appels-offres/go-no-go";
import {
  REPONSES_GO_NO_GO,
  type GoNoGo as GoNoGoFiche,
  type TypeMarcheGoNoGo,
  type QuestionGoNoGo,
  type ReponseGoNoGo,
  type ReponseGoNoGoValeur,
} from "@/lib/appels-offres/types";
import type { SuggestionAdministrative } from "@/lib/appels-offres/go-no-go-suggestions";

const VARIANT_DECISION = {
  go: "default",
  no_go: "destructive",
  a_completer: "outline",
} as const;

function champNumerique(valeur: number | null): string {
  return valeur === null ? "" : String(valeur);
}

export function GoNoGo({
  appelOffresId,
  achatDaoEffectue,
  goNoGo,
  typesMarche,
  questions,
  reponses,
  parametres,
  suggestionAgrement,
  suggestionAttestations,
}: {
  appelOffresId: string;
  achatDaoEffectue: boolean;
  goNoGo: GoNoGoFiche;
  typesMarche: TypeMarcheGoNoGo[];
  questions: QuestionGoNoGo[];
  reponses: ReponseGoNoGo[];
  parametres: { noteMinGo: number; margeMinVisee: number };
  suggestionAgrement: SuggestionAdministrative;
  suggestionAttestations: SuggestionAdministrative;
}) {
  const t = useTranslations("AppelsOffres.detail.goNoGo");
  const [typeMarcheId, setTypeMarcheId] = useState<string | null>(goNoGo.type_marche_id);
  const [montants, setMontants] = useState({
    montantMarcheEstime: champNumerique(goNoGo.montant_marche_estime),
    coutTotalRealisation: champNumerique(goNoGo.cout_total_realisation),
    prixDao: champNumerique(goNoGo.prix_dao),
    cautionSoumission: champNumerique(goNoGo.caution_soumission),
    fraisPreparation: champNumerique(goNoGo.frais_preparation),
    avancePourcentage: goNoGo.avance_pourcentage === null ? "" : String(goNoGo.avance_pourcentage * 100),
    delaiPaiementJours: champNumerique(goNoGo.delai_paiement_jours),
    argentDisponibleBanque: champNumerique(goNoGo.argent_disponible_banque),
  });
  const [notesManuelles, setNotesManuelles] = useState({
    noteInteretStrategique: champNumerique(goNoGo.note_interet_strategique),
    noteClientPaie: champNumerique(goNoGo.note_client_paie),
    noteConcurrence: champNumerique(goNoGo.note_concurrence),
    noteRisques: champNumerique(goNoGo.note_risques),
  });
  const [commentaireGlobal, setCommentaireGlobal] = useState(goNoGo.commentaire_global ?? "");
  const [reponsesLocales, setReponsesLocales] = useState<Map<string, { reponse: ReponseGoNoGoValeur; commentaire: string }>>(
    new Map(reponses.map((r) => [r.question_id, { reponse: r.reponse, commentaire: r.commentaire ?? "" }])),
  );
  const [envoi, setEnvoi] = useState(false);

  const questionsAdministratif = questions.filter((q) => q.categorie === "administratif");
  const questionsOuvertureMarche = questions.filter((q) => q.categorie === "ouverture_marche");
  const questionsSavoirFaire = questions.filter(
    (q) => q.categorie === "savoir_faire" && q.type_marche_id === typeMarcheId,
  );
  const questionsActives = [...questionsAdministratif, ...questionsSavoirFaire, ...questionsOuvertureMarche];

  const resultatsB = useMemo(
    () =>
      calculerSectionB({
        montantMarcheEstime: montants.montantMarcheEstime ? Number(montants.montantMarcheEstime) : null,
        coutTotalRealisation: montants.coutTotalRealisation ? Number(montants.coutTotalRealisation) : null,
        prixDao: montants.prixDao ? Number(montants.prixDao) : null,
        cautionSoumission: montants.cautionSoumission ? Number(montants.cautionSoumission) : null,
        fraisPreparation: montants.fraisPreparation ? Number(montants.fraisPreparation) : null,
        avancePourcentage: montants.avancePourcentage ? Number(montants.avancePourcentage) / 100 : null,
        delaiPaiementJours: montants.delaiPaiementJours ? Number(montants.delaiPaiementJours) : null,
        argentDisponibleBanque: montants.argentDisponibleBanque ? Number(montants.argentDisponibleBanque) : null,
      }),
    [montants],
  );

  const noteMarge = noteMargeAuto(resultatsB.margeEstimee, parametres.margeMinVisee);
  const noteTresorerie = noteTresorerieAuto(resultatsB.couverture);
  const noteTotale = calculerNoteTotale({
    noteMarge,
    noteTresorerie,
    noteInteretStrategique: Number(notesManuelles.noteInteretStrategique || 0),
    noteClientPaie: Number(notesManuelles.noteClientPaie || 0),
    noteConcurrence: Number(notesManuelles.noteConcurrence || 0),
    noteRisques: Number(notesManuelles.noteRisques || 0),
  });

  const nombreNon = questionsActives.filter((q) => reponsesLocales.get(q.id)?.reponse === "non").length;
  const questionsNonRepondues = questionsActives.filter((q) => {
    const r = reponsesLocales.get(q.id)?.reponse;
    return r === undefined || r === "a_confirmer";
  }).length;
  const champsVidesMontants = Object.values(montants).filter((v) => v.trim().length === 0).length;
  const champsVidesNotes = Object.values(notesManuelles).filter((v) => v.trim().length === 0).length;
  const champsVides = champsVidesMontants + champsVidesNotes + (typeMarcheId === null ? 1 : 0);

  const decision = calculerDecision({
    nombreNon,
    questionsNonRepondues,
    champsVides,
    noteTotale,
    noteMinGo: parametres.noteMinGo,
  });

  async function enregistrerReponse(question: QuestionGoNoGo, reponse: ReponseGoNoGoValeur, commentaire: string) {
    setReponsesLocales((carte) => new Map(carte).set(question.id, { reponse, commentaire }));
    const resultat = await mettreAJourReponseGoNoGo(goNoGo.id, appelOffresId, {
      questionId: question.id,
      texteQuestionSnapshot: question.texte,
      reponse,
      commentaire: commentaire.trim().length > 0 ? commentaire : null,
    });
    if ("erreur" in resultat) toast.error(resultat.erreur);
  }

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await mettreAJourGoNoGo(appelOffresId, {
      typeMarcheId,
      montantMarcheEstime: montants.montantMarcheEstime || null,
      coutTotalRealisation: montants.coutTotalRealisation || null,
      prixDao: montants.prixDao || null,
      cautionSoumission: montants.cautionSoumission || null,
      fraisPreparation: montants.fraisPreparation || null,
      avancePourcentage: montants.avancePourcentage || null,
      delaiPaiementJours: montants.delaiPaiementJours || null,
      argentDisponibleBanque: montants.argentDisponibleBanque || null,
      noteInteretStrategique: notesManuelles.noteInteretStrategique || null,
      noteClientPaie: notesManuelles.noteClientPaie || null,
      noteConcurrence: notesManuelles.noteConcurrence || null,
      noteRisques: notesManuelles.noteRisques || null,
      commentaireGlobal: commentaireGlobal.trim().length > 0 ? commentaireGlobal : null,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  function groupeQuestions(titre: string, liste: QuestionGoNoGo[]) {
    if (liste.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{titre}</h3>
        {liste.map((question) => {
          const etat = reponsesLocales.get(question.id);
          const suggestion =
            question.texte.toLowerCase().includes("agrément") ? suggestionAgrement
            : question.texte.toLowerCase().includes("attestations") ? suggestionAttestations
            : null;
          return (
            <div key={question.id} className="flex flex-col gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`question-${question.id}`}>{question.texte}</Label>
                {suggestion && !etat && (
                  <Badge variant="outline">{t("suggestion", { valeur: t(`sectionA.reponse.${suggestion}`) })}</Badge>
                )}
              </div>
              <Select
                value={etat?.reponse ?? ""}
                onValueChange={(valeur) =>
                  enregistrerReponse(question, valeur as ReponseGoNoGoValeur, etat?.commentaire ?? "")
                }
              >
                <SelectTrigger id={`question-${question.id}`} className="w-48">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {REPONSES_GO_NO_GO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`sectionA.reponse.${valeur}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={etat?.commentaire ?? ""}
                onChange={(e) => enregistrerReponse(question, etat?.reponse ?? "a_confirmer", e.target.value)}
                placeholder={t("sectionA.commentairePlaceholder")}
                aria-label={`${question.texte} — ${t("sectionA.commentairePlaceholder")}`}
                rows={2}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="go-no-go-type-marche">{t("selecteurTypeMarche")}</Label>
        <Select value={typeMarcheId ?? ""} onValueChange={(v) => setTypeMarcheId(v)}>
          <SelectTrigger id="go-no-go-type-marche" className="w-64">
            <SelectValue placeholder={t("typeMarcheNonChoisi")} />
          </SelectTrigger>
          <SelectContent>
            {typesMarche.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionA.titre")}</h2>
        {groupeQuestions(t("sectionA.groupeAdministratif"), questionsAdministratif)}
        {typeMarcheId === null ? (
          <p className="text-sm text-muted-foreground">{t("typeMarcheNonChoisi")}</p>
        ) : (
          groupeQuestions(t("sectionA.groupeSavoirFaire"), questionsSavoirFaire)
        )}
        {groupeQuestions(t("sectionA.groupeOuvertureMarche"), questionsOuvertureMarche)}
        <div className="flex gap-6 text-sm">
          <span>{t("sectionA.nombreNon")} : {nombreNon}</span>
          <span>{t("sectionA.questionsNonRepondues")} : {questionsNonRepondues}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionB.titre")}</h2>
        {(
          [
            ["montantMarcheEstime", "montantMarcheEstime"],
            ["coutTotalRealisation", "coutTotalRealisation"],
            ["prixDao", "prixDao"],
            ["cautionSoumission", "cautionSoumission"],
            ["fraisPreparation", "fraisPreparation"],
            ["avancePourcentage", "avancePourcentage"],
            ["delaiPaiementJours", "delaiPaiementJours"],
            ["argentDisponibleBanque", "argentDisponibleBanque"],
          ] as const
        ).map(([cle, labelCle]) => (
          <div key={cle} className="flex flex-col gap-2">
            <Label htmlFor={`go-no-go-${cle}`}>{t(`sectionB.${labelCle}`)}</Label>
            <Input
              id={`go-no-go-${cle}`}
              type="number"
              value={montants[cle]}
              onChange={(e) => setMontants((m) => ({ ...m, [cle]: e.target.value }))}
            />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{t("sectionB.coutPourRepondre")}</span><span>{resultatsB.coutPourRepondre.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.beneficeEstime")}</span><span>{resultatsB.beneficeEstime.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.margeEstimee")}</span><span>{(resultatsB.margeEstimee * 100).toFixed(0)}%</span>
          <span>{t("sectionB.avanceRecue")}</span><span>{resultatsB.avanceRecue.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.argentAAvancer")}</span><span>{resultatsB.argentAAvancer.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.couverture")}</span><span>{(resultatsB.couverture * 100).toFixed(0)}%</span>
          <span>{t("sectionB.moisATenir")}</span><span>{resultatsB.moisATenir.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionC.titre")}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{t("sectionC.noteMarge")}</span><span>{noteMarge} / 4</span>
          <span>{t("sectionC.noteTresorerie")}</span><span>{noteTresorerie} / 4</span>
        </div>
        {(
          [
            ["noteInteretStrategique", 4],
            ["noteClientPaie", 3],
            ["noteConcurrence", 2],
            ["noteRisques", 3],
          ] as const
        ).map(([cle, max]) => (
          <div key={cle} className="flex flex-col gap-2">
            <Label htmlFor={`go-no-go-${cle}`}>{t(`sectionC.${cle}`)}</Label>
            <Select
              value={notesManuelles[cle]}
              onValueChange={(v) => setNotesManuelles((n) => ({ ...n, [cle]: v }))}
            >
              <SelectTrigger id={`go-no-go-${cle}`} className="w-32">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: max + 1 }, (_, i) => i).map((valeur) => (
                  <SelectItem key={valeur} value={String(valeur)}>
                    {valeur} / {max}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <p className="font-semibold">{t("sectionC.noteTotale")} : {noteTotale} / 20</p>
      </div>

      <div className="flex flex-col gap-3 border rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("decision.titre")}</h2>
          <Badge variant={VARIANT_DECISION[decision]}>
            {t(`decision.${achatDaoEffectue ? "postAchat" : "achatDao"}.${decision}`)}
          </Badge>
        </div>
        <Textarea
          value={commentaireGlobal}
          onChange={(e) => setCommentaireGlobal(e.target.value)}
          placeholder={t("sectionA.commentairePlaceholder")}
          aria-label={t("sectionA.commentairePlaceholder")}
          rows={2}
        />
        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          {envoi ? t("envoiEnCours") : t("boutonEnregistrer")}
        </Button>
      </div>
    </div>
  );
}
