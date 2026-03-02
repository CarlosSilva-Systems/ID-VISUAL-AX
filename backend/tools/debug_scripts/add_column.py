import sqlite3

conn = sqlite3.connect('backend.db')
c = conn.cursor()

migrations = [
    ("requester_name", "ALTER TABLE id_request ADD COLUMN requester_name TEXT"),
    ("source", "ALTER TABLE id_request ADD COLUMN source TEXT DEFAULT 'odoo'"),
]

for col_name, sql in migrations:
    try:
        c.execute(sql)
        conn.commit()
        print(f"Added column: {col_name}")
    except Exception as e:
        print(f"Column {col_name} may exist: {e}")

conn.close()
print("Migration done.")
