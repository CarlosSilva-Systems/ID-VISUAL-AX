import sys
import os

print(f"CWD: {os.getcwd()}")
print("SYS.PATH:")
for p in sys.path:
    print(f"  {p}")

try:
    import app
    print(f"\nAPP MODULE: {app}")
    print(f"APP FILE: {getattr(app, '__file__', 'unknown')}")
    
    from app.api.api_v1.endpoints import batches
    print(f"BATCHES FILE: {getattr(batches, '__file__', 'unknown')}")
except ImportError as e:
    print(f"\nImport Error: {e}")
