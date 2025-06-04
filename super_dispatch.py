import requests

API_TOKEN = "kIDwK8OaRK03Ag8ZNwwTcOKAi1WP2oUpP37Jh5L5"

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Accept": "application/json"
}

url = "https://staging.carrier.superdispatch.org/v1"

response = requests.get(url, headers=headers)

print("Status code:", response.status_code)
print("Response:", response.json())