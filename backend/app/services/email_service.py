"""
services/email_service.py – Email delivery helper for password-reset links.

When SMTP settings are not configured (default), the reset link is printed
to the backend console so developers can test without a mail server.
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _build_reset_html(reset_link: str, full_name: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {{ font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }}
    .container {{ max-width: 520px; margin: 40px auto; background: #1e293b; border-radius: 16px; overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; }}
    .header h1 {{ margin: 0; color: #fff; font-size: 24px; }}
    .body {{ padding: 32px; }}
    .button {{ display: inline-block; margin: 24px 0; padding: 14px 32px;
               background: linear-gradient(135deg, #6366f1, #8b5cf6);
               color: #fff; text-decoration: none; border-radius: 10px;
               font-weight: bold; font-size: 16px; }}
    .note {{ font-size: 12px; color: #94a3b8; margin-top: 24px; }}
    .link-text {{ word-break: break-all; color: #818cf8; font-size: 12px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Reset Your Password</h1>
    </div>
    <div class="body">
      <p>Hi {full_name},</p>
      <p>We received a request to reset your <strong>HireNetAI</strong> password.
         Click the button below to set a new one. This link expires in <strong>1 hour</strong>.</p>
      <div style="text-align:center;">
        <a class="button" href="{reset_link}">Reset Password</a>
      </div>
      <p>Or copy this link into your browser:</p>
      <p class="link-text">{reset_link}</p>
      <p class="note">If you didn't request this, you can safely ignore this email.
         Your password will not change unless you click the link above.</p>
    </div>
  </div>
</body>
</html>
"""


async def send_reset_email(to_email: str, reset_link: str, full_name: str = "there") -> None:
    """
    Send a password-reset email.

    Falls back to console logging when SMTP is not configured — perfect for
    local development without a mail server.
    """
    # ── Always log to console for dev convenience ─────────────────────────────
    logger.info(
        "\n"
        "=" * 70 + "\n"
        "[DEV] Password reset link for %s:\n"
        "%s\n"
        "=" * 70,
        to_email, reset_link
    )
    print(f"\n{'='*70}")
    print(f"[DEV] Password reset link for {to_email}:")
    print(reset_link)
    print(f"{'='*70}\n")

    # ── Try SMTP if configured ────────────────────────────────────────────────
    if not settings.smtp_host or not settings.smtp_user:
        logger.info("[Email] SMTP not configured – using console-only mode.")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your HireNetAI password"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = to_email

        html_body = _build_reset_html(reset_link, full_name)
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], [to_email], msg.as_string())

        logger.info("[Email] Reset email sent to %s via SMTP.", to_email)

    except Exception as exc:  # noqa: BLE001
        logger.error("[Email] Failed to send email to %s: %s", to_email, exc)
        # Do NOT raise – we still printed the link to console, so dev can continue
