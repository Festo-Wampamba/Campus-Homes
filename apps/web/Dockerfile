# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace
COPY . .

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_PAYMENTS_ENABLED=false
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_TILE_URL
ARG NEXT_PUBLIC_SOKETI_HOST
ARG NEXT_PUBLIC_SOKETI_KEY

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_PAYMENTS_ENABLED=$NEXT_PUBLIC_PAYMENTS_ENABLED
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ENV NEXT_PUBLIC_TILE_URL=$NEXT_PUBLIC_TILE_URL
ENV NEXT_PUBLIC_SOKETI_HOST=$NEXT_PUBLIC_SOKETI_HOST
ENV NEXT_PUBLIC_SOKETI_KEY=$NEXT_PUBLIC_SOKETI_KEY

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @campushomes/shared build
RUN pnpm --filter @campushomes/web build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

USER node
WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
