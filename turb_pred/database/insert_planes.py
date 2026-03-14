from database.db_connection import get_connection


def insert_planes(planes):
    conn = get_connection()
    cursor = conn.cursor()

    insert_query = """
    INSERT INTO planes_table
    (icao24, callsign, origin_country, longitude, latitude,
     baro_altitude, velocity, true_track, vertical_rate,
     on_ground, last_contact)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    values = []

    for plane in planes:
        values.append((
            plane[0],
            plane[1],
            plane[2],
            plane[5],
            plane[6],
            plane[7],
            plane[9],
            plane[10],
            plane[11],
            plane[8],
            plane[4]
        ))

    cursor.executemany(insert_query, values)
    conn.commit()

    cursor.close()
    conn.close()
