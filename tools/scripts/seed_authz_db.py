# tools/scripts/seed_authz_db.py
from __future__ import annotations
"""
Seed permission_defs (catalog) and role_defs (role->caps) into MongoDB.

Safe to run multiple times (idempotent).
Works whether you run:
  - python tools/scripts/seed_authz_db.py
  - python -m tools.scripts.seed_authz_db
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
PERMISSIONS = [
    # Fleet -> Trucks
    {"slug": "trucks:view",      "label": "View units",            "category": "Fleet",      "group": "Trucks",   "order": 10, "enabled": True},
    {"slug": "trucks:create",    "label": "Create unit",           "category": "Fleet",      "group": "Trucks",   "order": 20, "enabled": True},
    {"slug": "trucks:delete",    "label": "Delete unit",           "category": "Fleet",      "group": "Trucks",   "order": 30, "enabled": True},
    {"slug": "trucks:file:view", "label": "View unit files",       "category": "Fleet",      "group": "Trucks",   "order": 40, "enabled": True},
    {"slug": "trucks:assign",    "label": "Assign unit to driver", "category": "Fleet",      "group": "Trucks",   "order": 50, "enabled": True},

    # Operations -> Loads
    {"slug": "loads:view",       "label": "View loads",            "category": "Operations", "group": "Loads",    "order": 10, "enabled": True},
    {"slug": "loads:create",     "label": "Create load",           "category": "Operations", "group": "Loads",    "order": 20, "enabled": True},
    {"slug": "loads:delete",     "label": "Delete load",           "category": "Operations", "group": "Loads",    "order": 30, "enabled": True},
    {"slug": "loads:file:view",  "label": "View load files",       "category": "Operations", "group": "Loads",    "order": 40, "enabled": True},
    {"slug": "loads:assign",     "label": "Assign load to driver", "category": "Operations", "group": "Loads",    "order": 50, "enabled": True},

    # Finance -> Statements
    {"slug": "statement:view",   "label": "View statements",       "category": "Finance",    "group": "Statements", "order": 10, "enabled": True},
    {"slug": "statement:create", "label": "Create/confirm",        "category": "Finance",    "group": "Statements", "order": 20, "enabled": True},
    {"slug": "statement:delete", "label": "Delete statement",      "category": "Finance",    "group": "Statements", "order": 30, "enabled": True},

    # Fleet -> Drivers  (по факту используемых слагов из drivers.py)
    {"slug": "driver:view",          "label": "View drivers",          "category": "Fleet", "group": "Drivers", "order": 10, "enabled": True},
    {"slug": "driver:view_details",  "label": "View driver details",   "category": "Fleet", "group": "Drivers", "order": 15, "enabled": True},
    {"slug": "driver:create",        "label": "Create driver",         "category": "Fleet", "group": "Drivers", "order": 20, "enabled": True},
    {"slug": "driver:delete",        "label": "Delete driver",         "category": "Fleet", "group": "Drivers", "order": 30, "enabled": True},
    {"slug": "driver:assignment",    "label": "Assign truck/dispatcher","category": "Fleet","group": "Drivers", "order": 40, "enabled": True},
    {"slug": "driver:salary_scheme", "label": "Edit salary scheme",    "category": "Fleet", "group": "Drivers", "order": 50, "enabled": True},
    # при желании можно добавить ещё:
    # {"slug": "driver:file:view",  "label": "View driver files",     "category": "Fleet", "group": "Drivers", "order": 60, "enabled": True},
]

# === ROLES: role -> capabilities ===
ROLES = {
    "superadmin": ["*"],

    "admin": [
        # trucks
        "trucks:view", "trucks:create", "trucks:delete", "trucks:file:view", "trucks:assign",
        # loads
        "loads:view", "loads:create", "loads:delete", "loads:file:view", "loads:assign",
        # statements
        "statement:view", "statement:create", "statement:delete",
        # drivers
        "driver:view", "driver:view_details", "driver:create", "driver:delete",
        "driver:assignment", "driver:salary_scheme",
        # "driver:file:view",  # включи, если защитишь выдачу файлов капом
    ],

    "dispatch": [
        # trucks
        "trucks:view", "trucks:file:view", "trucks:assign",
        # loads
        "loads:view", "loads:file:view", "loads:assign",
        # statements
        "statement:view", "statement:create",
        # drivers (диспетчеру обычно нужны просмотр/детали + назначения)
        "driver:view", "driver:view_details", "driver:assignment",
        # при необходимости можешь дать create:
        # "driver:create",
    ],

    "user": [
        "trucks:view",
        "loads:view",
        "statement:view",
        "driver:view",
    ],

    "driver": [
        "trucks:view", "trucks:file:view",
        "loads:view",  "loads:file:view",
        "statement:view",
        "driver:view",
        # "driver:view_details",  # включи, если водителям нужен полный просмотр карточки
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
