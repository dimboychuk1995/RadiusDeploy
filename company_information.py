from bson import ObjectId
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from tools.db import db

company_bp = Blueprint('company_info', __name__)
companies_collection = db['companies']

@company_bp.route('/company_information', methods=['GET'])
@login_required
def company_information():
    companies = list(companies_collection.find({'owner_company': current_user.company}))
    return render_template('company_information.html', companies=companies)

@company_bp.route('/api/add_company', methods=['POST'])
@login_required
def add_company():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400

    company = {
        "owner_company": current_user.company,
        "name": data.get("name", ""),
        "address": data.get("address", ""),
        "mc": data.get("mc", ""),
        "dot": data.get("dot", ""),
        "phone": data.get("phone", ""),
        "email": data.get("email", ""),
        "password": data.get("password", "")
    }

    companies_collection.insert_one(company)
    return jsonify({"status": "success"}), 200


@company_bp.route('/api/get_company/<company_id>', methods=['GET'])
@login_required
def get_company(company_id):
    company = companies_collection.find_one({
        "_id": ObjectId(company_id),
        "owner_company": current_user.company
    })
    if not company:
        return jsonify({"error": "Компания не найдена"}), 404

    company["_id"] = str(company["_id"])
    return jsonify(company)

@company_bp.route('/api/edit_company/<company_id>', methods=['POST'])
@login_required
def edit_company(company_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400

    update_fields = {
        "name": data.get("name", ""),
        "address": data.get("address", ""),
        "mc": data.get("mc", ""),
        "dot": data.get("dot", ""),
        "phone": data.get("phone", ""),
        "email": data.get("email", ""),
        "password": data.get("password", "")
    }

    result = companies_collection.update_one(
        {"_id": ObjectId(company_id), "owner_company": current_user.company},
        {"$set": update_fields}
    )

    if result.matched_count == 0:
        return jsonify({"error": "Компания не найдена"}), 404

    return jsonify({"status": "updated"}), 200