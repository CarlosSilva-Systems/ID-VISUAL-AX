import sys
import os
sys.path.append(os.getcwd())
from app.core.config import settings

print(f"Type: {type(settings.BACKEND_CORS_ORIGINS)}")
print(f"Value: {settings.BACKEND_CORS_ORIGINS}")

if isinstance(settings.BACKEND_CORS_ORIGINS, list):
    print("It is a list.")
    for item in settings.BACKEND_CORS_ORIGINS:
        print(f"Item type: {type(item)} Value: {item}")
else:
    print("It is NOT a list.")
