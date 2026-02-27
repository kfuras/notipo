# Build context: monorepo root (.)
FROM node:22-alpine3.23 AS builder
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
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
# When API_INTERNAL_URL is set (Railway), envsubst renders the template at startup.
# NGINX_PORT defaults to 80, but Railway sets PORT dynamically.
# When unset (VPS/Render), the plain nginx.conf is used as-is.
CMD ["sh", "-c", "if [ -n \"$API_INTERNAL_URL\" ]; then export NGINX_PORT=${PORT:-80}; DNS_RAW=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}'); if echo \"$DNS_RAW\" | grep -q ':'; then export DNS_RESOLVER=\"[$DNS_RAW]\"; else export DNS_RESOLVER=\"$DNS_RAW\"; fi; envsubst '${API_INTERNAL_URL} ${NGINX_PORT} ${DNS_RESOLVER}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf; fi && nginx -g 'daemon off;'"]
