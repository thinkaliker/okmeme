# okmeme api
#
# Multi-stage so the runtime image carries no compiler and no dev dependencies.
# sharp and @aws-sdk/client-s3 are optional dependencies: they install here, and
# a deployment that uses neither simply never loads them.

FROM node:25-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --include=optional

COPY prisma ./prisma
RUN npx prisma generate

# The Vercel entry point is not copied: it is not part of this build, and
# Vercel compiles it itself.
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:25-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY migrations ./migrations

# The blob store is a cache, not a store of record. Mount a volume here if you
# want it to survive a restart; losing it costs a refetch, not data.
RUN mkdir -p /app/.blobs && chown -R node:node /app/.blobs
VOLUME ["/app/.blobs"]

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
