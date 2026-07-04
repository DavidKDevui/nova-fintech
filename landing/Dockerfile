# syntax=docker/dockerfile:1

# ============================================================
# Stage 1 — deps : install des node_modules
# ============================================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ============================================================
# Stage 2 — builder : build de la landing Next.js (output standalone)
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Validation (typecheck + lint) avant build : fail fast sur erreur de code.
RUN npm run typecheck && npm run lint

RUN npm run build

# ============================================================
# Stage 3 — runner : image minimale de prod (server.js autonome)
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# User non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Output standalone : server.js + node_modules minimal tracés par Next.
# public/ et .next/static ne sont pas inclus par défaut -> on les copie à la main.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
