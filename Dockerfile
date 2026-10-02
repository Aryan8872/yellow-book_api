FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

# first install attempt (will detect ignored builds; allow failure)
RUN pnpm install \
  --frozen-lockfile \
  --ignore-scripts=false \
  --unsafe-perm \
  --config.allow-builds=true || true

# approve everything detected (non-interactive)
RUN pnpm approve-builds --all || true

# final install that actually runs the build scripts
RUN pnpm install \
  --frozen-lockfile \
  --ignore-scripts=false \
  --unsafe-perm \
  --config.allow-builds=true

COPY . .

RUN pnpm prisma generate
RUN pnpm build