"""Vercel Serverless Function entrypoint for AutoNexa FastAPI Backend."""

import os
import sys

# Ensure backend root directory is in Python path for absolute imports
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

# Export app for Vercel ASGI serverless handler
__all__ = ["app"]
