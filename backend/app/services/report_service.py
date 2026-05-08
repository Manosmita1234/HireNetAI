"""
services/report_service.py – PDF report generation using ReportLab.

ReportLab is a Python library for generating PDF files programmatically.
Instead of templates, it works by building a list of "flowable" elements
(paragraphs, tables, spacers, horizontal rules) and then "building"
(rendering) them all at once into a PDF file.

The generated PDF contains:
  1. A header with the candidate's name, email, session ID, and dates
  2. A "Final Evaluation" box with the overall score and recommendation
  3. One section per answer with:
       - The question text
       - The transcript (what the candidate said)
       - An emotion analysis table (emotion distribution + confidence/hesitation)
       - An LLM evaluation table (clarity, logic, relevance, etc.)
       - Strengths, weaknesses, and GPT reasoning paragraph
       - The answer's final score
  4. A footer with the generation timestamp

The PDF bytes are returned and sent as a downloadable file
via the GET /admin/session/{session_id}/report endpoint.
"""

import io                      # io.BytesIO: an in-memory file buffer so we don't need a temp file
from datetime import datetime
from typing import Any, List

# ReportLab imports:
from reportlab.lib import colors                             # color constants and HexColor
from reportlab.lib.pagesizes import A4                      # standard A4 page dimensions
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # text styles
from reportlab.lib.units import cm                           # centimeter unit for margins/sizes
from reportlab.platypus import (
    SimpleDocTemplate,   # the document builder
    Paragraph,           # a block of styled text
    Spacer,              # vertical whitespace
    Table,               # a grid of cells
    TableStyle,          # styling rules for a Table
    HRFlowable,          # a horizontal line (HR = "Horizontal Rule")
    PageBreak,           # forces a new page
)

from app.models.interview import InterviewSession

# ── Color palette ──────────────────────────────────────────────────────────────
# These colors match the HireNetAI brand's indigo/violet theme.
PRIMARY   = colors.HexColor("#4F46E5")  # indigo-600 (main brand color)
SECONDARY = colors.HexColor("#7C3AED")  # violet-600
LIGHT_BG  = colors.HexColor("#F5F3FF")  # violet-50 (very light purple for table backgrounds)
DARK_TEXT = colors.HexColor("#1E1B4B")  # indigo-950 (main text color)
ACCENT    = colors.HexColor("#10B981")  # emerald-500 (used for "Highly Recommended")
WARN      = colors.HexColor("#EF4444")  # red-500 (used for "Not Recommended")


def _verdict_color(verdict: str) -> Any:
    """
    Returns the ReportLab color for a given hiring verdict string.
    Used to color-code the recommendation in the final score box.

    Highly Recommended → green (ACCENT)
    Recommended        → blue
    Average            → amber/yellow
    Not Recommended    → red (WARN)
    """
    mapping = {
        "Highly Recommended": ACCENT,
        "Recommended":        colors.HexColor("#3B82F6"),  # blue-500
        "Average":            colors.HexColor("#F59E0B"),  # amber-500
        "Not Recommended":    WARN,
    }
    return mapping.get(verdict, DARK_TEXT)


def generate_pdf_report(session: InterviewSession) -> bytes:
    """
    Builds a complete PDF report for the given InterviewSession and returns it as bytes.

    How ReportLab works:
      1. Create a SimpleDocTemplate (defines page size, margins, metadata)
      2. Build a list of "flowable" elements in order (paragraphs, tables, etc.)
      3. Call doc.build(elements) which renders all elements into the PDF
      4. Read the bytes from the BytesIO buffer and return them

    The caller (admin.py) returns these bytes directly as an HTTP Response.
    """
    # BytesIO is an in-memory file object — ReportLab writes the PDF bytes here
    # instead of writing to disk (faster, no temp file cleanup needed)
    buffer = io.BytesIO()

    # SimpleDocTemplate: the top-level PDF document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Interview Report – {session.candidate_name}",  # PDF metadata title
    )

    # getSampleStyleSheet() returns built-in styles like "Heading1", "Normal", etc.
    styles = getSampleStyleSheet()
    elements: List[Any] = []  # the ordered list of flowables to render

    # ── Custom text styles ─────────────────────────────────────────────────────
    # ParagraphStyle inherits from a base style and overrides specific properties
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=PRIMARY,   fontSize=20, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=SECONDARY, fontSize=14, spaceAfter=4)
    normal = ParagraphStyle("normal", parent=styles["Normal"], textColor=DARK_TEXT, fontSize=10, leading=14)
    small  = ParagraphStyle("small",  parent=styles["Normal"], textColor=colors.grey, fontSize=8)
    bold   = ParagraphStyle("bold",   parent=styles["Normal"], textColor=DARK_TEXT,   fontSize=10, fontName="Helvetica-Bold")

    # ── SECTION 1: Report Header ───────────────────────────────────────────────
    elements.append(Paragraph("🎯 HireNetAI – Interview Evaluation Report", h1))
    # HRFlowable: a horizontal line (like <hr> in HTML)
    elements.append(HRFlowable(width="100%", thickness=2, color=PRIMARY))
    elements.append(Spacer(1, 0.4 * cm))

    # Candidate info 3-row table (Candidate, Session ID, Dates)
    def _fmt_dt(dt):
        if dt is None:
            return "—"
        if isinstance(dt, datetime):
            return dt.strftime("%Y-%m-%d %H:%M UTC")
        return str(dt)

    info_data = [
        ["Candidate", session.candidate_name,  "Email",     session.candidate_email],
        ["Session ID", str(session.id)[:24],   "Status",    session.status.title()],
        ["Started",    _fmt_dt(session.started_at), "Completed", _fmt_dt(session.completed_at)],
    ]
    # colWidths: controls the width of each column (in cm)
    info_table = Table(info_data, colWidths=[3 * cm, 7 * cm, 3 * cm, 5 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),        # light purple background for all cells
        ("TEXTCOLOR", (0, 0), (0, -1), SECONDARY),          # left label column → violet text
        ("TEXTCOLOR", (2, 0), (2, -1), SECONDARY),          # 3rd label column → violet text
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),    # bold labels in column 0
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),    # bold labels in column 2
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG, colors.white]),  # alternating row colors
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),  # thin grey borders
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 0.5 * cm))

    # ── SECTION 2: Final Score Box ─────────────────────────────────────────────
    elements.append(Paragraph("📊 Final Evaluation", h2))
    verdict_color = _verdict_color(session.category)
    score_data = [[
        Paragraph("<b>Final Score</b>", bold),
        Paragraph(f"<b>{session.final_score} / 10</b>", bold),
        Paragraph("<b>Recommendation</b>", bold),
        # hexval() returns the hex color as a string; [1:] strips the leading "#"
        Paragraph(f'<font color="#{verdict_color.hexval()[1:]}">{session.category}</font>', bold),
    ]]
    score_table = Table(score_data, colWidths=[4 * cm, 4 * cm, 5 * cm, 5 * cm])
    score_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EDE9FE")),  # light violet background
        ("GRID", (0, 0), (-1, -1), 0.5, PRIMARY),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 0.8 * cm))

    # ── SECTION 3: Per-Answer Details ─────────────────────────────────────────
    # enumerate(session.answers, start=1) → (1, answer1), (2, answer2), ...
    for idx, answer in enumerate(session.answers, start=1):
        elements.append(Paragraph(f"📝 Answer {idx}: {answer.question_text}", h2))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
        elements.append(Spacer(1, 0.2 * cm))

        # Transcript (what the candidate said)
        elements.append(Paragraph("<b>Transcript</b>", bold))
        transcript_text = answer.transcript or "(No transcript)"
        elements.append(Paragraph(transcript_text, normal))
        elements.append(Spacer(1, 0.3 * cm))

        # Emotion distribution table (only if emotion data is available)
        if answer.emotion_distribution:
            elements.append(Paragraph("<b>Emotion Analysis</b>", bold))

            # Header row for the two-part table (emotions on left, score metrics on right)
            emo_rows = [["Emotion", "Distribution (%)", "", "Score Metrics", ""]]

            # Sort emotions by percentage descending (most dominant first)
            emo_items = sorted(answer.emotion_distribution.items(), key=lambda x: -x[1])

            # Fixed list of score metrics to show on the right side of the table
            metrics = [
                ("Confidence Index",  f"{answer.confidence_index:.1f} / 10"),
                ("Nervousness Score", f"{answer.nervousness_score:.1f} / 10"),
                ("Hesitation Score",  f"{answer.hesitation_score:.1f} / 10"),
                ("Long Pauses",       str(answer.pause_count)),
            ]

            # Build rows: combine emotion list and metrics list side by side
            max_rows = max(len(emo_items), len(metrics))
            for i in range(max_rows):
                emo_name = f"{emo_items[i][0].title()}" if i < len(emo_items) else ""
                emo_val  = f"{emo_items[i][1]:.1f}%"   if i < len(emo_items) else ""
                m_name   = metrics[i][0]  if i < len(metrics) else ""
                m_val    = metrics[i][1]  if i < len(metrics) else ""
                emo_rows.append([emo_name, emo_val, "", m_name, m_val])

            emo_table = Table(emo_rows, colWidths=[4 * cm, 3 * cm, 0.5 * cm, 5 * cm, 3 * cm])
            emo_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (1, 0), PRIMARY),     # left header: indigo
                ("BACKGROUND", (3, 0), (4, 0), SECONDARY),   # right header: violet
                ("TEXTCOLOR", (0, 0), (4, 0), colors.white), # white header text
                ("FONTNAME", (0, 0), (4, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (1, -1), [colors.white, LIGHT_BG]),  # alternating rows (left)
                ("ROWBACKGROUNDS", (3, 1), (4, -1), [colors.white, LIGHT_BG]),  # alternating rows (right)
                ("GRID", (0, 0), (1, -1), 0.5, colors.lightgrey),
                ("GRID", (3, 0), (4, -1), 0.5, colors.lightgrey),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]))
            elements.append(emo_table)
            elements.append(Spacer(1, 0.3 * cm))

        # LLM evaluation table (only if GPT evaluation was completed)
        if answer.llm_evaluation:
            ev = answer.llm_evaluation
            elements.append(Paragraph("<b>LLM Evaluation</b>", bold))
            llm_rows = [
                ["Clarity",       f"{ev.clarity_score}/10",    "Confidence", f"{ev.confidence_score}/10"],
                ["Logic",         f"{ev.logic_score}/10",       "Relevance",  f"{ev.relevance_score}/10"],
                ["Communication", ev.communication_level,       "Overall",    f"{ev.overall_score}/10"],
            ]
            llm_table = Table(llm_rows, colWidths=[4 * cm, 3.5 * cm, 4 * cm, 3.5 * cm])
            llm_table.setStyle(TableStyle([
                ("TEXTCOLOR", (0, 0), (0, -1), SECONDARY),          # label column → violet
                ("TEXTCOLOR", (2, 0), (2, -1), SECONDARY),          # 3rd column → violet
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]))
            elements.append(llm_table)
            elements.append(Spacer(1, 0.2 * cm))

            # Written evaluation from GPT (strengths, weaknesses, reasoning)
            if ev.strengths:
                # Join list items with bullet separators into one paragraph
                elements.append(Paragraph("<b>Strengths:</b> " + " • ".join(ev.strengths), normal))
            if ev.weaknesses:
                elements.append(Paragraph("<b>Weaknesses:</b> " + " • ".join(ev.weaknesses), normal))
            if ev.reasoning:
                elements.append(Paragraph(f"<b>Reasoning:</b> {ev.reasoning}", normal))

        elements.append(Spacer(1, 0.3 * cm))

        # Answer weighted score display
        elements.append(Paragraph(f"<b>Answer Score:</b> {answer.answer_final_score:.2f} / 10", bold))
        elements.append(Spacer(1, 0.5 * cm))

        # Insert a page break between answers, but NOT after the last answer
        if idx < len(session.answers):
            elements.append(PageBreak())

    # ── SECTION 4: Footer ─────────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(
        f"Generated by HireNetAI on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        small,
    ))

    # Render all elements into the BytesIO buffer
    doc.build(elements)

    # Return the raw PDF bytes for the HTTP response
    return buffer.getvalue()
