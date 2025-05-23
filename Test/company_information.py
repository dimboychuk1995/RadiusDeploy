from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from Test.tools.db import db

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
        "email": data.get("email", "")
    }

    companies_collection.insert_one(company)
    return jsonify({"status": "success"}), 200
