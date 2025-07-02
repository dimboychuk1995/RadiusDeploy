from flask import Blueprint, render_template
from tools.db import db
import pymongo
dispatch_statements_bp = Blueprint('dispatch_statements', __name__)

users_collection = db['users']

@dispatch_statements_bp.route("/fragment/statement_dispatchers")
def statement_dispatchers_fragment():
    dispatchers = list(users_collection.find({"role": "dispatch"}, {"_id": 1, "real_name": 1}))
    for dispatcher in dispatchers:
        dispatcher["id"] = str(dispatcher["_id"])
    return render_template("fragments/statement_dispatchers_fragment.html", dispatchers=dispatchers)