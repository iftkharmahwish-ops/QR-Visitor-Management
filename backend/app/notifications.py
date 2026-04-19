from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from pathlib import Path
import ssl

from dotenv import load_dotenv


load_dotenv()


SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME or "noreply@visitor-management.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT", "30"))


def send_registration_email(
    *,
    to_email: str,
    visitor_name: str,
    visitor_id: str,
    purpose: str,
    branch: str,
    visit_date: str,
    qr_code_url: str,
    qr_file_path: str | None = None,
) -> dict:
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD:
        return {
            "sent": False,
            "message": "SMTP is not configured yet. Add SMTP settings to enable real email notifications.",
        }

    message = EmailMessage()
    message["Subject"] = f"Visitor Registration Confirmation - {visitor_id}"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                f"Hello {visitor_name},",
                "",
                "Your visitor registration has been created successfully.",
                f"Visitor ID: {visitor_id}",
                f"Purpose: {purpose}",
                f"Branch: {branch}",
                f"Visit Date: {visit_date}",
                f"QR Code: {qr_code_url}",
                "",
                "Please show this QR code at the security desk for check-in and check-out.",
            ]
        )
    )

    if qr_file_path and Path(qr_file_path).exists():
        qr_bytes = Path(qr_file_path).read_bytes()
        message.add_attachment(
            qr_bytes,
            maintype="image",
            subtype="png",
            filename=f"{visitor_id}-qr.png",
        )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as server:
            server.ehlo()
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return {"sent": True, "message": f"Notification email sent successfully to {to_email}."}
    except Exception as exc:
        return {"sent": False, "message": f"Email sending failed: {exc}"}
