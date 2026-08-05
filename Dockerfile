# Multi-stage build for the pnpm + Turborepo monorepo. A single runtime image
# runs either app (api or web) via a per-service start command in
# docker-compose.prod.yml; Postgres is a separate service.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl: required by Prisma's query engine. ca-certificates: HTTPS for the
# Scryfall bulk-data download.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9
WORKDIR /app

# ---- build: install all deps, generate the Prisma client, build every package
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deck/db exec prisma generate
RUN pnpm build

# ---- runtime: carries the built workspace (incl. node_modules + Prisma engine)
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
# Default command; overridden per service (api / web / migrate) in compose.
CMD ["pnpm", "--filter", "@deck/web", "start"]
