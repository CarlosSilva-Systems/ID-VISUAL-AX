from app.main import app
import json

def list_routes():
    routes = []
    for route in app.routes:
        if hasattr(route, "path"):
            routes.append({
                "path": route.path,
                "name": route.name,
                "methods": list(route.methods) if hasattr(route, "methods") else []
            })
    
    # Filter for auth routes
    auth_routes = [r for r in routes if "auth" in r["path"]]
    print(json.dumps(auth_routes, indent=2))

if __name__ == "__main__":
    list_routes()
