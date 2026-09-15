# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

ARG GIT_COMMIT_SHA=unknown

WORKDIR /workspace
COPY . .

RUN echo "$GIT_COMMIT_SHA" > /commit_sha.txt

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @campushomes/shared build
RUN pnpm --filter @campushomes/api build
RUN pnpm --offline --filter @campushomes/api deploy --prod --legacy /prod/api

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
COPY --from=builder --chown=node:node /workspace/apps/api/migrations ./migrations
COPY --from=builder /commit_sha.txt ./commit_sha.txt

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/v1/health`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

# DATABASE_URL remains the least-privilege runtime connection. When the
# separately-scoped migration URL is configured, apply SQL before booting so
# code and schema cannot silently drift apart during a deploy.
CMD ["sh", "-c", "if [ -n \"$DATABASE_MIGRATIONS_URL\" ]; then node dist/src/db/migrate.js; fi; exec node dist/src/main.js"]
