"""
services/email_service.py – Password-reset email delivery.

Behavior:
  - In development (no SMTP configured): prints the reset link to the server console
    so you can test the password reset flow without a real mail server.
  - In production (SMTP configured in .env): sends a styled HTML email via SMTP/TLS.

To configure production email, set these variables in backend/.env:
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your-email@gmail.com
    SMTP_PASSWORD=your-app-password
    SMTP_FROM=noreply@yourapp.com
"""

import smtplib                           # Python stdlib: low-level email sending
import logging
from email.mime.multipart import MIMEMultipart  # for building multi-part emails (HTML + plain text)
from email.mime.text import MIMEText           # wraps HTML or plain text content

from app.config import get_settings

logger = logging.getLogger(__name__)    # module-level logger (appears as "services.email_service" in logs)
settings = get_settings()               # loads SMTP settings from .env


def _build_reset_html(reset_link: str, full_name: str) -> str:
    """
    Builds the HTML body for the password reset email.

    The email has:
      - A dark-themed header with the title "Reset Your Password"
      - A personalized greeting using the user's full name
      - A large clickable "Reset Password" button
      - The raw link in case the button doesn't work (some email clients block buttons)
      - A note explaining the 1-hour expiry and that ignored emails are safe

    Uses Python f-strings — double curly braces {{ }} produce literal { } in HTML/CSS.
    """
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
    Send a password-reset email to the given address.

    Always logs the link to the console first (useful for development).
    Then attempts SMTP delivery only if smtp_host and smtp_user are set in .env.

    Args:
        to_email:    the recipient's email address
        reset_link:  the full URL including the token (e.g. http://localhost:5173/reset-password?token=abc)
        full_name:   used in the personalized greeting ("Hi Alice,")
    """
    # ── Always print to console for easy local testing ─────────────────────────
    # In development, just copy this link from the server terminal to test the reset flow
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

    # ── Skip SMTP if not configured ────────────────────────────────────────────
    # smtp_host and smtp_user must both be set in .env to trigger email delivery
    if not settings.smtp_host or not settings.smtp_user:
        logger.info("[Email] SMTP not configured – using console-only mode.")
        return  # console-only in development is fine

    # ── Build and send the email via SMTP/TLS ─────────────────────────────────
    try:
        # MIMEMultipart("alternative") allows both HTML and plain-text fallback versions
        # Most email clients will display the HTML version if supported
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your HireNetAI password"
        msg["From"] = settings.smtp_from or settings.smtp_user   # sender name/address
        msg["To"] = to_email

        # Attach the HTML body to the email
        html_body = _build_reset_html(reset_link, full_name)
        msg.attach(MIMEText(html_body, "html"))

        # Connect to the SMTP server and send
        # smtplib.SMTP is a context manager — the connection is closed automatically
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()       # identify ourselves to the server (required before STARTTLS)
            server.starttls()   # upgrade the connection to TLS encryption
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], [to_email], msg.as_string())

        logger.info("[Email] Reset email sent to %s via SMTP.", to_email)

    except Exception as exc:
        # Log the error but DON'T raise — the reset link was already printed to console,
        # so developers can still test the flow even if email delivery fails
        logger.error("[Email] Failed to send email to %s: %s", to_email, exc)
