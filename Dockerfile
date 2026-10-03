FROM node:20-alpine AS builder
WORKDIR /app

# Native build tools + openssl (Prisma requires libssl on Alpine)
RUN apk add --no-cache python3 make g++ openssl

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install all deps (allowBuilds in pnpm-workspace.yaml handles native packages)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build TypeScript — force clean build by removing incremental cache first
RUN rm -f tsconfig.tsbuildinfo && pnpm build

# Verify the build output exists before we proceed
RUN test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found after build!" && ls -la dist/ && ls -la dist/src/ && exit 1)

# ── Production image ──────────────────────────────────────────────────────────
# pnpm uses a virtual store: node_modules/.pnpm/ contains all packages and
# node_modules/* are symlinks into it. Copying node_modules whole preserves
# the store + symlinks so everything resolves at runtime — no re-install needed.
FROM node:20-alpine AS production
WORKDIR /app

# Prisma needs libssl at runtime on Alpine
RUN apk add --no-cache openssl

COPY package.json ./

# Copy compiled app and the entire pnpm virtual store from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/src/main"]