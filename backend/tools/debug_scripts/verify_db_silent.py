import sys
from sqlalchemy import create_engine, text
from app.core.config import settings

def test():
    url = settings.DATABASE_URL
    # Switch to sync driver
    if "+asyncpg" in url:
        # If psycopg2 is not installed, this might fail unless we have psycopg (binary)
        url = url.replace("+asyncpg", "") 
    
    print(f"Testing URL: {url}")
    
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print(f"Connection Successful: {result.fetchone()}")
        sys.exit(0)
    except ImportError:
        print("Psycopg2 not installed, falling back to check asyncpg via loop (complex)")
        sys.exit(2)
    except Exception as e:
        print(f"Connection Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test()
