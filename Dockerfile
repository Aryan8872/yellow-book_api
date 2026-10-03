FROM node:20-alpine AS builder
WORKDIR /app

# Native build tools needed for bcrypt, @parcel/watcher, etc.
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install all deps (allowBuilds in pnpm-workspace.yaml handles native packages)
RUN pnpm install --frozen-lockfile

# Copy source, generate Prisma client, compile TypeScript
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ── Production image ──────────────────────────────────────────────────────────
# pnpm uses a virtual store: node_modules/.pnpm/ contains all packages and
# node_modules/* are symlinks into it. Copying node_modules whole preserves
# the store + symlinks so everything resolves at runtime — no re-install needed.
FROM node:20-alpine AS production
WORKDIR /app

# Only need the runtime binary (no corepack/pnpm needed at runtime)
COPY package.json ./

# Copy compiled app and the entire pnpm virtual store from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main"]