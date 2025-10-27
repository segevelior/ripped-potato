#!/bin/bash
# Development startup script for AI Coach Service
# Uses Poetry to manage dependencies and run with uvicorn

cd "$(dirname "$0")"
poetry run uvicorn app.main:app --reload --port 8001 --host 127.0.0.1
