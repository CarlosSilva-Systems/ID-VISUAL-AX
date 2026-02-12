import ast

try:
    with open('integration_output.txt', 'r') as f:
        content = f.read()
        
    # Find the line starting with "Response JSON:"
    for line in content.splitlines():
        if line.startswith("Response JSON:"):
            # safely parse the python dict string
            dict_str = line.replace("Response JSON: ", "")
            try:
                data = ast.literal_eval(dict_str)
                with open("traceback.txt", "w") as tf:
                    tf.write(data.get('traceback', 'No traceback found'))
                print("Traceback written to traceback.txt")
            except Exception as e:
                print(f"Failed to parse JSON line: {e}")
                print(f"Line content: {dict_str[:200]}...")

except Exception as e:
    print(f"Error reading file: {e}")
