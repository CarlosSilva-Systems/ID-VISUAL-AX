from cryptography.fernet import Fernet
from app.core.config import settings

# Ensure KEY is valid url-safe base64. 
# In production, this should be load from env settings.ENCRYPTION_KEY
cipher_suite = Fernet(settings.ENCRYPTION_KEY)

def encrypt_secret(secret: str) -> str:
    return cipher_suite.encrypt(secret.encode()).decode()

def decrypt_secret(secret: str) -> str:
    return cipher_suite.decrypt(secret.encode()).decode()
