import base64
import hashlib
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import VAULT_KEY


def derive_key(key_str: str = VAULT_KEY) -> bytes:
    """
    Derives an exact 32-byte key for AES-256 GCM from configuration string.
    Handles raw 32 bytes, base64-encoded, hex-encoded, or hashes to 32 bytes.
    """
    if not key_str:
        key_str = "smartvault-default-key-32-bytes!"

    # 1. Base64 decoded check
    try:
        decoded = base64.b64decode(key_str)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    # 2. Hex decoded check
    try:
        decoded = bytes.fromhex(key_str)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    # 3. Direct 32-byte utf-8 check
    encoded = key_str.encode("utf-8")
    if len(encoded) == 32:
        return encoded

    # 4. Deterministic SHA-256 hash fallback to guarantee 32 bytes
    return hashlib.sha256(encoded).digest()


def encrypt_bytes(data: bytes, key: bytes = None) -> bytes:
    """
    Encrypts arbitrary byte payload using AES-256-GCM.
    Returns 12-byte nonce prefixed to ciphertext with GCM auth tag.
    """
    if key is None:
        key = derive_key()

    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return nonce + ciphertext


def decrypt_bytes(encrypted_data: bytes, key: bytes = None) -> bytes:
    """
    Decrypts byte payload encrypted with encrypt_bytes.
    Extracts 12-byte nonce and verifies authenticated ciphertext.
    """
    if key is None:
        key = derive_key()

    if len(encrypted_data) < 12:
        raise ValueError("Encrypted data is too short to contain a valid GCM nonce")

    nonce = encrypted_data[:12]
    ciphertext = encrypted_data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)
