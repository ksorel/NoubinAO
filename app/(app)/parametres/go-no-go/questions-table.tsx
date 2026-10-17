"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  creerQuestionGoNoGo,
  modifierQuestionGoNoGo,
  desactiverQuestionGoNoGo,
} from "@/lib/appels-offres/actions";
import type { CategorieQuestionGoNoGo, QuestionGoNoGo } from "@/lib/appels-offres/types";

export function QuestionsTable({
  questionsInitiales,
  categorie,
  typeMarcheId,
}: {
  questionsInitiales: QuestionGoNoGo[];
  categorie: CategorieQuestionGoNoGo;
  typeMarcheId: string | null;
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [questions, setQuestions] = useState(questionsInitiales);
  const [textesEdition, setTextesEdition] = useState<Record<string, string>>({});
  const [nouveauTexte, setNouveauTexte] = useState("");

  async function ajouter() {
    if (nouveauTexte.trim().length === 0) return;
    const resultat = await creerQuestionGoNoGo({ categorie, typeMarcheId, texte: nouveauTexte });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => [
      ...liste,
      {
        id: resultat.id,
        entreprise_id: "",
        type_marche_id: typeMarcheId,
        categorie,
        texte: nouveauTexte,
        ordre: liste.length,
        actif: true,
        created_at: new Date().toISOString(),
      },
    ]);
    setNouveauTexte("");
    toast.success(t("toastEnregistre"));
  }

  async function modifier(id: string) {
    const texte = textesEdition[id];
    if (!texte || texte.trim().length === 0) return;
    const resultat = await modifierQuestionGoNoGo(id, { texte });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => liste.map((q) => (q.id === id ? { ...q, texte } : q)));
    toast.success(t("toastEnregistre"));
  }

  async function desactiver(id: string) {
    const resultat = await desactiverQuestionGoNoGo(id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => liste.filter((q) => q.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {questions
        .filter((q) => q.categorie === categorie && q.type_marche_id === typeMarcheId)
        .map((question) => (
          <div key={question.id} className="flex items-center gap-2">
            <Input
              className="flex-1"
              defaultValue={question.texte}
              placeholder={t("champTexteQuestion")}
              onChange={(e) => setTextesEdition((m) => ({ ...m, [question.id]: e.target.value }))}
            />
            <Button variant="outline" size="sm" onClick={() => modifier(question.id)}>
              {t("boutonEnregistrer")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => desactiver(question.id)}>
              {t("boutonDesactiver")}
            </Button>
          </div>
        ))}
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={t("champTexteQuestion")}
          value={nouveauTexte}
          onChange={(e) => setNouveauTexte(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={ajouter}>
          {t("boutonAjouterQuestion")}
        </Button>
      </div>
    </div>
  );
}
