from sqlmodel import SQLModel, create_engine
from app.core.config import settings
from app.models import *

def init_db_sync():
    # Ensure URL is sync
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "")
    
    print(f"Connecting to {url}...")
    engine = create_engine(url, echo=True)
    
    print("Creating tables...")
    try:
        SQLModel.metadata.create_all(engine)
        print("Tables created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    init_db_sync()
