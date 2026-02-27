#!/bin/sh
set -e

echo "=== entrypoint.sh starting ==="
echo "API_INTERNAL_URL=${API_INTERNAL_URL:-not set}"
echo "PORT=${PORT:-not set}"

if [ -n "$API_INTERNAL_URL" ]; then
    export NGINX_PORT=${PORT:-80}

    # Get DNS resolver, wrap IPv6 in brackets for nginx
    DNS_RAW=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')
    case "$DNS_RAW" in
        *:*) export DNS_RESOLVER="[$DNS_RAW]" ;;
        *)   export DNS_RESOLVER="$DNS_RAW" ;;
    esac

    echo "=== Railway nginx proxy ==="
    echo "API_INTERNAL_URL: $API_INTERNAL_URL"
    echo "NGINX_PORT: $NGINX_PORT"
    echo "DNS_RESOLVER: $DNS_RESOLVER"

    envsubst '${API_INTERNAL_URL} ${NGINX_PORT} ${DNS_RESOLVER}' \
        < /etc/nginx/proxy.conf.template \
        > /etc/nginx/conf.d/default.conf

    echo "=== Generated nginx config ==="
    cat /etc/nginx/conf.d/default.conf
    echo "=== End config ==="
fi

exec nginx -g 'daemon off;'
