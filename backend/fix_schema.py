import sqlite3
import os

db_path = "backend.db"

def fix():
    print(f"Checking DB at: {os.path.abspath(db_path)}")
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        # Check if column exists
        cur.execute("PRAGMA table_info(id_request)")
        cols = [c[1] for c in cur.fetchall()]
        if "batch_id" in cols:
            print("Column batch_id already exists.")
        else:
            print("Adding column batch_id...")
            cur.execute("ALTER TABLE id_request ADD COLUMN batch_id CHAR(32)")
            conn.commit()
            print("Column added successfully.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    fix()
