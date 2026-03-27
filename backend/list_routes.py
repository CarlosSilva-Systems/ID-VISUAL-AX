from app.main import app
for route in app.routes:
    print(f"Path: {route.path} | Name: {getattr(route, 'name', 'N/A')} | Methods: {getattr(route, 'methods', 'N/A')}")
