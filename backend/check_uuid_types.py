import sqlite3
import os

db_path = "backend.db"

def check():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    print("--- ID_REQUEST Columns ---")
    cur.execute("PRAGMA table_info(id_request)")
    for c in cur.fetchall():
        print(f"{c[1]}: {c[2]}")
        
    print("\n--- BATCH Columns ---")
    cur.execute("PRAGMA table_info(batch)")
    for c in cur.fetchall():
        print(f"{c[1]}: {c[2]}")
    conn.close()

if __name__ == "__main__":
    check()
