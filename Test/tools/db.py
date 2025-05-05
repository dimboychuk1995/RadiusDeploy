from pymongo import MongoClient
import gridfs
import logging

try:
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
    db = client['trucks_db']
    fs = gridfs.GridFS(db)
    client.admin.command('ping')
except Exception as e:
    logging.error(f"MongoDB connection failed: {e}")
    raise e
