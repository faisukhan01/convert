# RidgeLine production image (example). Build: docker build -t ridgeline .
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run db:generate && bun run build

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup --system --gid 1001 ridge && adduser --system --uid 1001 ridge
COPY --from=build --chown=ridge:ridge /app/.next/standalone ./
COPY --from=build --chown=ridge:ridge /app/.next/static ./.next/static
COPY --from=build --chown=ridge:ridge /app/public ./public
COPY --from=build --chown=ridge:ridge /app/prisma ./prisma
COPY --from=build --chown=ridge:ridge /app/db ./db
USER ridge
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
# Safe migration order: run `bunx prisma db push` (or migrate deploy) BEFORE first
# boot against DATABASE_URL; the app seeds only an empty database on first request.
CMD ["bun", ".next/standalone/server.js"]
