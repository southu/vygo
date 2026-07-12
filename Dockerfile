# syntax=docker/dockerfile:1
#
# Production image for the vygo backend services: the Fastify API (apps/api) and
# the email/outbox worker (apps/worker). Both run from THIS one image; each
# Railway service overrides the start command (see railway.toml and
# deploy/railway/worker/railway.toml). Neither backend process serves the
# marketing frontend — that is deployed separately to Vercel (apps/web).
#
# Internal workspace packages (packages/*, and the app entrypoints) ship as
# TypeScript and are executed with `tsx` at runtime (tsx is a runtime
# dependency), so there is no compile-to-JS step: `pnpm build` validates types
# and `pnpm start` runs the TypeScript entrypoint directly.

FROM node:24-bookworm-slim

# Reproducible, non-interactive build. NODE_ENV is intentionally NOT set to
# "production" during install so the TypeScript toolchain (a devDependency used
# by the typecheck build) is available; it is set for the runtime below.
ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# Enable the pnpm version pinned by package.json "packageManager".
RUN corepack enable

WORKDIR /app

# Copy the full workspace. Host node_modules / build output are excluded via
# .dockerignore, so a single frozen install below creates every workspace
# symlink correctly from the committed lockfile.
COPY . .

# Deterministic install from the committed lockfile.
RUN pnpm install --frozen-lockfile

# Fail the build early on any type error in the backend services.
RUN pnpm --filter @vygo/api build \
 && pnpm --filter @vygo/worker build

# Runtime posture. Railway injects PORT (and NODE_ENV); these are safe defaults.
ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

# Default process is the API. The worker service overrides this start command
# with `pnpm --filter @vygo/worker start` (deploy/railway/worker/railway.toml).
# Both bind 0.0.0.0:$PORT and shut down gracefully on SIGTERM/SIGINT.
CMD ["pnpm", "--filter", "@vygo/api", "start"]
