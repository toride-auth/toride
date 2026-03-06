FROM mcr.microsoft.com/devcontainers/base:ubuntu

# =============================================================================
# CUSTOMIZE: Install project-specific system dependencies below.
# Prefer devcontainer features (in devcontainer.json) for common tools
# like Node.js, Python, Go, etc.
# =============================================================================

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
