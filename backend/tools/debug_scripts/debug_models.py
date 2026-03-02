import sys
import traceback
from pathlib import Path

# Add processed path to sys.path
sys.path.append(str(Path(__file__).parent.absolute()))

try:
    from app.models import *
    print("Success: Imports work!")
except Exception:
    with open("debug_error.txt", "w", encoding="utf-8") as f:
        traceback.print_exc(file=f)
    print("Error caught, traceback written to debug_error.txt")
