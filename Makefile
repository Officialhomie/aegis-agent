.PHONY: help test test-watch test-ui test-coverage lint build dev check-all info db-info env-info deps-info

# Default target
help:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "                    Aegis Agent - Make Commands"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo ""
	@echo "Testing:"
	@echo "  make test              - Run all tests once"
	@echo "  make test-watch        - Run tests in watch mode"
	@echo "  make test-ui           - Run tests with UI dashboard"
	@echo "  make test-coverage     - Run tests with coverage report"
	@echo ""
	@echo "Linting & Building:"
	@echo "  make lint              - Run ESLint"
	@echo "  make typecheck         - Run TypeScript type checking"
	@echo "  make build             - Build the project"
	@echo ""
	@echo "Development:"
	@echo "  make dev               - Start development server"
	@echo "  make agent-dev         - Start agent in development mode"
	@echo "  make agent-run         - Run agent once"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate        - Run pending database migrations"
	@echo "  make db-push           - Push schema changes to database"
	@echo "  make db-generate       - Generate Prisma client"
	@echo "  make db-studio         - Open Prisma Studio UI"
	@echo "  make db-seed           - Seed database with initial data"
	@echo ""
	@echo "Information & Debugging:"
	@echo "  make info              - Display all project information"
	@echo "  make db-info           - Show database information"
	@echo "  make env-info          - Show environment info"
	@echo "  make deps-info         - Show dependencies info"
	@echo "  make check-all         - Run all checks (lint, typecheck, test)"
	@echo "  make check-preflight   - Run preflight system checks"
	@echo "  make check-redis       - Check Redis connection"
	@echo "  make check-db          - Check database connection"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean             - Remove node_modules and build artifacts"
	@echo "  make install           - Install dependencies"
	@echo ""

# Testing targets
test:
	npm test

test-watch:
	npm test -- --watch

test-ui:
	npm test -- --ui

test-coverage:
	npm test -- run --coverage

# Linting & Typecheck
lint:
	npm run lint

typecheck:
	npm run typecheck

# Building
build:
	npm run build

# Development
dev:
	npm run dev

agent-dev:
	npm run agent:dev

agent-run:
	npm run agent:run

# Database targets
db-migrate:
	npm run db:migrate

db-push:
	npm run db:push

db-generate:
	npm run db:generate

db-studio:
	npm run db:studio

db-seed:
	npm run db:seed

# Information & Debugging targets
info: env-info deps-info db-info
	@echo ""
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "                      Project Overview"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo ""

env-info:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "                    Environment Information"
	@echo "═══════════════════════════════════════════════════════════════"
	@node -e "console.log('Node version:', process.version); console.log('NPM version:', require('child_process').execSync('npm -v').toString().trim());"
	@echo "Current directory: $$(pwd)"
	@echo "Git branch: $$(git rev-parse --abbrev-ref HEAD)"
	@echo "Git commit: $$(git rev-parse --short HEAD)"
	@echo ""

deps-info:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "                   Dependencies Information"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "Total packages installed: $$(ls node_modules | wc -l)"
	@npm list --depth=0 2>/dev/null | head -30
	@echo ""

db-info:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "                    Database Information"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "Database URL: $${DATABASE_URL:-Not set}"
	@echo "Prisma Client installed: $$([ -d node_modules/@prisma/client ] && echo 'Yes' || echo 'No')"
	@echo "Prisma schema file: $$([ -f prisma/schema.prisma ] && echo 'Found' || echo 'Not found')"
	@echo ""

# Check targets
check-all: lint typecheck test
	@echo ""
	@echo "✓ All checks passed!"

check-preflight:
	npm run check:preflight

check-redis:
	npm run check:redis

check-db:
	npm run check:db

# Cleanup
clean:
	rm -rf node_modules
	rm -rf .next
	rm -rf dist
	rm -rf coverage
	@echo "✓ Cleaned up node_modules, .next, dist, and coverage directories"

install:
	npm install
	@echo "✓ Dependencies installed"

.DEFAULT_GOAL := help
