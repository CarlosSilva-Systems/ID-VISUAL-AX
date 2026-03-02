import sys
import os

# Add backend to sys.path
sys.path.append(os.getcwd())

print(f"CWD: {os.getcwd()}")
print(f"PYTHONPATH: {sys.path}")

try:
    print("Attempting import...")
    from app.api.api_v1.endpoints import batches
    print(f"Imported: {batches}")
    print(f"File Path: {batches.__file__}")
    
    with open(batches.__file__, 'r', encoding='utf-8') as f:
        content = f.read()
        print(f"File Header (First 100 chars): {content[:100]}")
        print(f"CONTAINS DEBUG PRINT: {'DEBUG: LOADED' in content}")

except Exception as e:
    print(f"Import failed: {e}")
