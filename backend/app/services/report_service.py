"""
services/report_service.py – PDF report generation using ReportLab.

Generates a full candidate evaluation PDF including:
  - Session metadata
  - Per-answer transcript + emotion + LLM data
  - Final score and recommendation
"""

import io
from datetime import datetime
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from app.models.interview import InterviewSession


# ── Color palette ──────────────────────────────────────────────────────────────
PRIMARY = colors.HexColor("#4F46E5")      # indigo-600
SECONDARY = colors.HexColor("#7C3AED")   # violet-600
LIGHT_BG = colors.HexColor("#F5F3FF")    # violet-50
DARK_TEXT = colors.HexColor("#1E1B4B")   # indigo-950
ACCENT = colors.HexColor("#10B981")      # emerald-500
WARN = colors.HexColor("#EF4444")        # red-500


def _verdict_color(verdict: str) -> Any:
    mapping = {
        "Highly Recommended": ACCENT,
        "Recommended": colors.HexColor("#3B82F6"),
        "Average": colors.HexColor("#F59E0B"),
        "Not Recommended": WARN,
    }
    return mapping.get(verdict, DARK_TEXT)


def generate_pdf_report(session: InterviewSession) -> bytes:
    """
    Build a PDF report for the given InterviewSession and return it as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Interview Report – {session.candidate_name}",
    )

    styles = getSampleStyleSheet()
    elements: List[Any] = []

    # ── Helper styles ────────────────────────────────────────────────────────
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=PRIMARY, fontSize=20, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=SECONDARY, fontSize=14, spaceAfter=4)
    normal = ParagraphStyle("normal", parent=styles["Normal"], textColor=DARK_TEXT, fontSize=10, leading=14)
    small = ParagraphStyle("small", parent=styles["Normal"], textColor=colors.grey, fontSize=8)
    bold = ParagraphStyle("bold", parent=styles["Normal"], textColor=DARK_TEXT, fontSize=10, fontName="Helvetica-Bold")

    # ─────────────────────────────────────────────────────────────────────────
    # HEADER
    # ─────────────────────────────────────────────────────────────────────────
    elements.append(Paragraph("🎯 HireNetAI – Interview Evaluation Report", h1))
    elements.append(HRFlowable(width="100%", thickness=2, color=PRIMARY))
    elements.append(Spacer(1, 0.4 * cm))

    # Candidate info table
    info_data = [
        ["Candidate", session.candidate_name, "Email", session.candidate_email],
        ["Session ID", str(session.id)[:24], "Status", session.status.title()],
        ["Started", session.started_at.strftime("%Y-%m-%d %H:%M UTC") if session.started_at else "—",
         "Completed", session.completed_at.strftime("%Y-%m-%d %H:%M UTC") if session.completed_at else "—"],
    ]
    info_table = Table(info_data, colWidths=[3 * cm, 7 * cm, 3 * cm, 5 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("TEXTCOLOR", (0, 0), (0, -1), SECONDARY),
        ("TEXTCOLOR", (2, 0), (2, -1), SECONDARY),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 0.5 * cm))

    # ─────────────────────────────────────────────────────────────────────────
    # FINAL SCORE BOX
    # ─────────────────────────────────────────────────────────────────────────
    elements.append(Paragraph("📊 Final Evaluation", h2))
    verdict_color = _verdict_color(session.category)
    score_data = [
        [
            Paragraph(f"<b>Final Score</b>", bold),
            Paragraph(f"<b>{session.final_score} / 10</b>", bold),
            Paragraph(f"<b>Recommendation</b>", bold),
            Paragraph(f'<font color="#{verdict_color.hexval()[1:]}">{session.category}</font>', bold),
        ]
    ]
    score_table = Table(score_data, colWidths=[4 * cm, 4 * cm, 5 * cm, 5 * cm])
    score_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EDE9FE")),
        ("GRID", (0, 0), (-1, -1), 0.5, PRIMARY),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 0.8 * cm))

    # ─────────────────────────────────────────────────────────────────────────
    # PER-ANSWER SECTIONS
    # ─────────────────────────────────────────────────────────────────────────
    for idx, answer in enumerate(session.answers, start=1):
        elements.append(Paragraph(f"📝 Answer {idx}: {answer.question_text}", h2))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
        elements.append(Spacer(1, 0.2 * cm))

        # Transcript
        elements.append(Paragraph("<b>Transcript</b>", bold))
        transcript_text = answer.transcript or "(No transcript)"
        elements.append(Paragraph(transcript_text, normal))
        elements.append(Spacer(1, 0.3 * cm))

        # Emotion distribution table
        if answer.emotion_distribution:
            elements.append(Paragraph("<b>Emotion Analysis</b>", bold))
            emo_rows = [["Emotion", "Distribution (%)", "", "Score Metrics", ""]]
            emo_items = sorted(answer.emotion_distribution.items(), key=lambda x: -x[1])
            metrics = [
                ("Confidence Index", f"{answer.confidence_index:.1f} / 10"),
                ("Nervousness Score", f"{answer.nervousness_score:.1f} / 10"),
                ("Hesitation Score", f"{answer.hesitation_score:.1f} / 10"),
                ("Long Pauses", str(answer.pause_count)),
            ]
            max_rows = max(len(emo_items), len(metrics))
            for i in range(max_rows):
                emo_name = f"{emo_items[i][0].title()}" if i < len(emo_items) else ""
                emo_val = f"{emo_items[i][1]:.1f}%" if i < len(emo_items) else ""
                m_name = metrics[i][0] if i < len(metrics) else ""
                m_val = metrics[i][1] if i < len(metrics) else ""
                emo_rows.append([emo_name, emo_val, "", m_name, m_val])

            emo_table = Table(emo_rows, colWidths=[4 * cm, 3 * cm, 0.5 * cm, 5 * cm, 3 * cm])
            emo_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (1, 0), PRIMARY),
                ("BACKGROUND", (3, 0), (4, 0), SECONDARY),
                ("TEXTCOLOR", (0, 0), (4, 0), colors.white),
                ("FONTNAME", (0, 0), (4, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (1, -1), [colors.white, LIGHT_BG]),
                ("ROWBACKGROUNDS", (3, 1), (4, -1), [colors.white, LIGHT_BG]),
                ("GRID", (0, 0), (1, -1), 0.5, colors.lightgrey),
                ("GRID", (3, 0), (4, -1), 0.5, colors.lightgrey),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]))
            elements.append(emo_table)
            elements.append(Spacer(1, 0.3 * cm))

        # LLM evaluation
        if answer.llm_evaluation:
            ev = answer.llm_evaluation
            elements.append(Paragraph("<b>LLM Evaluation</b>", bold))
            llm_rows = [
                ["Clarity", f"{ev.clarity_score}/10", "Confidence", f"{ev.confidence_score}/10"],
                ["Logic", f"{ev.logic_score}/10", "Relevance", f"{ev.relevance_score}/10"],
                ["Communication", ev.communication_level, "Overall", f"{ev.overall_score}/10"],
            ]
            llm_table = Table(llm_rows, colWidths=[4 * cm, 3.5 * cm, 4 * cm, 3.5 * cm])
            llm_table.setStyle(TableStyle([
                ("TEXTCOLOR", (0, 0), (0, -1), SECONDARY),
                ("TEXTCOLOR", (2, 0), (2, -1), SECONDARY),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]))
            elements.append(llm_table)
            elements.append(Spacer(1, 0.2 * cm))

            # Strengths & weaknesses
            if ev.strengths:
                elements.append(Paragraph("<b>Strengths:</b> " + " • ".join(ev.strengths), normal))
            if ev.weaknesses:
                elements.append(Paragraph("<b>Weaknesses:</b> " + " • ".join(ev.weaknesses), normal))
            if ev.reasoning:
                elements.append(Paragraph(f"<b>Reasoning:</b> {ev.reasoning}", normal))

        elements.append(Spacer(1, 0.3 * cm))

        # Answer score bar
        elements.append(Paragraph(
            f"<b>Answer Score:</b> {answer.answer_final_score:.2f} / 10", bold
        ))
        elements.append(Spacer(1, 0.5 * cm))

        # Page break between answers (not after last)
        if idx < len(session.answers):
            elements.append(PageBreak())

    # ─────────────────────────────────────────────────────────────────────────
    # FOOTER
    # ─────────────────────────────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(
        f"Generated by HireNetAI on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        small,
    ))

    doc.build(elements)
    return buffer.getvalue()
