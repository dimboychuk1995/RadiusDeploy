from flask import Blueprint, render_template

dispatch_statements_bp = Blueprint('dispatch_statements', __name__)

@dispatch_statements_bp.route("/fragment/statement_dispatchers")
def statement_dispatchers_fragment():
    return render_template("fragments/statement_dispatchers_fragment.html")