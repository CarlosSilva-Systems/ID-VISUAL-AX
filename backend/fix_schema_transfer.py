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
        cur.execute("PRAGMA table_info(id_request)")
        cols = [c[1] for c in cur.fetchall()]
        print(f"Existing columns: {cols}")

        new_cols = {
            "transferred_to_queue": "BOOLEAN DEFAULT 0",
            "transferred_at": "DATETIME",
            "odoo_activity_id": "INTEGER",
            "transfer_note": "TEXT"
        }

        for col, type_def in new_cols.items():
            if col not in cols:
                print(f"Adding column {col}...")
                try:
                    cur.execute(f"ALTER TABLE id_request ADD COLUMN {col} {type_def}")
                    print(f"Column {col} added successfully.")
                except Exception as e:
                    print(f"Failed to add {col}: {e}")
            else:
                print(f"Column {col} already exists.")
        
        conn.commit()
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    fix()
