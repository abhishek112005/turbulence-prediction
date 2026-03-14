#it sends a POST request to the endpoint(token_url) 
#that request has client_id and client_secret
import requests
from config.settings import CLIENT_ID, CLIENT_SECRET

def get_access_token():
    token_url = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"

    data = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }

    response = requests.post(token_url, data=data)

    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception("Failed to generate token")
