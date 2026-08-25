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
    pdf.close()


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
