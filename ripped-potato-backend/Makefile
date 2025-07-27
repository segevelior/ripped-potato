# Makefile - Development task automation
# Run 'make help' to see all available commands

.PHONY: help install dev test format lint clean run setup-db

help:
	@echo "Available commands:"
	@echo "  make install    - Install dependencies with Poetry"
	@echo "  make dev        - Run development server"
	@echo "  make test       - Run tests"
	@echo "  make format     - Format code with black and isort"
	@echo "  make lint       - Run linting checks"
	@echo "  make clean      - Clean up cache files"
	@echo "  make setup-db   - Start MongoDB with Docker"

install:
	poetry install

dev:
	poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	poetry run pytest

test-setup:
	poetry run python tests/test_setup.py

format:
	poetry run black app/
	poetry run isort app/

lint:
	poetry run flake8 app/
	poetry run mypy app/

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete

setup-db:
	docker-compose -f scripts/docker/docker-compose.yml up -d 