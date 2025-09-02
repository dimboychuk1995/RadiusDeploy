# tools/scripts/seed_authz_db.py
from __future__ import annotations
"""
Seed permission_defs (catalog) and role_defs (role->caps) into MongoDB.

Safe to run multiple times (idempotent).
Works whether you run:
  - python tools/scripts/seed_authz_db.py
  - python -m tools.scripts.seed_authz_db   (if packages are set up)
"""

import sys
from pathlib import Path
from datetime import datetime

# --- Make sure project root is on sys.path ---
HERE = Path(__file__).resolve()
CANDIDATES = [
    HERE.parents[2],  # .../RadiusDeploy   (for tools/scripts/*)
    HERE.parents[1],  # .../RadiusDeploy/tools
    Path.cwd(),       # current working dir (just in case)
]
for root in CANDIDATES:
    if not root or not root.exists():
        continue
    # Heuristics: repo root has db.py or tools/db.py
    if (root / "db.py").exists() or (root / "tools" / "db.py").exists():
        sys.path.insert(0, str(root))
        break

# --- Import db connection (robust) ---
try:
    from tools.db import db  # type: ignore
except Exception:
    try:
        from db import db  # type: ignore
    except Exception as e:
        raise SystemExit(f"[seed] Cannot import db: {e}\n"
                         f"Checked sys.path[0]={sys.path[0]}.\n"
                         f"Run from project root or ensure tools/db.py is accessible.")

# === CATALOG: permissions ===
# Trucks (Fleet -> Trucks)
PERMISSIONS = [
    {"slug": "trucks:view",      "label": "View units",            "category": "Fleet",      "group": "Trucks", "order": 10, "enabled": True},
    {"slug": "trucks:create",    "label": "Create unit",           "category": "Fleet",      "group": "Trucks", "order": 20, "enabled": True},
    {"slug": "trucks:delete",    "label": "Delete unit",           "category": "Fleet",      "group": "Trucks", "order": 30, "enabled": True},
    {"slug": "trucks:file:view", "label": "View unit files",       "category": "Fleet",      "group": "Trucks", "order": 40, "enabled": True},
    {"slug": "trucks:assign",    "label": "Assign unit to driver", "category": "Fleet",      "group": "Trucks", "order": 50, "enabled": True},
]

# Loads (Operations -> Loads)
PERMISSIONS += [
    {"slug": "loads:view",       "label": "View loads",            "category": "Operations", "group": "Loads",  "order": 10, "enabled": True},
    {"slug": "loads:create",     "label": "Create load",           "category": "Operations", "group": "Loads",  "order": 20, "enabled": True},
    {"slug": "loads:delete",     "label": "Delete load",           "category": "Operations", "group": "Loads",  "order": 30, "enabled": True},
    {"slug": "loads:file:view",  "label": "View load files",       "category": "Operations", "group": "Loads",  "order": 40, "enabled": True},
    {"slug": "loads:assign",     "label": "Assign load to driver", "category": "Operations", "group": "Loads",  "order": 50, "enabled": True},
]

# === ROLES: role -> capabilities ===
# Сохранён принцип как у trucks: admin — полный доступ модуля, dispatch — просмотр/файлы/assign, user/driver — только просмотр (+ файлы для driver)
ROLES = {
    "superadmin": ["*"],
    "admin": [
        # trucks
        "trucks:view", "trucks:create", "trucks:delete", "trucks:file:view", "trucks:assign",
        # loads
        "loads:view", "loads:create", "loads:delete", "loads:file:view", "loads:assign",
    ],
    "dispatch": [
        # trucks
        "trucks:view", "trucks:file:view", "trucks:assign",
        # loads (аналогично trucks)
        "loads:view", "loads:file:view", "loads:assign",
    ],
    "user": [
        "trucks:view",
        "loads:view",
    ],
    "driver": [
        "trucks:view", "trucks:file:view",
        "loads:view",  "loads:file:view",
    ],
}

def ensure_indexes():
    names = set(db.list_collection_names())
    if "permission_defs" not in names:
        db.create_collection("permission_defs")
    if "role_defs" not in names:
        db.create_collection("role_defs")

    db["permission_defs"].create_index([("slug", 1)], unique=True)
    db["permission_defs"].create_index([("category", 1), ("group", 1), ("order", 1)])
    db["role_defs"].create_index([("slug", 1)], unique=True)

def upsert_permissions():
    for p in PERMISSIONS:
        p = {**p, "updated_at": datetime.utcnow()}
        db["permission_defs"].update_one(
            {"slug": p["slug"]},
            {"$set": p, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True
        )

def upsert_roles():
    for slug, caps in ROLES.items():
        # уникализируем и сортируем для идемпотентности
        caps_unique_sorted = sorted(set(caps))
        db["role_defs"].update_one(
            {"slug": slug},
            {"$set": {"caps": caps_unique_sorted}},
            upsert=True
        )

def main():
    ensure_indexes()
    upsert_permissions()
    upsert_roles()
    print("[seed] permission_defs OK")
    print("[seed] role_defs OK")
    print("[seed] Done.")

if __name__ == "__main__":
    main()
