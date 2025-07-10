from flask import Blueprint, render_template
from tools.db import db  # централизованное подключение
from flask import request, jsonify
from bson import ObjectId

dispatchers_bp = Blueprint('dispatchers', __name__)
users_collection = db['users']
companies_collection = db['companies']

@dispatchers_bp.route('/fragment/dispatchers')
def dispatchers_fragment():
    dispatchers_cursor = users_collection.find({"role": "dispatch"})
    dispatchers = []
    for d in dispatchers_cursor:
        d["_id"] = str(d["_id"])
        d["company_dispatch"] = str(d.get("company_dispatch", ""))

        # Добавим поля схемы зарплаты, если они есть
        d["salary_scheme"] = d.get("salary_scheme", "")
        d["salary_percent"] = d.get("salary_percent", "")
        d["salary_fixed"] = d.get("salary_fixed", "")
        d["salary_per_driver"] = d.get("salary_per_driver", "")

        dispatchers.append(d)

    companies = list(db.companies.find({}, {"_id": 1, "name": 1}))
    companies = [{"id": str(c["_id"]), "name": c["name"]} for c in companies]

    return render_template("fragments/dispatchers_fragment.html", dispatchers=dispatchers, companies=companies)



@dispatchers_bp.route('/api/dispatchers/<dispatcher_id>/update', methods=['POST'])
def update_dispatcher(dispatcher_id):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Нет данных"}), 400

        # Подготовка данных
        update_fields = {
            "real_name": data.get("real_name", "").strip(),
            "dispatch_name": data.get("dispatch_name", "").strip(),
            "email": data.get("email", "").strip(),
            "email_password": data.get("email_password", "").strip(),
            "phone": data.get("phone", "").strip()
        }

        company_dispatch_raw = data.get("company_dispatch", "").strip()
        if company_dispatch_raw:
            try:
                update_fields["company_dispatch"] = ObjectId(company_dispatch_raw)
            except Exception:
                return jsonify({"error": "Неверный формат company_dispatch"}), 400

        # Обновление
        result = users_collection.update_one(
            {"_id": ObjectId(dispatcher_id)},
            {"$set": update_fields}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Диспетчер не найден"}), 404

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@dispatchers_bp.route('/api/dispatchers/<dispatcher_id>/salary', methods=['POST'])
def update_dispatcher_salary(dispatcher_id):
    try:
        data = request.get_json()
        users_collection.update_one(
            {"_id": ObjectId(dispatcher_id)},
            {"$set": {
                "salary_scheme_type": data.get("salary_scheme_type"),
                "salary_percent": data.get("salary_percent", 0),
                "salary_fixed": data.get("salary_fixed", 0),
                "salary_per_driver": data.get("salary_per_driver", 0)
            }}
        )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500