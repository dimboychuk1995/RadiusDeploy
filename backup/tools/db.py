from pymongo import MongoClient
import gridfs
import logging

try:
    # Подключение к MongoDB
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/")

    # Основная база TMS
    db = client['trucks_db']
    fs = gridfs.GridFS(db)

    # Дополнительная база для интеграций
    integrations_db = client['integrations']
    integrations_fs = gridfs.GridFS(integrations_db)

    # Проверка подключения
    client.admin.command('ping')

except Exception as e:
    logging.error(f"MongoDB connection failed: {e}")
    raise e
