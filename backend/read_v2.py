
import os

path = 'backend/diag_output_v2.txt'
if not os.path.exists(path):
    path = 'diag_output_v2.txt'

with open(path, 'rb') as f:
    content = f.read()

try:
    text = content.decode('utf-16le')
except:
    text = content.decode('utf-8', errors='replace')

print(text)
