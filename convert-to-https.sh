#!/bin/bash

domain_name=${1:-$domain_name}

if [ -z "$domain_name" ]; then
    echo "Usage: ./convert-to-https.sh yourdomain.com"
    exit 1
fi

# Check if SSL certificate exists
if [ ! -d "/etc/letsencrypt/live/$domain_name" ]; then
    echo "❌ SSL certificate not found for $domain_name"
    echo "Run ssl-setup.sh first"
    exit 1
fi

echo "🔄 Converting nginx config to HTTPS..."

# Backup current config
sudo cp /etc/nginx/sites-available/emaus /etc/nginx/sites-available/emaus.backup.$(date +%Y%m%d-%H%M%S)

# Replace $domain_name in the full HTTPS config and apply
sed "s/\$domain_name/$domain_name/g" nginx.conf | sudo tee /etc/nginx/sites-available/emaus > /dev/null

# Test configuration
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded with HTTPS configuration"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo "🎉 Conversion complete! Your site is now HTTPS-only"