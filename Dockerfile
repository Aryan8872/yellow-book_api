FROM node:20-alpine AS builder
WORKDIR /app

# Native build tools needed for bcrypt, @parcel/watcher, etc.
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install all deps (allowBuilds in pnpm-workspace.yaml handles native packages)
RUN pnpm install --frozen-lockfile

# Copy source, generate Prisma types, compile TypeScript
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Production-only install (native deps like bcrypt still need to build)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy prisma schema so `prisma generate` can run, then generate the client
# inside the production node_modules (pnpm virtual store path varies — this
# is safer than trying to COPY the generated files from builder)
COPY prisma ./prisma
RUN pnpm prisma generate

EXPOSE 3000
CMD ["node", "dist/main"]