# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace
COPY . .

RUN git rev-parse HEAD > /commit_sha.txt 2>/dev/null || echo unknown > /commit_sha.txt

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @campushomes/shared build
RUN pnpm --filter @campushomes/api build
RUN pnpm --offline --filter @campushomes/api deploy --prod --legacy /prod/api

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
COPY --from=builder /commit_sha.txt ./commit_sha.txt

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/src/main.js"]
