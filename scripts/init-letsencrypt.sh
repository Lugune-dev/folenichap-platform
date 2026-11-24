#!/usr/bin/env bash
# First-time TLS bootstrap: dummy cert -> start nginx -> real Let's Encrypt cert -> reload.
set -euo pipefail
source .env
EMAIL="${LETSENCRYPT_EMAIL:-$SUPER_ADMIN_EMAIL}"
CONF=./certbot/conf
mkdir -p "$CONF/live/$DOMAIN" ./certbot/www

if [ ! -f "$CONF/live/$DOMAIN/fullchain.pem" ]; then
  echo "Creating temporary self-signed certificate for $DOMAIN"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CONF/live/$DOMAIN/privkey.pem" -out "$CONF/live/$DOMAIN/fullchain.pem" -subj "/CN=$DOMAIN"
fi

docker compose up -d nginx
rm -rf "$CONF/live/$DOMAIN" "$CONF/archive/$DOMAIN" "$CONF/renewal/$DOMAIN.conf"

docker compose run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot \
  -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --no-eff-email" certbot

docker compose exec nginx nginx -s reload
echo "TLS ready for https://$DOMAIN"
