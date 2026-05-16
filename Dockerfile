# --- Build stage -----------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Build tools for native modules (better-sqlite3, sharp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build \
  && npm prune --omit=dev

# --- Runtime stage ---------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/webdav.js ./webdav.js

# Runtime data: SQLite database + cached previews (mount a volume here).
RUN mkdir -p /app/data/previews

EXPOSE 3000
CMD ["node", "server.js"]
