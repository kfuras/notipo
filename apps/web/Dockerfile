# Build context: monorepo root (.)
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# Build shared package first
COPY packages/shared/ ./packages/shared/
RUN npm run build --workspace=@notipo/shared

# Build Next.js
COPY apps/web/ ./apps/web/
RUN npm run build --workspace=@notipo/web

FROM nginx:alpine
COPY --from=builder /app/apps/web/out /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
