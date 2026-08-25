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
        "Direction Générale des Infrastructures Routières",
        "La Direction Générale des Infrastructures Routières (DGIR) lance un appel "
        "d'offres national pour les travaux de réhabilitation de la voirie urbaine "
        "du quartier Adjamé-Bracodi, commune d'Adjamé, Abidjan.",
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
        "Direction Générale de l'Énergie",
        "La Direction Générale de l'Énergie lance un appel d'offres national pour "
        "la construction d'un poste de transformation électrique à Yamoussoukro.",
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
