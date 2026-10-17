"""Build printable teacher instructions and the threat-model paper with ReportLab."""
from pathlib import Path
import re
import sys
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph

root = Path.cwd()
font_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Arial', str(font_dir / 'arial.ttf')))
pdfmetrics.registerFont(TTFont('Arial-Bold', str(font_dir / 'arialbd.ttf')))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial', boldItalic='Arial-Bold')
out = root / 'output/pdf'
out.mkdir(parents=True, exist_ok=True)
forest = colors.HexColor('#123b32')
ink = colors.HexColor('#172c27')
body = ParagraphStyle('Body', fontName='Arial', fontSize=10.5, leading=15, textColor=ink, spaceAfter=9)
title = ParagraphStyle('Title', parent=body, fontName='Arial-Bold', fontSize=20, leading=25, textColor=forest, spaceAfter=16)

def put(pdf, text, x, top, width, style=body):
    paragraph = Paragraph(text, style)
    _, height = paragraph.wrap(width, 900)
    if top-height < 44:
        raise ValueError('Handout panel content exceeds printable bounds')
    paragraph.drawOn(pdf, x, top-height)
    return top-height-style.spaceAfter

pages = [
    [
        ('Recovery', [
            '<b>Keep an independent backup</b>',
            'Download the encrypted backup after class. Check that the file exists in browser downloads. Copy it to an approved location outside the recording device.',
            '<b>Restore safely</b>',
            'Lock teacher records. Choose the backup, enter its PIN and acknowledge replacement. The browser validates before replacing records.',
            'A forgotten PIN cannot be reset to decrypt old records. Never clear website data as a routine repair.',
            'Reports contain personal data. Follow the institution\'s handling and retention rules.',
        ]),
        ('Before class', [
            'Open the institution\'s HTTPS website while connected. No application installation is required.',
            'Use Check offline readiness, then reopen the prepared browser without a connection.',
            'Confirm camera capability, the correct roster and an available manual fallback.',
            'Use a long random Master PIN and protect the device. Short PINs offer limited resistance to offline guessing.',
            'Browser persistence can be denied. Cached resources and local records can be cleared.',
            'For full instructions, use Teacher & student guide in the website footer.',
        ]),
        ('Attendance Desk', [
            '<b>Teacher quick-start</b>',
            'Browser-based QR attendance',
            'Prepare the website, record attendance, review exceptions and protect your records.',
            '<b>Identity remains a teacher check</b>',
            'An ID, shared room challenge and rotating QR do not prove who is presenting the pass.',
            'Use synthetic records for demonstrations and physical-device tests.',
        ]),
    ],
    [
        ('1  Set up the class', [
            'Unlock Teacher workspace with your Master PIN.',
            'Import CSV with <b>id,name,section</b> headers. Confirm encoding, names, original IDs and normalized collisions in the preview.',
            'Create a session for the correct course and section. Institution, subject and room improve reports.',
            'Verify the start time, displayed timezone and grace period. Announce the room challenge.',
            'Only one session can be active in this browser.',
        ]),
        ('2  Record attendance', [
            'Start the camera. Use the compatibility decoder if needed. Torch and camera choices depend on the browser.',
            'Verify the student and scan the pass. <b>Saved</b> follows a completed database transaction. Retry <b>Not saved</b> outcomes.',
            'Use <b>Manual check-in / correction (F2)</b> for unavailable devices, excusals or status changes. Enter a reason.',
            'For a disputed duplicate, flag the check-in, check identity and record a resolution. First and second presentation times remain available.',
        ]),
        ('3  Review and close', [
            'Review not-yet-recorded students and resolve disputes. Open disputes block closure.',
            'Confirm closure to mark remaining students absent. Closed sessions are read-only.',
            'To change a closed session, reopen with a reason. Automatic closure absences return to unrecorded. Explicit teacher decisions remain.',
            'Download Excel for summary, roster and audit history, or CSV for the administrative roster.',
            'Download an encrypted backup. Confirm all downloaded files actually saved.',
        ]),
    ],
]
width, height = landscape(A4)
pdf = canvas.Canvas(str(out / 'teacher-quick-start.pdf'), pagesize=(width,height))
pdf.setTitle('Attendance Desk teacher quick-start')
for page_number, panels in enumerate(pages, 1):
    for index,(heading,paragraphs) in enumerate(panels):
        x=index*width/3+24
        top=height-44
        top=put(pdf,escape(heading),x,top,width/3-48,title)
        for paragraph in paragraphs:
            top=put(pdf,paragraph,x,top,width/3-48)
        pdf.setFont('Arial',8)
        pdf.setFillColor(colors.HexColor('#52655e'))
        pdf.drawString(x,25,('Outside' if page_number==1 else 'Inside')+f' / panel {index+1}')
    pdf.setStrokeColor(colors.HexColor('#c5ccc7'))
    pdf.setDash(2,5)
    for line in [width/3,2*width/3]:pdf.line(line,25,line,height-25)
    pdf.setDash()
    pdf.showPage()
pdf.save()

styles=getSampleStyleSheet()
styles.add(ParagraphStyle('PaperTitle',parent=title,fontSize=24,leading=30,spaceAfter=20))
styles.add(ParagraphStyle('PaperHeading',parent=title,fontSize=14,leading=19,spaceBefore=14,spaceAfter=9,keepWithNext=True))
styles.add(ParagraphStyle('PaperBody',parent=body,fontSize=10,leading=14,spaceAfter=7))
story=[]
source=(root/'docs/threat-model.md').read_text(encoding='utf-8')
def inline(value):
    value=escape(value).replace('\u2014','-').replace('\u2013','-')
    return re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',value)
for line in source.splitlines():
    line=line.strip()
    if not line:continue
    if line.startswith('| ---') or line.startswith('| Threat |'):continue
    if line.startswith('# '):story.append(Paragraph(inline(line[2:]),styles['PaperTitle']))
    elif line.startswith('## '):story.append(Paragraph(inline(line[3:]),styles['PaperHeading']))
    elif line.startswith('|'):
        cells=[cell.strip() for cell in line.strip('|').split('|')]
        story.append(Paragraph('<b>'+inline(cells[0])+'</b><br/>Control: '+inline(cells[1])+'<br/>Remaining exposure: '+inline(cells[2]),styles['PaperBody']))
    else:story.append(Paragraph(inline(line.lstrip('- ')),styles['PaperBody']))
def footer(pdf,doc):
    pdf.setFont('Arial',8);pdf.setFillColor(colors.HexColor('#52655e'))
    pdf.drawString(45,25,'Attendance Desk / threat model and privacy controls')
    pdf.drawRightString(A4[0]-45,25,str(doc.page))
doc=SimpleDocTemplate(str(out/'threat-model.pdf'),pagesize=A4,rightMargin=45,leftMargin=45,topMargin=44,bottomMargin=48,title='Attendance Desk threat model and privacy controls')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Created teacher quick-start and threat-model PDFs.')
