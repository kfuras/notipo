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

    envsubst '${API_INTERNAL_URL} ${NGINX_PORT} ${DNS_RESOLVER}' \
        < /etc/nginx/proxy.conf.template \
        > /etc/nginx/conf.d/default.conf
fi

# Self-hosted: redirect landing page to login/register
if [ "$SELF_HOSTED" = "true" ]; then
    sed -i '/location \/ {/i \
    location = / { return 302 /auth/login; }' /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
