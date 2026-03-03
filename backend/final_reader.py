
import os
import sys

# Ensure stdout is compatible but we'll mainly write to a file
path = 'backend/diag_output.txt'
if not os.path.exists(path):
    path = 'diag_output.txt'

if not os.path.exists(path):
    print(f"File not found: {path}")
    sys.exit(1)

with open(path, 'rb') as f:
    content = f.read()

# Try different decodings
text = ""
for encoding in ['utf-16le', 'utf-16', 'utf-8']:
    try:
        text = content.decode(encoding)
        print(f"Decoded with {encoding}")
        break
    except:
        continue

if not text:
    text = content.decode('utf-8', errors='replace')
    print("Decoded with utf-8 replace")

# Save as UTF-8 strictly
with open('diag_final.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print("Saved to diag_final.txt")
