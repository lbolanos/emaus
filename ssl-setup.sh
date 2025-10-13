#!/bin/bash
set -e

echo "🔒 Setting up SSL with Let's Encrypt for Emaus"

# Check domain parameter
if [ -z "$domain_name" ]; then
    echo "❌ Error: Domain name not provided. Usage: domain_name=yourdomain.com bash ssl-setup.sh"
    exit 1
fi

echo "🔒 Obtaining SSL certificate for $domain_name..."

# Stop nginx temporarily (required for standalone certbot)
sudo systemctl stop nginx

# Get certificate using standalone mode
sudo certbot certonly --standalone -d $domain_name -d www.$domain_name

# Start nginx again
sudo systemctl start nginx

echo "✅ SSL certificate obtained successfully!"

# Test nginx configuration with SSL
sudo nginx -t

# Reload nginx to apply changes
sudo systemctl reload nginx

# Setup automatic renewal
echo "🔄 Setting up SSL certificate auto-renewal..."

# Add renewal hook
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << EOF
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh

# Test renewal
echo "🧪 Testing SSL renewal..."
sudo certbot renew --dry-run

echo "✅ SSL setup completed!"
echo "🌐 Your application is now secure at https://$domain_name"

# Display certificate information
echo "📋 SSL Certificate information:"
sudo certbot certificates
