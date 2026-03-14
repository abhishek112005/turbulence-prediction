# fetching flights data

import requests
import time
from api.auth import get_access_token
from database.insert_planes import insert_planes


while True:
    try:
        print("\n🚀 Fetching new Data...")

        # Step 1: Generate token
        access_token = get_access_token()
        print("✅ Token generated")

        headers = {
            "Authorization": f"Bearer {access_token}"
        }

        # Step 2: Fetch global aircraft data
        global_url = "https://opensky-network.org/api/states/all"
        response = requests.get(global_url, headers=headers)

        data = response.json()

        planes = data.get("states")

        if planes:
            print("✈️ Aircraft detected:", len(planes))

            # Step 3: Insert into database
            insert_planes(planes)
            print("💾 Inserted into database successfully")

        else:
            print("⚠️ No aircraft data received")

        # Wait 60 seconds before next fetch
        print("⏳ Waiting 60 seconds...\n")
        time.sleep(60)

    except Exception as e:
        print("❌ Error occurred:", e)
        time.sleep(60)
