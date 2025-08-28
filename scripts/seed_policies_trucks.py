# scripts/seed_policies_trucks.py
from __future__ import annotations
import os
from pprint import pprint
from tools.db import db


PERMISSIONS = [
    # только юниты (trucks)
    {"slug": "trucks:view",       "desc": "Просмотр списка/деталей юнитов"},
    {"slug": "trucks:create",     "desc": "Добавление юнита"},
    {"slug": "trucks:delete",     "desc": "Удаление юнита"},
    {"slug": "trucks:file:view",  "desc": "Просмотр файлов юнита (регистрация/страховка/инспекция)"},
    {"slug": "trucks:assign",     "desc": "Назначение юнита водителю"},
]

ROLES = [
    {"slug": "superadmin", "caps": ["*"]},
    {"slug": "admin",      "caps": ["trucks:view", "trucks:create", "trucks:delete", "trucks:file:view", "trucks:assign"]},
    {"slug": "dispatch",   "caps": ["trucks:view", "trucks:file:view", "trucks:assign"]},
    {"slug": "user",       "caps": ["trucks:view"]},
    {"slug": "driver",     "caps": ["trucks:view", "trucks:file:view"]},
]

def ensure_indexes():
    db["permission_defs"].create_index("slug", unique=True)
    db["role_defs"].create_index("slug", unique=True)
    db["user_roles"].create_index([("user_id", 1), ("company", 1)], unique=True)
    db["audit_logs"].create_index([("ts_unix", -1)])
    print("Indexes ensured.")

def upsert_permissions():
    for p in PERMISSIONS:
        db["permission_defs"].update_one({"slug": p["slug"]}, {"$setOnInsert": p}, upsert=True)
    print("Permissions upserted:", [p["slug"] for p in PERMISSIONS])

def upsert_roles():
    for r in ROLES:
        db["role_defs"].update_one({"slug": r["slug"]}, {"$set": {"caps": r["caps"]}}, upsert=True)
    print("Roles upserted:", [r["slug"] for r in ROLES])

def print_summary():
    print("\n=== permission_defs ===")
    pprint(list(db["permission_defs"].find({}, {"_id": 0})))
    print("\n=== role_defs ===")
    pprint(list(db["role_defs"].find({}, {"_id": 0})))

if __name__ == "__main__":
    ensure_indexes()
    upsert_permissions()
    upsert_roles()
    print_summary()
    print("\nDone.")
