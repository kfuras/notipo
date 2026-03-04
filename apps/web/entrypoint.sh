#!/bin/sh
set -e

if [ -n "$API_INTERNAL_URL" ]; then
    export NGINX_PORT=${PORT:-80}

    # Get DNS resolver, wrap IPv6 in brackets for nginx
    DNS_RAW=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')
    case "$DNS_RAW" in
        *:*) export DNS_RESOLVER="[$DNS_RAW]" ;;
        *)   export DNS_RESOLVER="$DNS_RAW" ;;
    esac

    if [ -n "$SITE_INTERNAL_URL" ]; then
        # Staging mode: proxy API + marketing site, serve admin UI locally
        envsubst '${API_INTERNAL_URL} ${SITE_INTERNAL_URL} ${NGINX_PORT} ${DNS_RESOLVER}' \
            < /etc/nginx/staging.conf.template \
            > /etc/nginx/conf.d/default.conf
    else
        # Railway mode: proxy API, serve admin UI locally
        envsubst '${API_INTERNAL_URL} ${NGINX_PORT} ${DNS_RESOLVER}' \
            < /etc/nginx/proxy.conf.template \
            > /etc/nginx/conf.d/default.conf
    fi
fi

exec nginx -g 'daemon off;'
