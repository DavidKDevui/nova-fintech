# syntax=docker/dockerfile:1

# ============================================================
# Stage 1 — deps : install des node_modules. Plus aucun module
# natif (bcrypt -> bcryptjs pur JS, pg est pur JS) : pas besoin
# de python3/make/g++ ni de toolchain de compilation.
# ============================================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ============================================================
# Stage 2 — builder : build de l'app Next.js
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Validation (typecheck + lint) avant build : fail fast sur erreur de code,
# evite un build inutile qui prend plus de temps.
RUN npm run typecheck && npm run lint

RUN npm run build

# ============================================================
# Stage 3 — runner : image minimale de prod
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# PAS de pnpm ici : le projet est en npm (package-lock.json). pnpm >= 10 lance
# un "deps status check" avant chaque `pnpm run`, ne reconnait pas un
# node_modules installe par npm, et declenche un `pnpm install` implicite qui
# deplace les dependances dans node_modules/.ignored puis meurt en OOM.
# Les crons Ofelia appellent donc `npm run cron:xxx` (npm est deja dans l'image).

# User non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Build output Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# node_modules complet (tsx en devDep est requis par les scripts cron)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Fichiers nécessaires au runtime + scripts cron
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
# src/ requis par les scripts admin/cron qui importent depuis @/lib/, @/actions/, etc.
COPY --from=builder --chown=nextjs:nodejs /app/src ./src

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]