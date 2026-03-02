import sys
import os

# Add backend dir to path
sys.path.append(os.getcwd())

try:
    from app.models.id_request import TaskStatusV2
    print(f"TaskStatusV2 members: {[e.value for e in TaskStatusV2]}")
    if "montado" in [e.value for e in TaskStatusV2]:
        print("SUCCESS: 'montado' is in TaskStatusV2")
        print(f"Check: {TaskStatusV2('montado')}")
    else:
        print("FAILURE: 'montado' is NOT in TaskStatusV2")
except Exception as e:
    print(f"Error importing: {e}")
