#!/bin/bash
# Add 4GB swap space to prevent OOM kills during Docker builds

set -e

echo "🔍 Checking current swap..."
free -h

if [ $(swapon --show | wc -l) -gt 0 ]; then
    echo "✅ Swap already exists"
    exit 0
fi

echo "📝 Creating 4GB swap file..."
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096

echo "🔒 Setting permissions..."
sudo chmod 600 /swapfile

echo "⚙️  Setting up swap..."
sudo mkswap /swapfile

echo "🔄 Enabling swap..."
sudo swapon /swapfile

echo "💾 Making swap permanent..."
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo "✅ Swap added successfully!"
free -h
