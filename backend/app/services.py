from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import qrcode
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pymongo import ReturnDocument

from .models import AuthenticatedUser, VisitorRecord, VisitorRegistrationRequest
from .storage import (
    QR_DIR,
    get_users_collection,
    get_visitors_collection,
    hash_password,
    serialize_document,
)


TOKEN_SECRET = "qr-visitor-management-major-project"
TOKEN_SALT = "admin-auth"
token_serializer = URLSafeTimedSerializer(TOKEN_SECRET)


def now_utc() -> datetime:
    return datetime.now(UTC)


def create_visitor_id() -> str:
    stamp = datetime.now().strftime("%Y%m%d")
    token = uuid4().hex[:6].upper()
    return f"VIS-{stamp}-{token}"


def build_qr_payload(visitor_id: str, payload: VisitorRegistrationRequest) -> dict:
    return {
        "visitorId": visitor_id,
        "fullName": payload.full_name,
        "phone": payload.phone,
        "email": payload.email,
        "company": payload.company,
        "purpose": payload.purpose,
        "employeeToMeet": payload.employee_to_meet,
        "branch": payload.branch,
        "visitDate": payload.visit_date,
        "issuedAt": now_utc().isoformat(),
        "status": "Pre-Approved",
    }


def generate_qr_image(qr_payload: dict, file_path: Path) -> None:
    image = qrcode.make(json.dumps(qr_payload))
    image.save(file_path)


def authenticate_user(username: str, password: str) -> dict | None:
    row = get_users_collection().find_one({"username": username})
    if not row or row["password_hash"] != hash_password(password):
        return None
    return {"username": row["username"], "role": row["role"]}


def create_auth_token(user: dict) -> str:
    return token_serializer.dumps(user, salt=TOKEN_SALT)


def verify_auth_token(token: str, max_age: int = 60 * 60 * 8) -> AuthenticatedUser | None:
    try:
        data = token_serializer.loads(token, salt=TOKEN_SALT, max_age=max_age)
        return AuthenticatedUser(**data)
    except BadSignature:
        return None


def register_visitor(payload: VisitorRegistrationRequest, base_url: str) -> dict:
    visitor_id = create_visitor_id()
    qr_payload = build_qr_payload(visitor_id, payload)
    qr_filename = f"{visitor_id}.png"
    generate_qr_image(qr_payload, QR_DIR / qr_filename)

    record = VisitorRecord(
        visitor_id=visitor_id,
        qr_code_url=f"{base_url}/api/visitors/{visitor_id}/qr",
        qr_payload=json.dumps(qr_payload),
        status="pre-approved",
        created_at=now_utc(),
        **payload.model_dump(),
    ).model_dump(mode="json")

    get_visitors_collection().insert_one(record)
    return serialize_document(record)


def list_visitors() -> list[dict]:
    rows = get_visitors_collection().find().sort("created_at", -1)
    return [serialize_document(row) for row in rows]


def get_visitor(visitor_id: str) -> dict | None:
    return serialize_document(get_visitors_collection().find_one({"visitor_id": visitor_id}))


def check_in_visitor(visitor_id: str, gate_name: str) -> dict | None:
    checked_in_at = now_utc().isoformat()
    result = get_visitors_collection().find_one_and_update(
        {"visitor_id": visitor_id},
        {"$set": {"status": "checked-in", "checked_in_at": checked_in_at, "gate_name": gate_name}},
        return_document=ReturnDocument.AFTER,
    )
    return serialize_document(result)


def check_out_visitor(visitor_id: str) -> dict | None:
    checked_out_at = now_utc().isoformat()
    result = get_visitors_collection().find_one_and_update(
        {"visitor_id": visitor_id},
        {"$set": {"status": "checked-out", "checked_out_at": checked_out_at}},
        return_document=ReturnDocument.AFTER,
    )
    return serialize_document(result)


def get_qr_file(visitor_id: str) -> Path | None:
    file_path = QR_DIR / f"{visitor_id}.png"
    return file_path if file_path.exists() else None


def build_dashboard() -> dict:
    records = list_visitors()
    statuses = Counter(record["status"] for record in records)
    branch_counts = Counter(record["branch"] for record in records)

    today = datetime.now().date().isoformat()
    visitors_today = [record for record in records if record["visit_date"] == today]
    active_visitors = [record for record in records if record["status"] == "checked-in"]

    return {
        "summary": {
            "total_visitors": len(records),
            "today_registrations": len(visitors_today),
            "checked_in": statuses.get("checked-in", 0),
            "checked_out": statuses.get("checked-out", 0),
            "pre_approved": statuses.get("pre-approved", 0),
        },
        "active_visitors": active_visitors,
        "branch_distribution": dict(branch_counts),
        "recent_visitors": records[:5],
    }


def detect_suspicious_patterns() -> list[dict]:
    records = list_visitors()
    grouped_by_phone = Counter(record["phone"] for record in records)
    grouped_by_branch: dict[str, set[str]] = {}
    alerts = []

    for record in records:
        grouped_by_branch.setdefault(record["phone"], set()).add(record["branch"])

    for phone, count in grouped_by_phone.items():
        if count >= 3:
            alerts.append(
                {
                    "type": "repeat-visitor",
                    "phone": phone,
                    "severity": "medium",
                    "description": f"Phone number {phone} appears in {count} visitor registrations.",
                }
            )

    for phone, branches in grouped_by_branch.items():
        if len(branches) >= 2:
            alerts.append(
                {
                    "type": "multi-branch-pattern",
                    "phone": phone,
                    "severity": "high",
                    "description": f"Phone number {phone} has visits across multiple branches: {', '.join(sorted(branches))}.",
                }
            )

    return alerts


def face_authenticate(visitor_id: str, live_face_token: str) -> dict:
    record = get_visitor(visitor_id)
    if not record:
        return {"verified": False, "message": "Visitor not found."}

    verified = live_face_token.strip().lower().startswith("face-")
    return {
        "verified": verified,
        "visitor_id": visitor_id,
        "message": "Face authentication matched." if verified else "Face authentication failed.",
    }
