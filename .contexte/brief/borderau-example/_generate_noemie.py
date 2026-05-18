"""Generates a simulated NOEMIE PDF for Elisabeth Cyprien's rattrapage invoices.

Data verified against the REAL rattrapage parser:
- 134 passages total, 11 invoices
- Total: 2156.37 €
- 10/11 invoices marked paid (~94% by amount)
- Invoice 4225 left out (CHOSSIS, March-April 2026, normal payment delay)

CRITICAL: FSE detail lines must be a single text run matching parse-noemie.ts regex.
Verified end-to-end with the real pdf-parse npm library.
"""
import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.units import mm
from pypdf import PdfReader

FINESS = "136427150"

# Real data from running parseRattrapages on the real PDF
factures = {
    "4221": {"patient": "CHOSSIS ALAIN",      "immatric": "175011305512341", "ne_le": "12/07/1937", "total": 123.20, "date_facture": "01/09/2025", "lot": "042"},
    "4223": {"patient": "CHOSSIS ALAIN",      "immatric": "175011305512341", "ne_le": "12/07/1937", "total": 299.20, "date_facture": "09/10/2025", "lot": "045"},
    "4236": {"patient": "REBOUL ANTOINETTE",  "immatric": "235011308842153", "ne_le": "03/05/1935", "total": 307.10, "date_facture": "20/03/2026", "lot": "058"},
    "4237": {"patient": "REBOUL ANTOINETTE",  "immatric": "235011308842153", "ne_le": "03/05/1935", "total": 119.35, "date_facture": "20/03/2026", "lot": "059"},
    "4240": {"patient": "REMADNIA FATIMA",    "immatric": "252019912703472", "ne_le": "18/02/1952", "total": 164.80, "date_facture": "31/08/2025", "lot": "041"},
    "4241": {"patient": "REMADNIA FATIMA",    "immatric": "252019912703472", "ne_le": "18/02/1952", "total":  49.24, "date_facture": "31/08/2025", "lot": "041"},
    "4244": {"patient": "REMADNIA FATIMA",    "immatric": "252019912703472", "ne_le": "18/02/1952", "total": 184.65, "date_facture": "20/03/2026", "lot": "055"},
    "4245": {"patient": "REMADNIA FATIMA",    "immatric": "252019912703472", "ne_le": "18/02/1952", "total": 530.00, "date_facture": "20/03/2026", "lot": "056"},
    "4246": {"patient": "TOURNIER CLAUDIE",   "immatric": "247011305488214", "ne_le": "15/07/1947", "total":  28.35, "date_facture": "20/12/2025", "lot": "051"},
    "4247": {"patient": "TOURNIER CLAUDIE",   "immatric": "247011305488214", "ne_le": "15/07/1947", "total": 228.73, "date_facture": "22/12/2025", "lot": "052"},
    # 4225 deliberately omitted — left unpaid
}

# Realistic batches: group invoices by patient/period
batches = [
    ("03/09/2025", "CPAM 131 MARSEILLE - 0000001364271500245010125 0903", "CPAM 131 MARSEILLE", ["4240", "4241"]),
    ("19/09/2025", "CPAM 131 MARSEILLE - 0000001364271500259010125 0919", "CPAM 131 MARSEILLE", ["4221"]),
    ("22/10/2025", "CPAM 131 MARSEILLE - 0000001364271500276010125 1022", "CPAM 131 MARSEILLE", ["4223"]),
    ("19/01/2026", "CPAM 131 MARSEILLE - 0000001364271500311010126 0119", "CPAM 131 MARSEILLE", ["4246", "4247"]),
    ("18/03/2026", "CPAM 131 MARSEILLE - 0000001364271500347010126 0318", "CPAM 131 MARSEILLE", ["4244", "4245"]),
    ("02/04/2026", "CPAM 131 MARSEILLE - 0000001364271500358010126 0402", "CPAM 131 MARSEILLE", ["4236", "4237"]),
]

OUT = "Retours NOEMIE Cyprien (simule).pdf"
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=12*mm, rightMargin=12*mm,
                        topMargin=15*mm, bottomMargin=15*mm)

styles = getSampleStyleSheet()
title_style = ParagraphStyle('title', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=14, spaceAfter=4*mm)
small      = ParagraphStyle('small',  parent=styles['Normal'], fontName='Helvetica',      fontSize=9, leading=11)
small_b    = ParagraphStyle('smallb', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11)
fse_style  = ParagraphStyle('fse',    parent=styles['Normal'], fontName='Helvetica',      fontSize=7, leading=9, wordWrap='None')
fse_hdr    = ParagraphStyle('fsehdr', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7, leading=9)
footer_style = ParagraphStyle('footer', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=9, textColor=colors.grey, alignment=1)

def euro(n):
    s = f"{n:,.2f}".replace(",", " ").replace(".", ",")
    return s + " " + "€"

story = []

# COVER
story.append(Paragraph("Bordereau des retours Noémie", title_style))
story.append(Paragraph("Numéro Finess : " + FINESS, small))
story.append(Paragraph("Période du 01/09/2025 au 02/04/2026", small))
story.append(Spacer(1, 4*mm))

cover_data = [["Date comptable", "Référence de virement", "Organisme payeur", "Nb factures", "Montant facturé", "Montant payé"]]
for date_c, ref, org, invs in batches:
    total = sum(factures[i]["total"] for i in invs)
    cover_data.append([date_c, ref, org, str(len(invs)), euro(total), euro(total)])

cover_tbl = Table(cover_data, colWidths=[22*mm, 70*mm, 32*mm, 17*mm, 22*mm, 22*mm])
cover_tbl.setStyle(TableStyle([
    ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 8),
    ('FONT', (0,1), (-1,-1), 'Helvetica', 7),
    ('GRID', (0,0), (-1,-1), 0.3, colors.lightgrey),
    ('ALIGN', (3,0), (5,-1), 'RIGHT'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F3F4F6')),
    ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ('TOPPADDING', (0,0), (-1,-1), 3),
]))
story.append(cover_tbl)
story.append(Spacer(1, 8*mm))
story.append(Paragraph("Document édité par OZZEN SAS le 18/05/2026 09:30 — Ozzen, 25 Boulevard de la Chapelle, 75010 Paris — RCS Paris 889 682 142 avec N° de TVA FR64889682142", footer_style))

# DETAIL PAGES
for date_c, ref, org, invs in batches:
    story.append(PageBreak())
    total = sum(factures[i]["total"] for i in invs)

    story.append(Paragraph("Date comptable du : " + date_c, small_b))
    story.append(Paragraph("Référence de virement : " + ref, small))
    story.append(Paragraph("Montant facturé : " + euro(total), small))
    story.append(Paragraph("Montant payé : " + euro(total), small))
    fact_word = "facture" if len(invs) == 1 else "factures"
    story.append(Paragraph(str(len(invs)) + " " + fact_word, small))
    story.append(Paragraph("Numéro Finess : " + FINESS, small))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph("Facture n°    Lot n°  Assuré              Immatriculation     Ben. né le - rang   Date facture  État            Montant facturé   Montant payé", fse_hdr))
    story.append(Spacer(1, 1*mm))

    for inv in invs:
        f = factures[inv]
        amt = euro(f["total"])
        line = (
            "FSE " + inv + f["lot"]
            + f["patient"]
            + f["immatric"]
            + f["ne_le"]
            + "  1"
            + f["date_facture"]
            + "Vir. effectué"
            + amt
            + amt
        )
        story.append(Paragraph(line, fse_style))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Document édité par OZZEN SAS le 18/05/2026 09:30 — Ozzen, 25 Boulevard de la Chapelle, 75010 Paris — RCS Paris 889 682 142 avec N° de TVA FR64889682142", footer_style))

doc.build(story)

# Sanity verify with parser regex
r = PdfReader(OUT)
full_text = ""
for p in r.pages:
    full_text += p.extract_text() + "\n"

FACTURE_LINE_NUMERIC_LOT = re.compile(
    r"^(FSE|DRE)\s+(\d{5,7})([A-Za-zÀ-ü][A-Za-zÀ-ü\s'-]*?)(\d{13,15})(\d{2}\/\d{2}\/\d{4})\s+(\d)(\d{2}\/\d{2}\/\d{4})(Vir\. effectué|Rejeté)([\d\s,]+€)([\d\s,]+€)$"
)

matches = []
for ln in full_text.split("\n"):
    s = ln.strip()
    m = FACTURE_LINE_NUMERIC_LOT.match(s)
    if m:
        matches.append({"invoice": m.group(2)[:-3], "name": m.group(3).strip(), "amt": m.group(10)})

expected = sorted(factures.keys())
got = sorted(set(m["invoice"] for m in matches))
print("Expected invoices: " + str(expected))
print("Matched invoices : " + str(got))
print("OK" if expected == got else "!! MISMATCH !!")
total_paid = sum(f["total"] for f in factures.values())
print(f"Total paid (this PDF): {total_paid:.2f} €")
print(f"Total billed (rattrapage Cyprien): 2156.37 €")
print(f"Unpaid (left in 4225): 121.75 €")
print(f"Coverage: {100 * total_paid / 2156.37:.1f}%")
