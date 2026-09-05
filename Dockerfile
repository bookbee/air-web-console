# syntax=docker/dockerfile:1.7
#
# AIR Web Console in a container, for a quick launch with nothing to
# install. Local development and testing only — this image is not hardened
# or optimised for a production deployment. It changes one thing that
# matters: `localhost` now means *this container*, not your machine.
# docker-compose.yml re-points the `local` target at `host.docker.internal`
# for exactly that reason — see the comment there.

ARG NODE_IMAGE=node:20-alpine

# ── Dependencies ────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Only the *publishable* gateway token needs to exist at build time — Next.js
# inlines every NEXT_PUBLIC_* reference into the client bundle during
# `next build`. Every real secret (the upstream air-* API keys) is passed at
# container *runtime* instead, via docker-compose's env_file — never baked
# into an image layer. See src/lib/auth/gatewayAuth.ts for why this one
# value is safe to treat differently.
ARG NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN
ENV NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN=${NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN}
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime

LABEL org.opencontainers.image.title="AIR Web Console" \
      org.opencontainers.image.description="Next.js console for exercising the AIR platform services" \
      org.opencontainers.image.licenses="Proprietary"

RUN addgroup --system --gid 1001 air && \
    adduser --system --uid 1001 --ingroup air air

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next.js "standalone" output (next.config.ts): a self-contained server.js
# plus only the node_modules it actually traces as used, instead of copying
# the full node_modules tree into the image.
COPY --from=builder --chown=air:air /app/.next/standalone ./
COPY --from=builder --chown=air:air /app/.next/static ./.next/static
COPY --from=builder --chown=air:air /app/public ./public

USER air

EXPOSE 3000

# /api/health is deliberately ungated (see its own file) — a healthcheck
# should confirm the Node process is serving, not carry gateway credentials.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# 0.0.0.0 (HOSTNAME above) so the port publish reaches it; the console is
# bound to loopback on the host side in docker-compose.yml regardless, since
# it is a local tool either way.
CMD ["node", "server.js"]
