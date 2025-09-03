# tools/scripts/seed_authz_db.py
from __future__ import annotations
"""
Seed permission_defs (catalog) and role_defs (role->caps) into MongoDB.

Idempotent: можно запускать многократно.
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
# ВНИМАНИЕ: category теперь равен названию модуля нижнего уровня:
# statements, drivers, units, brokers, dispatch, loads
PERMISSIONS = [
    # units (ранее "trucks:*")
    {"slug": "trucks:view",      "label": "View units",            "category": "units",     "group": "units",     "order": 10, "enabled": True},
    {"slug": "trucks:create",    "label": "Create unit",           "category": "units",     "group": "units",     "order": 20, "enabled": True},
    {"slug": "trucks:delete",    "label": "Delete unit",           "category": "units",     "group": "units",     "order": 30, "enabled": True},
    {"slug": "trucks:file:view", "label": "View unit files",       "category": "units",     "group": "units",     "order": 40, "enabled": True},
    {"slug": "trucks:assign",    "label": "Assign unit to driver", "category": "units",     "group": "units",     "order": 50, "enabled": True},

    # drivers
    {"slug": "driver:view",          "label": "View drivers",          "category": "drivers",  "group": "drivers",  "order": 10, "enabled": True},
    {"slug": "driver:view_details",  "label": "View driver details",   "category": "drivers",  "group": "drivers",  "order": 15, "enabled": True},
    {"slug": "driver:create",        "label": "Create driver",         "category": "drivers",  "group": "drivers",  "order": 20, "enabled": True},
    {"slug": "driver:delete",        "label": "Delete driver",         "category": "drivers",  "group": "drivers",  "order": 30, "enabled": True},
    {"slug": "driver:assignment",    "label": "Assign truck/dispatcher","category": "drivers", "group": "drivers",  "order": 40, "enabled": True},
    {"slug": "driver:salary_scheme", "label": "Edit salary scheme",    "category": "drivers",  "group": "drivers",  "order": 50, "enabled": True},
    # при необходимости можно добавить: {"slug": "driver:file:view", ...} и повесить на выдачу файлов

    # loads
    {"slug": "loads:view",       "label": "View loads",            "category": "loads",     "group": "loads",     "order": 10, "enabled": True},
    {"slug": "loads:create",     "label": "Create load",           "category": "loads",     "group": "loads",     "order": 20, "enabled": True},
    {"slug": "loads:delete",     "label": "Delete load",           "category": "loads",     "group": "loads",     "order": 30, "enabled": True},
    {"slug": "loads:file:view",  "label": "View load files",       "category": "loads",     "group": "loads",     "order": 40, "enabled": True},
    {"slug": "loads:assign",     "label": "Assign load to driver", "category": "loads",     "group": "loads",     "order": 50, "enabled": True},

    # statements
    {"slug": "statement:view",   "label": "View statements",       "category": "statements","group": "statements","order": 10, "enabled": True},
    {"slug": "statement:create", "label": "Create/confirm",        "category": "statements","group": "statements","order": 20, "enabled": True},
    {"slug": "statement:delete", "label": "Delete statement",      "category": "statements","group": "statements","order": 30, "enabled": True},

    # brokers (brokers & customers)
    {"slug": "brokers:view",     "label": "View brokers/customers","category": "brokers",   "group": "brokers",   "order": 10, "enabled": True},
    {"slug": "brokers:create",   "label": "Create broker/customer","category": "brokers",   "group": "brokers",   "order": 20, "enabled": True},
    {"slug": "brokers:update",   "label": "Update broker/customer","category": "brokers",   "group": "brokers",   "order": 30, "enabled": True},
    {"slug": "brokers:delete",   "label": "Delete broker/customer","category": "brokers",   "group": "brokers",   "order": 40, "enabled": True},

    # dispatch
    {"slug": "dispatch:view",                 "label": "View dispatch board", "category": "dispatch",  "group": "dispatch",  "order": 10, "enabled": True},
    {"slug": "dispatch:consolidation_create", "label": "Create consolidation", "category": "dispatch",  "group": "dispatch",  "order": 20, "enabled": True},
    {"slug": "dispatch:consolidation_delete", "label": "Delete consolidation", "category": "dispatch",  "group": "dispatch",  "order": 30, "enabled": True},
    {"slug": "dispatch:driver_break_create",  "label": "Create driver break",  "category": "dispatch",  "group": "dispatch",  "order": 40, "enabled": True},
    {"slug": "dispatch:driver_break_delete",  "label": "Delete driver break",  "category": "dispatch",  "group": "dispatch",  "order": 50, "enabled": True},
]

# === ROLES: role -> capabilities ===
ROLES = {
    "superadmin": ["*"],

    "admin": [
        # units
        "trucks:view", "trucks:create", "trucks:delete", "trucks:file:view", "trucks:assign",
        # drivers
        "driver:view", "driver:view_details", "driver:create", "driver:delete",
        "driver:assignment", "driver:salary_scheme",
        # loads
        "loads:view", "loads:create", "loads:delete", "loads:file:view", "loads:assign",
        # statements
        "statement:view", "statement:create", "statement:delete",
        # brokers
        "brokers:view", "brokers:create", "brokers:update", "brokers:delete",
        # dispatch
        "dispatch:view", "dispatch:consolidation_create", "dispatch:consolidation_delete",
        "dispatch:driver_break_create", "dispatch:driver_break_delete",
    ],

    "dispatch": [
        # units
        "trucks:view", "trucks:file:view", "trucks:assign",
        # drivers
        "driver:view", "driver:view_details", "driver:assignment",
        # loads
        "loads:view", "loads:file:view", "loads:assign",
        # statements
        "statement:view", "statement:create",
        # brokers (создание/редактирование — да; удаление обычно админу)
        "brokers:view", "brokers:create", "brokers:update",
        # dispatch
        "dispatch:view", "dispatch:consolidation_create", "dispatch:consolidation_delete",
        "dispatch:driver_break_create", "dispatch:driver_break_delete",
    ],

    "user": [
        "trucks:view",
        "loads:view",
        "statement:view",
        "driver:view",
        "brokers:view",
    ],

    "driver": [
        "trucks:view", "trucks:file:view",
        "loads:view",  "loads:file:view",
        "statement:view",
        "driver:view",
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
