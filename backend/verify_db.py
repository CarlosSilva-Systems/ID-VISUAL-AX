from sqlalchemy import create_engine, inspect
from app.core.config import settings

def verify_tables():
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "")
    
    engine = create_engine(url)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print("Tables found:", tables)
    
    expected = ["user", "odoo_connection", "manufacturing_order", "id_request", "id_request_task", "batch", "batch_item", "elesys_consumption", "history_log"]
    missing = [t for t in expected if t not in tables]
    
    if not missing:
        print("ALL TABLES PRESENT!")
    else:
        print(f"MISSING TABLES: {missing}")

if __name__ == "__main__":
    verify_tables()
