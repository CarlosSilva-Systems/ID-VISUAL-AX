import sqlite3

def run_fix():
    print("Connecting to backend.db...")
    conn = sqlite3.connect('backend.db')
    cursor = conn.cursor()
    
    columns = ['started_at', 'finished_at']
    
    for col in columns:
        try:
            print(f"Adding column {col}...")
            cursor.execute(f"ALTER TABLE id_request ADD COLUMN {col} DATETIME")
            print(f"SUCCESS: Added {col}")
        except Exception as e:
            print(f"INFO: Could not add {col} (maybe exists?): {e}")

    conn.commit()
    conn.close()
    print("Done.")

if __name__ == "__main__":
    run_fix()
