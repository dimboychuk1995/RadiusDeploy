from pymongo import MongoClient
from openai import OpenAI

def get_openai_client():
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
    db = client['trucks_db']
    doc = db.global_integrations.find_one({"name": "openai"})
    if not doc or not doc.get("api_key"):
        raise Exception("OpenAI API Key not found in global_integrations")
    return OpenAI(api_key=doc["api_key"])