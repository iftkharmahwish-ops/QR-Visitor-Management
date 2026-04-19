from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
QR_DIR = BASE_DIR / "generated_qr"
DATA_FILE = DATA_DIR / "visitors.json"
SQLITE_DB_FILE = DATA_DIR / "visitor_management.db"

load_dotenv(BASE_DIR / ".env")

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017/")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "visitor_management")

mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)


def get_database():
    return mongo_client[MONGODB_DB_NAME]


def get_visitors_collection() -> Collection:
    return get_database()["visitors"]


def get_users_collection() -> Collection:
    return get_database()["users"]


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    QR_DIR.mkdir(parents=True, exist_ok=True)

    mongo_client.admin.command("ping")
    get_visitors_collection().create_index([("visitor_id", ASCENDING)], unique=True)
    get_visitors_collection().create_index([("created_at", DESCENDING)])
    get_users_collection().create_index([("username", ASCENDING)], unique=True)

    seed_default_users()
    migrate_json_if_needed()
    migrate_sqlite_if_needed()


def seed_default_users() -> None:
    default_users = [
        {"username": "admin", "password_hash": hash_password("admin123"), "role": "admin"},
        {"username": "security", "password_hash": hash_password("security123"), "role": "security"},
    ]

    users = get_users_collection()
    for user in default_users:
        users.update_one(
            {"username": user["username"]},
            {"$setOnInsert": user},
            upsert=True,
        )


def migrate_json_if_needed() -> None:
    if not DATA_FILE.exists():
        return

    visitors = get_visitors_collection()
    if visitors.count_documents({}) > 0:
        return

    raw_records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if raw_records:
        visitors.insert_many(raw_records, ordered=False)


def migrate_sqlite_if_needed() -> None:
    if not SQLITE_DB_FILE.exists():
        return

    visitors = get_visitors_collection()
    if visitors.count_documents({}) > 0:
        return

    connection = sqlite3.connect(SQLITE_DB_FILE)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute("SELECT * FROM visitors").fetchall()
        records = []
        for row in rows:
            item = dict(row)
            item["risk_flags"] = json.loads(item.get("risk_flags") or "[]")
            records.append(item)
        if records:
            visitors.insert_many(records, ordered=False)
    finally:
        connection.close()


def serialize_document(document: dict | None) -> dict | None:
    if not document:
        return None
    item = dict(document)
    item.pop("_id", None)
    if isinstance(item.get("risk_flags"), str):
        item["risk_flags"] = json.loads(item["risk_flags"] or "[]")
    return item


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()
