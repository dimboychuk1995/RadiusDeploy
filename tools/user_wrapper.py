class UserWrapper:
    def __init__(self, user_doc):
        self.id = str(user_doc["_id"])
        self.username = user_doc.get("username", "")
        self.role = user_doc.get("role", "")
        self.company = user_doc.get("company", "")

    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def get_id(self):
        return self.id
