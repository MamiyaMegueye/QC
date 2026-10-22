"""Point d'entree Vercel — importe l'app FastAPI du backend."""
import sys
import os

_backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from main import app  # noqa: F401 — Vercel detecte 'app' (ASGI)
