FROM node:20-alpine AS builder
WORKDIR /app

# Native build tools needed for bcrypt, @parcel/watcher, etc.
RUN apk add --no-cache python3 make g++

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifest files first (layer cache optimization)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install all dependencies.
# pnpm-workspace.yaml's allowBuilds map lets native packages run their
# postinstall scripts without interactive approval (no ERR_PNPM_IGNORED_BUILDS).
RUN pnpm install --frozen-lockfile

# Copy source and generate Prisma client
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Production-only install
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main"]