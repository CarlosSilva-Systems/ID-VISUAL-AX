
import os

path = 'backend/diag_output.txt'
if not os.path.exists(path):
    path = 'diag_output.txt'

with open(path, 'rb') as f:
    content = f.read()

try:
    text = content.decode('utf-16le')
except:
    text = content.decode('utf-8', errors='replace')

# Write as UTF-8
with open('diag_utf8.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
