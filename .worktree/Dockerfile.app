# =============================================================================
# Default app Dockerfile. Inherits from the team-shared base image.
#
# CUSTOMIZE: Add project-specific dependencies here (language runtimes,
# build tools, client libraries, etc.)
#
# BASE_IMAGE is provided as a build arg by docker-compose.yml.
# Do not change the ARG/FROM lines.
# =============================================================================

ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - \
  && sudo apt-get install -y nodejs \
  && sudo rm -rf /var/lib/apt/lists/*

# pnpm (version pinned to match packageManager in package.json)
RUN sudo corepack enable --install-directory /usr/local/bin && corepack prepare pnpm@10.30.3 --activate
