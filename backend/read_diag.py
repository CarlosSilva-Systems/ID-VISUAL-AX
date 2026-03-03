
import os
import sys

# Ensure stdout is UTF-8
if sys.stdout.encoding.lower() != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = 'backend/diag_output.txt'
if not os.path.exists(path):
    path = 'diag_output.txt'

if not os.path.exists(path):
    print(f"File not found: {path}")
    sys.exit(1)

with open(path, 'rb') as f:
    content = f.read()

try:
    text = content.decode('utf-16le')
except Exception as e:
    print(f"UTF-16 decode failed: {e}")
    text = content.decode('utf-8', errors='replace')

print(text)
