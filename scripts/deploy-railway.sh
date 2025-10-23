#!/bin/bash

# VYB Backend Railway Deployment Script
set -e

echo "🚀 Deploying VYB Backend to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

# Create new project or link to existing
echo "📦 Setting up Railway project..."
if [ ! -f ".railway/project.json" ]; then
    echo "Creating new Railway project..."
    railway project new vyb-backend
else
    echo "Using existing Railway project..."
fi

# Set environment variables
echo "🔧 Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=8080

# Database URL (Railway will provide this)
echo "📊 Setting up PostgreSQL database..."
railway add postgresql

# Redis URL (Railway will provide this)
echo "🔴 Setting up Redis..."
railway add redis

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Get database URL and set it
DB_URL=$(railway variables get DATABASE_URL)
if [ -z "$DB_URL" ]; then
    echo "❌ Failed to get DATABASE_URL from Railway"
    exit 1
fi

# Get Redis URL and set it
REDIS_URL=$(railway variables get REDIS_URL)
if [ -z "$REDIS_URL" ]; then
    echo "❌ Failed to get REDIS_URL from Railway"
    exit 1
fi

# Set other required environment variables
echo "🔑 Setting up authentication secrets..."
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set MAGIC_LINK_SECRET=$(openssl rand -base64 32)

# Set email configuration
echo "📧 Setting up email configuration..."
railway variables set EMAIL_FROM="noreply@vyb.app"
echo "Please set RESEND_API_KEY in Railway dashboard:"
echo "https://railway.app/dashboard"

# Set CORS origin
echo "🌐 Setting CORS configuration..."
railway variables set CORS_ORIGIN="https://your-frontend-domain.com"

# Set ranking algorithm weights
echo "⚖️ Setting ranking algorithm weights..."
railway variables set RANKING_W1_LIQUIDITY=0.28
railway variables set RANKING_W2_VOLUME=0.22
railway variables set RANKING_W3_DRIFT=0.16
railway variables set RANKING_W4_SOCIAL=0.24
railway variables set RANKING_W5_TIME=0.10

# Set rate limits
echo "🚦 Setting rate limits..."
railway variables set RATE_LIMIT_IP_PER_MINUTE=120
railway variables set RATE_LIMIT_USER_SWIPES_PER_MINUTE=30

# Set feature flags
echo "🚩 Setting feature flags..."
railway variables set ENABLE_INSIGHTS=true
railway variables set ENABLE_REALTIME=true
railway variables set ENABLE_OTEL=false

# Deploy the application
echo "🚀 Deploying application..."
railway up

# Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
sleep 30

# Run database migrations
echo "📊 Running database migrations..."
railway run npm run db:migrate:deploy

# Seed the database
echo "🌱 Seeding database..."
railway run npm run db:seed

# Get the deployed URL
DEPLOY_URL=$(railway domain)
echo "✅ Deployment complete!"
echo "🌐 Your VYB API is available at: https://$DEPLOY_URL"
echo "📚 API Documentation: https://$DEPLOY_URL/docs"
echo "🏥 Health Check: https://$DEPLOY_URL/healthz"
echo "📋 OpenAPI JSON: https://$DEPLOY_URL/docs-json"

# Test the deployment
echo "🧪 Testing deployment..."
curl -f "https://$DEPLOY_URL/healthz" || {
    echo "❌ Health check failed. Please check the logs:"
    railway logs
    exit 1
}

echo "🎉 VYB Backend successfully deployed to Railway!"
echo ""
echo "Next steps:"
echo "1. Set RESEND_API_KEY in Railway dashboard"
echo "2. Update CORS_ORIGIN with your frontend domain"
echo "3. Configure your Lovable frontend with the API URL"
echo "4. Test the integration with your frontend"
echo ""
echo "Railway Dashboard: https://railway.app/dashboard"
echo "API URL: https://$DEPLOY_URL"
