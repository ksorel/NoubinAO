# Spike : validation de l'extraction de DAO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire, pour 3 DAO PDF de test réalistes, un Markdown normalisé et une extraction JSON structurée des exigences (pièces requises, critères d'évaluation, sommaire, délai), afin de juger si l'approche de normalisation + extraction IA documentée dans CLAUDE.md est assez fiable pour construire l'infrastructure du Module 3 dessus.

**Architecture:** Script Node/TypeScript autonome (`scripts/dao-spike/`), non branché à l'app Next.js, exécuté via `tsx`. Pipeline : extraction texte par page (`pdf-parse`) → repli OCR par lecture d'image Claude sur les pages au texte insuffisant → structuration en Markdown (pandoc si disponible, sinon détection heuristique de titres connus) → découpage par section (`##`) → extraction IA (Claude Haiku, schéma Zod) sur les sections pertinentes. Les fixtures PDF sont générées séparément en Python (reportlab + pypdfium2), hors du runtime Node de l'app.

**Tech Stack:** TypeScript (`tsx` pour l'exécution directe), `pdf-parse`, `@anthropic-ai/sdk`, `pdfjs-dist` + `@napi-rs/canvas` (rendu image d'une page PDF pour l'OCR), `zod` (déjà présent). Python (`reportlab`, `pypdfium2`, `pillow`) pour la génération des fixtures uniquement.

## Global Constraints

- Aucune UI, aucune table `appel_offres`/`exigence_ao`, aucune connexion à la bibliothèque documentaire ou à l'app Next.js — script autonome uniquement.
- Modèle Claude : `claude-haiku-4-5-20251001` partout (extraction ET lecture d'image OCR) — pas de montée en gamme pour ce spike.
- `ANTHROPIC_API_KEY` est déjà configurée dans `.env.local` (confirmé avant l'écriture de ce plan).
- Formats bailleurs (Banque mondiale, BAD) hors périmètre — non applicable à ce spike de toute façon.
- `tesseract.js` non utilisé — la lecture d'image native de Claude sert de repli OCR.
- Sortie sauvegardée dans `fixtures/dao/out/` (Markdown + JSON par fixture), fixtures PDF commitées dans `fixtures/dao/`.
- Toute donnée extraite (`pieces_requises`, `criteres_evaluation`) porte un champ `source` référençant la section Markdown d'origine.

---

### Task 1: Installer les dépendances et le script npm

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: rien (première tâche)
- Produces: dépendances `pdf-parse`, `@anthropic-ai/sdk`, `pdfjs-dist`, `@napi-rs/canvas` disponibles pour les tâches suivantes ; `tsx` en devDependency ; script npm `dao-spike` pour exécuter `scripts/dao-spike/run.ts` (créé en Task 7).

- [ ] **Step 1: Installer les dépendances runtime**

Run: `npm install pdf-parse @anthropic-ai/sdk pdfjs-dist @napi-rs/canvas`

- [ ] **Step 2: Installer tsx en devDependency**

Run: `npm install --save-dev tsx`

- [ ] **Step 3: Ajouter le script npm**

Dans `package.json`, section `"scripts"`, ajouter après `"test": "vitest run"` :

```json
    "dao-spike": "tsx scripts/dao-spike/run.ts"
```

- [ ] **Step 4: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`

Expected: aucune erreur (ces dépendances ne sont pas encore importées par du code).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: installer les dépendances du spike d'extraction de DAO"
```

---

### Task 2: Générer les fixtures DAO 1 (cas propre) et DAO 2 (tableau complexe)

**Files:**
- Create: `fixtures/dao/generer_dao_1_et_2.py`
- Create (générés par le script) : `fixtures/dao/dao-1-propre.pdf`, `fixtures/dao/dao-2-tableau-complexe.pdf`

**Interfaces:**
- Consumes: rien
- Produces: deux fichiers PDF dans `fixtures/dao/`, consommés par le pipeline de normalisation (Task 5) et le script d'orchestration (Task 7). Chaque PDF contient les sections `AVIS D'APPEL D'OFFRES`, `INSTRUCTIONS AUX SOUMISSIONNAIRES`, `DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES`, `CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES`, `CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES`, `SOMMAIRE ATTENDU DE L'OFFRE` — ces titres exacts (en majuscules) sont réutilisés tels quels par la détection heuristique de Task 5, à ne pas paraphraser.

- [ ] **Step 1: Installer les bibliothèques Python nécessaires**

Run: `pip install reportlab pypdfium2 pillow`

- [ ] **Step 2: Créer `fixtures/dao/generer_dao_1_et_2.py`**

```python
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

STYLES = getSampleStyleSheet()
TITRE = ParagraphStyle("Titre", parent=STYLES["Heading1"], fontSize=14)
SOUS_TITRE = ParagraphStyle("SousTitre", parent=STYLES["Heading2"], fontSize=12)
CORPS = STYLES["BodyText"]


def section_aao(numero, acheteur, objet, date_limite, montant_caution):
    return [
        Paragraph("AVIS D'APPEL D'OFFRES", TITRE),
        Paragraph(numero, CORPS),
        Spacer(1, 0.5 * cm),
        Paragraph(objet, CORPS),
        Spacer(1, 0.3 * cm),
        Paragraph(f"Acheteur : {acheteur}", CORPS),
        Paragraph("Secteur : Bâtiments et Travaux Publics", CORPS),
        Paragraph(f"Date limite de dépôt des offres : {date_limite}", CORPS),
        Paragraph(f"Montant de la caution de soumission : {montant_caution}", CORPS),
        PageBreak(),
    ]


def section_is():
    return [
        Paragraph("INSTRUCTIONS AUX SOUMISSIONNAIRES", TITRE),
        Paragraph(
            "Les présentes instructions définissent les modalités de préparation, "
            "de dépôt et d'évaluation des offres. Tout soumissionnaire doit fournir "
            "un dossier complet comprenant les pièces administratives, l'offre "
            "technique et l'offre financière, sous peine de rejet.",
            CORPS,
        ),
        PageBreak(),
    ]


def section_ccag():
    return [
        Paragraph("CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES", TITRE),
        Paragraph(
            "Le présent cahier fixe les clauses administratives générales "
            "applicables aux marchés de travaux publics en République de Côte "
            "d'Ivoire, conformément au Code des marchés publics.",
            CORPS,
        ),
        PageBreak(),
    ]


def section_ccap(duree):
    return [
        Paragraph("CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES", TITRE),
        Paragraph(
            f"Le présent marché est conclu pour une durée d'exécution de {duree} "
            "à compter de la notification de l'ordre de service.",
            CORPS,
        ),
        PageBreak(),
    ]


def section_sommaire():
    story = [Paragraph("SOMMAIRE ATTENDU DE L'OFFRE", TITRE), Paragraph("Offre technique :", SOUS_TITRE)]
    for item in [
        "Présentation de l'entreprise",
        "Méthodologie d'exécution",
        "Planning des travaux",
        "Références de projets similaires",
    ]:
        story.append(Paragraph(f"– {item}", CORPS))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Offre financière :", SOUS_TITRE))
    for item in [
        "Bordereau des prix unitaires",
        "Devis quantitatif et estimatif",
        "Cadre du sous-détail des prix",
    ]:
        story.append(Paragraph(f"– {item}", CORPS))
    return story


def generer_dao_1():
    doc = SimpleDocTemplate(
        "fixtures/dao/dao-1-propre.pdf", pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    story = []
    story += section_aao(
        "N° AAO-2026-0142/DGIR",
        "La Direction Générale des Infrastructures Routières (DGIR) lance un appel "
        "d'offres national pour les travaux de réhabilitation de la voirie urbaine "
        "du quartier Adjamé-Bracodi, commune d'Adjamé, Abidjan.",
        "Direction Générale des Infrastructures Routières",
        "15 octobre 2026 à 12h00",
        "5 000 000 FCFA",
    )
    story += section_is()

    story.append(Paragraph("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES", TITRE))
    story.append(Paragraph("Pièces administratives requises :", SOUS_TITRE))
    for piece in [
        "Registre du Commerce et du Crédit Mobilier (RCCM)",
        "Attestation de régularité fiscale",
        "Attestation de la Caisse Nationale de Prévoyance Sociale (CNPS)",
        "Certificat de non-faillite",
        "Identifiant Unique (IDU)",
    ]:
        story.append(Paragraph(f"– {piece}", CORPS))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Critères d'évaluation des offres :", SOUS_TITRE))

    table = Table(
        [
            ["Critère", "Pondération"],
            ["Conformité administrative", "20%"],
            ["Expérience du soumissionnaire", "30%"],
            ["Méthodologie proposée", "30%"],
            ["Délai d'exécution", "20%"],
        ],
        colWidths=[10 * cm, 4 * cm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(PageBreak())

    story += section_ccag()
    story += section_ccap("6 mois")
    story += section_sommaire()

    doc.build(story)
    print("Généré : fixtures/dao/dao-1-propre.pdf")


def generer_dao_2():
    doc = SimpleDocTemplate(
        "fixtures/dao/dao-2-tableau-complexe.pdf", pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    story = []
    story += section_aao(
        "N° AAO-2026-0217/DGE",
        "La Direction Générale de l'Énergie lance un appel d'offres national pour "
        "la construction d'un poste de transformation électrique à Yamoussoukro.",
        "Direction Générale de l'Énergie",
        "28 octobre 2026 à 12h00",
        "8 000 000 FCFA",
    )
    story += section_is()

    story.append(Paragraph("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES", TITRE))
    story.append(Paragraph("Pièces administratives requises :", SOUS_TITRE))
    for piece in [
        "Registre du Commerce et du Crédit Mobilier (RCCM)",
        "Attestation de régularité fiscale",
        "Attestation CNPS",
        "Certificat de non-faillite",
        "Agrément technique en installations électriques",
    ]:
        story.append(Paragraph(f"– {piece}", CORPS))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Grille de pondération des offres :", SOUS_TITRE))

    # Tableau à 4 colonnes avec fusion de cellules sur la colonne Critère,
    # volontairement plus complexe que le tableau simple du DAO 1.
    table = Table(
        [
            ["Critère", "Sous-critère", "Points", "Coefficient"],
            ["Conformité administrative", "Pièces complètes", "10", "x1"],
            ["", "Validité des pièces", "10", "x1"],
            ["Expérience", "Projets similaires (5 ans)", "15", "x2"],
            ["", "Chiffre d'affaires moyen", "10", "x1"],
            ["Méthodologie", "Plan d'exécution", "20", "x1"],
            ["", "Moyens humains et matériels", "10", "x1"],
            ["Délai", "Délai proposé", "15", "x1"],
        ],
        colWidths=[4.5 * cm, 6 * cm, 2 * cm, 2.5 * cm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("SPAN", (0, 1), (0, 2)),
        ("SPAN", (0, 3), (0, 4)),
        ("SPAN", (0, 5), (0, 6)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(table)
    story.append(PageBreak())

    story += section_ccag()
    story += section_ccap("9 mois")
    story += section_sommaire()

    doc.build(story)
    print("Généré : fixtures/dao/dao-2-tableau-complexe.pdf")


if __name__ == "__main__":
    generer_dao_1()
    generer_dao_2()
```

- [ ] **Step 3: Exécuter le script**

Run: `python fixtures/dao/generer_dao_1_et_2.py`

Expected: les deux fichiers `fixtures/dao/dao-1-propre.pdf` et `fixtures/dao/dao-2-tableau-complexe.pdf` sont créés. Ouvrir rapidement chacun (ou en extraire le texte avec le skill `pdf`) pour confirmer visuellement que le contenu correspond à ce qui est attendu — en particulier que le tableau du DAO 2 s'affiche avec ses cellules fusionnées sur la colonne Critère.

- [ ] **Step 4: Commit**

```bash
git add fixtures/dao/generer_dao_1_et_2.py fixtures/dao/dao-1-propre.pdf fixtures/dao/dao-2-tableau-complexe.pdf
git commit -m "feat(dao-spike): générer les fixtures DAO 1 (cas propre) et DAO 2 (tableau complexe)"
```

---

### Task 3: Générer la fixture DAO 3 (page scannée simulée)

**Files:**
- Create: `fixtures/dao/generer_dao_3.py`
- Create (généré) : `fixtures/dao/dao-3-scanne.pdf`

**Interfaces:**
- Consumes: rien (script Python indépendant de Task 2, même si le contenu textuel est similaire en style)
- Produces: `fixtures/dao/dao-3-scanne.pdf`, dont la **première page (l'AAO) est une image aplatie sans aucun texte sélectionnable** — le reste du document (IS, DPAO avec tableau de pondération, CCAG/CCAP, sommaire) reste du texte normal. Consommé par le pipeline de normalisation (Task 5) et le script d'orchestration (Task 7) : c'est cette fixture qui doit déclencher le repli OCR sur sa page 1.

**Contexte :** la technique consiste à générer d'abord l'AAO comme un mini-PDF texte normal (fichier temporaire), à le rendre en image PNG haute résolution avec `pypdfium2` (aucun texte, juste des pixels — comme un vrai scan), puis à construire le PDF final avec cette image en page 1 suivie du reste du contenu en texte normal.

- [ ] **Step 1: Créer `fixtures/dao/generer_dao_3.py`**

```python
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image,
)
import pypdfium2 as pdfium

STYLES = getSampleStyleSheet()
TITRE = ParagraphStyle("Titre", parent=STYLES["Heading1"], fontSize=14)
SOUS_TITRE = ParagraphStyle("SousTitre", parent=STYLES["Heading2"], fontSize=12)
CORPS = STYLES["BodyText"]


def generer_page_aao_temporaire():
    chemin = "fixtures/dao/_temp_aao.pdf"
    doc = SimpleDocTemplate(
        chemin, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    story = [
        Paragraph("AVIS D'APPEL D'OFFRES", TITRE),
        Paragraph("N° AAO-2026-0198/MINAGRI", CORPS),
        Spacer(1, 0.5 * cm),
        Paragraph(
            "Le Ministère de l'Agriculture et du Développement Rural lance un "
            "appel d'offres national pour la construction d'un centre de "
            "stockage agricole à Bouaké.",
            CORPS,
        ),
        Spacer(1, 0.3 * cm),
        Paragraph("Acheteur : Ministère de l'Agriculture et du Développement Rural", CORPS),
        Paragraph("Secteur : Bâtiments et Travaux Publics", CORPS),
        Paragraph("Date limite de dépôt des offres : 3 novembre 2026 à 12h00", CORPS),
        Paragraph("Montant de la caution de soumission : 3 500 000 FCFA", CORPS),
    ]
    doc.build(story)
    return chemin


def aplatir_en_image(chemin_pdf_source, chemin_image_sortie):
    pdf = pdfium.PdfDocument(chemin_pdf_source)
    page = pdf[0]
    bitmap = page.render(scale=2.0)
    image = bitmap.to_pil()
    image.save(chemin_image_sortie, "PNG")


def generer_dao_3():
    chemin_temp_pdf = generer_page_aao_temporaire()
    chemin_temp_image = "fixtures/dao/_temp_aao.png"
    aplatir_en_image(chemin_temp_pdf, chemin_temp_image)

    doc = SimpleDocTemplate(
        "fixtures/dao/dao-3-scanne.pdf", pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    story = []

    # Page 1 : l'AAO en image plein cadre, sans texte sélectionnable (simule un scan).
    story.append(Image(chemin_temp_image, width=17 * cm, height=17 * cm * 29.7 / 21, kind="proportional"))
    story.append(PageBreak())

    story.append(Paragraph("INSTRUCTIONS AUX SOUMISSIONNAIRES", TITRE))
    story.append(Paragraph(
        "Les présentes instructions définissent les modalités de préparation, "
        "de dépôt et d'évaluation des offres.",
        CORPS,
    ))
    story.append(PageBreak())

    story.append(Paragraph("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES", TITRE))
    story.append(Paragraph("Pièces administratives requises :", SOUS_TITRE))
    for piece in [
        "Registre du Commerce et du Crédit Mobilier (RCCM)",
        "Attestation de régularité fiscale",
        "Attestation CNPS",
        "Certificat de non-faillite",
    ]:
        story.append(Paragraph(f"– {piece}", CORPS))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Critères d'évaluation des offres :", SOUS_TITRE))

    table = Table(
        [
            ["Critère", "Pondération"],
            ["Conformité administrative", "25%"],
            ["Expérience du soumissionnaire", "25%"],
            ["Méthodologie proposée", "30%"],
            ["Délai d'exécution", "20%"],
        ],
        colWidths=[10 * cm, 4 * cm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(PageBreak())

    story.append(Paragraph("CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES ET PARTICULIÈRES", TITRE))
    story.append(Paragraph(
        "Le présent marché est conclu pour une durée d'exécution de 8 mois à "
        "compter de la notification de l'ordre de service.",
        CORPS,
    ))
    story.append(PageBreak())

    story.append(Paragraph("SOMMAIRE ATTENDU DE L'OFFRE", TITRE))
    story.append(Paragraph("Offre technique :", SOUS_TITRE))
    for item in ["Présentation de l'entreprise", "Méthodologie d'exécution", "Planning des travaux"]:
        story.append(Paragraph(f"– {item}", CORPS))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Offre financière :", SOUS_TITRE))
    for item in ["Bordereau des prix unitaires", "Devis quantitatif et estimatif"]:
        story.append(Paragraph(f"– {item}", CORPS))

    doc.build(story)
    print("Généré : fixtures/dao/dao-3-scanne.pdf")

    os.remove(chemin_temp_pdf)
    os.remove(chemin_temp_image)


if __name__ == "__main__":
    generer_dao_3()
```

- [ ] **Step 2: Exécuter le script**

Run: `python fixtures/dao/generer_dao_3.py`

Expected: `fixtures/dao/dao-3-scanne.pdf` créé, les deux fichiers temporaires (`_temp_aao.pdf`, `_temp_aao.png`) supprimés automatiquement (le script les nettoie lui-même).

- [ ] **Step 3: Vérifier que la page 1 n'a pas de texte sélectionnable**

Run: `python -c "import pypdfium2 as pdfium; pdf = pdfium.PdfDocument('fixtures/dao/dao-3-scanne.pdf'); print(repr(pdf[0].get_textpage().get_text_range()))"`

Expected: une chaîne vide ou quasiment vide (`''`) — confirme que la page 1 est bien une image sans texte sélectionnable, contrairement aux pages suivantes.

- [ ] **Step 4: Commit**

```bash
git add fixtures/dao/generer_dao_3.py fixtures/dao/dao-3-scanne.pdf
git commit -m "feat(dao-spike): générer la fixture DAO 3 (page AAO scannée simulée)"
```

---

### Task 4: Schéma Zod de l'extraction

**Files:**
- Create: `scripts/dao-spike/schema.ts`
- Test: `scripts/dao-spike/schema.test.ts`

**Interfaces:**
- Consumes: `zod` (déjà installé)
- Produces: `export const ExtractionDaoSchema` (schéma Zod), `export type ExtractionDao` — consommés par le module d'extraction (Task 6) et le script d'orchestration (Task 7).

- [ ] **Step 1: Écrire le test**

Créer `scripts/dao-spike/schema.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { ExtractionDaoSchema } from "./schema";

describe("ExtractionDaoSchema", () => {
  it("valide un objet d'extraction complet", () => {
    const resultat = ExtractionDaoSchema.parse({
      pieces_requises: [
        { type: "RCCM", description: "Registre du Commerce", source: "DPAO" },
      ],
      criteres_evaluation: [
        { critere: "Conformité administrative", ponderation: 20, source: "DPAO" },
      ],
      sommaire_attendu: ["Présentation de l'entreprise"],
      delai_depot: "15 octobre 2026 à 12h00",
    });

    expect(resultat.pieces_requises).toHaveLength(1);
    expect(resultat.criteres_evaluation[0].ponderation).toBe(20);
  });

  it("accepte une pondération nulle et un délai nul", () => {
    const resultat = ExtractionDaoSchema.parse({
      pieces_requises: [],
      criteres_evaluation: [{ critere: "Non chiffré", ponderation: null, source: "DPAO" }],
      sommaire_attendu: [],
      delai_depot: null,
    });

    expect(resultat.criteres_evaluation[0].ponderation).toBeNull();
    expect(resultat.delai_depot).toBeNull();
  });

  it("rejette un objet sans le champ source sur une pièce requise", () => {
    expect(() =>
      ExtractionDaoSchema.parse({
        pieces_requises: [{ type: "RCCM" }],
        criteres_evaluation: [],
        sommaire_attendu: [],
        delai_depot: null,
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/dao-spike/schema.test.ts`

Expected: FAIL — `schema.ts` n'existe pas encore.

- [ ] **Step 3: Créer `scripts/dao-spike/schema.ts`**

```ts
import { z } from "zod";

export const PieceRequiseSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  source: z.string(),
});

export const CritereEvaluationSchema = z.object({
  critere: z.string(),
  ponderation: z.number().nullable(),
  source: z.string(),
});

export const ExtractionDaoSchema = z.object({
  pieces_requises: z.array(PieceRequiseSchema),
  criteres_evaluation: z.array(CritereEvaluationSchema),
  sommaire_attendu: z.array(z.string()),
  delai_depot: z.string().nullable(),
});

export type ExtractionDao = z.infer<typeof ExtractionDaoSchema>;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run scripts/dao-spike/schema.test.ts`

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add scripts/dao-spike/schema.ts scripts/dao-spike/schema.test.ts
git commit -m "feat(dao-spike): schéma Zod de l'extraction des exigences"
```

---

### Task 5: Pipeline de normalisation (texte, OCR, Markdown, découpage)

**Files:**
- Create: `scripts/dao-spike/pdf-texte.ts`
- Create: `scripts/dao-spike/ocr.ts`
- Create: `scripts/dao-spike/markdown.ts`
- Create: `scripts/dao-spike/normaliser.ts`
- Test: `scripts/dao-spike/markdown.test.ts`

**Interfaces:**
- Consumes: `pdf-parse`, `pdfjs-dist`, `@napi-rs/canvas`, `@anthropic-ai/sdk` (Task 1).
- Produces:
  - `pdf-texte.ts` : `export interface PageTexte { numero: number; texte: string }`, `export async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]>`.
  - `ocr.ts` : `export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer>`, `export async function lireImageParClaude(imageBuffer: Buffer): Promise<string>`.
  - `markdown.ts` : `export interface SectionMarkdown { titre: string; contenu: string }`, `export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string`, `export async function structurerEnMarkdownPandoc(cheminPdf: string): Promise<string | null>`, `export function decouperParSection(markdown: string): SectionMarkdown[]`.
  - `normaliser.ts` : `export async function normaliserDao(buffer: Buffer, cheminPdf: string): Promise<{ markdown: string; sections: SectionMarkdown[] }>` — consommé par le script d'orchestration (Task 7) et le module d'extraction (Task 6, qui reçoit `SectionMarkdown[]`).

- [ ] **Step 1: Créer `scripts/dao-spike/pdf-texte.ts`**

```ts
import pdfParse from "pdf-parse";

export interface PageTexte {
  numero: number;
  texte: string;
}

export async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
  const pages: PageTexte[] = [];
  let numeroPageCourante = 0;

  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      numeroPageCourante += 1;
      const contenu = await pageData.getTextContent();
      const texte = contenu.items.map((item: { str: string }) => item.str).join(" ");
      pages.push({ numero: numeroPageCourante, texte });
      return texte;
    },
  });

  return pages;
}
```

- [ ] **Step 2: Créer `scripts/dao-spike/ocr.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer> {
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(numeroPage);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const contexte = canvas.getContext("2d");

  await page.render({
    canvasContext: contexte as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

export async function lireImageParClaude(imageBuffer: Buffer): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Transcris fidèlement tout le texte visible sur cette image de document administratif, sans commentaire ni reformulation.",
          },
        ],
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  return bloc && bloc.type === "text" ? bloc.text : "";
}
```

- [ ] **Step 3: Écrire le test pour `decouperParSection` et `structurerEnMarkdownHeuristique`**

Créer `scripts/dao-spike/markdown.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { decouperParSection, structurerEnMarkdownHeuristique } from "./markdown";
import type { PageTexte } from "./pdf-texte";

describe("structurerEnMarkdownHeuristique", () => {
  it("injecte un titre ## pour chaque titre connu rencontré", () => {
    const pages: PageTexte[] = [
      { numero: 1, texte: "AVIS D'APPEL D'OFFRES Contenu de l'avis." },
    ];

    const markdown = structurerEnMarkdownHeuristique(pages);

    expect(markdown).toContain("## AVIS D'APPEL D'OFFRES");
  });
});

describe("decouperParSection", () => {
  it("découpe un Markdown en sections par titre ##", () => {
    const markdown = [
      "## AVIS D'APPEL D'OFFRES",
      "Contenu de l'AAO.",
      "## DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
      "Contenu du DPAO.",
    ].join("\n");

    const sections = decouperParSection(markdown);

    expect(sections).toHaveLength(2);
    expect(sections[0].titre).toBe("AVIS D'APPEL D'OFFRES");
    expect(sections[0].contenu).toContain("Contenu de l'AAO.");
    expect(sections[1].titre).toBe("DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES");
  });

  it("place le contenu avant le premier titre dans une section Introduction", () => {
    const markdown = "Texte avant tout titre.\n## PREMIER TITRE\nContenu.";

    const sections = decouperParSection(markdown);

    expect(sections[0].titre).toBe("Introduction");
    expect(sections[0].contenu).toContain("Texte avant tout titre.");
  });
});
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run scripts/dao-spike/markdown.test.ts`

Expected: FAIL — `markdown.ts` n'existe pas encore.

- [ ] **Step 5: Créer `scripts/dao-spike/markdown.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PageTexte } from "./pdf-texte";

const execFileAsync = promisify(execFile);

export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  "CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES",
  "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES",
  "SOMMAIRE ATTENDU DE L'OFFRE",
];

export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string {
  const morceaux: string[] = [];
  for (const page of pages) {
    let texte = page.texte;
    for (const titre of TITRES_CONNUS) {
      texte = texte.split(titre).join(`\n## ${titre}\n`);
    }
    morceaux.push(texte);
  }
  return morceaux.join("\n\n");
}

export async function structurerEnMarkdownPandoc(cheminPdf: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("pandoc", [cheminPdf, "-f", "pdf", "-t", "markdown"]);
    return stdout;
  } catch {
    return null;
  }
}

export function decouperParSection(markdown: string): SectionMarkdown[] {
  const sections: SectionMarkdown[] = [];
  const lignes = markdown.split("\n");
  let titreCourant = "Introduction";
  let contenuCourant: string[] = [];

  for (const ligne of lignes) {
    const correspondance = ligne.match(/^##\s+(.+)/);
    if (correspondance) {
      sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });
      titreCourant = correspondance[1].trim();
      contenuCourant = [];
    } else {
      contenuCourant.push(ligne);
    }
  }
  sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });

  return sections.filter((s) => s.contenu.length > 0 || s.titre !== "Introduction");
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run scripts/dao-spike/markdown.test.ts`

Expected: PASS, 3/3.

- [ ] **Step 7: Créer `scripts/dao-spike/normaliser.ts`**

```ts
import { extraireTexteParPage } from "./pdf-texte";
import { rendreImagePage, lireImageParClaude } from "./ocr";
import {
  structurerEnMarkdownHeuristique,
  structurerEnMarkdownPandoc,
  decouperParSection,
  type SectionMarkdown,
} from "./markdown";

const SEUIL_TEXTE_INSUFFISANT = 20;

export async function normaliserDao(
  buffer: Buffer,
  cheminPdf: string
): Promise<{ markdown: string; sections: SectionMarkdown[] }> {
  const pages = await extraireTexteParPage(buffer);

  for (const page of pages) {
    if (page.texte.trim().length < SEUIL_TEXTE_INSUFFISANT) {
      console.log(
        `  Page ${page.numero} : texte insuffisant (${page.texte.trim().length} caractères), repli OCR`
      );
      const imagePage = await rendreImagePage(buffer, page.numero);
      page.texte = await lireImageParClaude(imagePage);
    }
  }

  const markdownPandoc = await structurerEnMarkdownPandoc(cheminPdf);
  const markdown = markdownPandoc ?? structurerEnMarkdownHeuristique(pages);
  console.log(`  Structuration : ${markdownPandoc ? "pandoc" : "heuristique (pandoc indisponible)"}`);

  const sections = decouperParSection(markdown);
  return { markdown, sections };
}
```

- [ ] **Step 8: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add scripts/dao-spike/pdf-texte.ts scripts/dao-spike/ocr.ts scripts/dao-spike/markdown.ts scripts/dao-spike/markdown.test.ts scripts/dao-spike/normaliser.ts
git commit -m "feat(dao-spike): pipeline de normalisation (texte, OCR, Markdown, découpage)"
```

---

### Task 6: Module d'extraction IA des exigences

**Files:**
- Create: `scripts/dao-spike/extraire.ts`

**Interfaces:**
- Consumes: `ExtractionDaoSchema`, `type ExtractionDao` (Task 4) ; `type SectionMarkdown` (Task 5) ; `@anthropic-ai/sdk`.
- Produces: `export async function extraireExigences(sections: SectionMarkdown[]): Promise<ExtractionDao>` — consommé par le script d'orchestration (Task 7).

- [ ] **Step 1: Créer `scripts/dao-spike/extraire.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionDaoSchema, type ExtractionDao } from "./schema";
import type { SectionMarkdown } from "./markdown";

const anthropic = new Anthropic();

function trouverSection(sections: SectionMarkdown[], motCle: string): SectionMarkdown | undefined {
  return sections.find((s) => s.titre.toUpperCase().includes(motCle.toUpperCase()));
}

export async function extraireExigences(sections: SectionMarkdown[]): Promise<ExtractionDao> {
  const sectionAao = trouverSection(sections, "AVIS D'APPEL D'OFFRES");
  const sectionDpao = trouverSection(sections, "DONNÉES PARTICULIÈRES");

  const contenuPertinent = [sectionAao, sectionDpao]
    .filter((s): s is SectionMarkdown => s !== undefined)
    .map((s) => `## ${s.titre}\n${s.contenu}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Voici des sections extraites d'un dossier d'appel d'offres (DAO) ivoirien :

${contenuPertinent}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "pieces_requises": [{ "type": "string", "description": "string", "source": "nom de la section d'origine" }],
  "criteres_evaluation": [{ "critere": "string", "ponderation": nombre ou null, "source": "nom de la section d'origine" }],
  "sommaire_attendu": ["string"],
  "delai_depot": "string ou null"
}

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise un tableau vide ou null selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");
  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionDaoSchema.parse(JSON.parse(jsonBrut));
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add scripts/dao-spike/extraire.ts
git commit -m "feat(dao-spike): module d'extraction IA des exigences"
```

---

### Task 7: Script d'orchestration, exécution et revue manuelle

**Files:**
- Create: `scripts/dao-spike/run.ts`

**Interfaces:**
- Consumes: `normaliserDao` (Task 5), `extraireExigences` (Task 6).
- Produces: rien (dernière tâche) ; écrit ses résultats dans `fixtures/dao/out/`.

- [ ] **Step 1: Créer `scripts/dao-spike/run.ts`**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { normaliserDao } from "./normaliser";
import { extraireExigences } from "./extraire";

const FIXTURES = [
  "dao-1-propre.pdf",
  "dao-2-tableau-complexe.pdf",
  "dao-3-scanne.pdf",
];

async function main() {
  const dossierSortie = path.join("fixtures", "dao", "out");
  await mkdir(dossierSortie, { recursive: true });

  for (const nomFichier of FIXTURES) {
    console.log(`\n=== ${nomFichier} ===`);
    const cheminPdf = path.join("fixtures", "dao", nomFichier);
    const buffer = await readFile(cheminPdf);

    const { markdown, sections } = await normaliserDao(buffer, cheminPdf);
    const nomBase = nomFichier.replace(".pdf", "");

    await writeFile(path.join(dossierSortie, `${nomBase}.md`), markdown, "utf-8");
    console.log(`Markdown sauvegardé : out/${nomBase}.md (${sections.length} sections)`);

    const extraction = await extraireExigences(sections);
    await writeFile(
      path.join(dossierSortie, `${nomBase}.json`),
      JSON.stringify(extraction, null, 2),
      "utf-8"
    );
    console.log(`Extraction sauvegardée : out/${nomBase}.json`);
    console.log(`  Pièces requises : ${extraction.pieces_requises.length}`);
    console.log(`  Critères d'évaluation : ${extraction.criteres_evaluation.length}`);
    console.log(`  Délai de dépôt : ${extraction.delai_depot}`);
  }
}

main().catch((erreur) => {
  console.error("Erreur:", erreur);
  process.exit(1);
});
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Exécuter le spike complet**

Run: `npm run dao-spike`

Expected : le script tourne sans erreur fatale sur les 3 fixtures, produit `fixtures/dao/out/dao-1-propre.md` + `.json`, `dao-2-tableau-complexe.md` + `.json`, `dao-3-scanne.md` + `.json`. Le journal affiche, pour DAO 3, un message de repli OCR sur la page 1.

- [ ] **Step 4: Commit**

```bash
git add scripts/dao-spike/run.ts
git commit -m "feat(dao-spike): script d'orchestration du spike d'extraction de DAO"
```

`fixtures/dao/out/` est créé automatiquement par le script au moment de l'exécution (`mkdir(dossierSortie, { recursive: true })`) — pas besoin de le committer vide. Les fichiers `.md`/`.json` générés à l'étape 3 peuvent être commités séparément après la relecture manuelle (Step 5), s'ils sont utiles à garder comme référence.

- [ ] **Step 5: Relecture manuelle et décision**

Ouvrir les 6 fichiers de `fixtures/dao/out/` (3 `.md`, 3 `.json`) et les comparer au contenu réellement placé dans chaque fixture (Tasks 2 et 3) :

- DAO 1 : les 5 pièces requises, les 4 critères avec pondération (20/30/30/20), le délai (15 octobre 2026), le sommaire technique/financier sont-ils tous retrouvés sans invention ?
- DAO 2 : les sous-critères du tableau à cellules fusionnées sont-ils rattachés au bon critère parent, ou le Markdown a-t-il perdu cette structure ?
- DAO 3 : le contenu de la page 1 (acheteur, secteur, délai, montant de caution) apparaît-il dans le Markdown final malgré l'absence de texte sélectionnable dans le PDF source ?

Rapporter le verdict qualitatif à l'utilisateur (approche assez solide pour construire l'infrastructure dessus, ou ajustements nécessaires) — c'est une décision humaine, pas un critère automatisé (voir le spec, section "Sortie et critères de succès").

---
