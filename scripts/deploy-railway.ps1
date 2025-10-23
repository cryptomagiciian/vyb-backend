# VYB Backend Railway Deployment Script (Windows PowerShell)
param(
    [switch]$SkipLogin
)

Write-Host "Deploying VYB Backend to Railway..." -ForegroundColor Green

# Check if Railway CLI is installed
try {
    railway --version | Out-Null
    Write-Host "Railway CLI found" -ForegroundColor Green
} catch {
    Write-Host "Railway CLI not found. Installing..." -ForegroundColor Red
    npm install -g @railway/cli
}

# Login to Railway (if not already logged in)
if (-not $SkipLogin) {
    Write-Host "Checking Railway authentication..." -ForegroundColor Yellow
    try {
        railway whoami | Out-Null
        Write-Host "Already logged in to Railway" -ForegroundColor Green
    } catch {
        Write-Host "Please login to Railway:" -ForegroundColor Yellow
        railway login
    }
}

# Create new project or link to existing
Write-Host "Setting up Railway project..." -ForegroundColor Yellow
if (-not (Test-Path ".railway/project.json")) {
    Write-Host "Creating new Railway project..." -ForegroundColor Yellow
    railway project new vyb-backend
} else {
    Write-Host "Using existing Railway project..." -ForegroundColor Green
}

# Set environment variables
Write-Host "Setting environment variables..." -ForegroundColor Yellow
railway variables set NODE_ENV=production
railway variables set PORT=8080

# Database URL (Railway will provide this)
Write-Host "Setting up PostgreSQL database..." -ForegroundColor Yellow
railway add postgresql

# Redis URL (Railway will provide this)
Write-Host "Setting up Redis..." -ForegroundColor Yellow
railway add redis

# Wait for services to be ready
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Get database URL and set it
$DB_URL = railway variables get DATABASE_URL
if (-not $DB_URL) {
    Write-Host "Failed to get DATABASE_URL from Railway" -ForegroundColor Red
    exit 1
}

# Get Redis URL and set it
$REDIS_URL = railway variables get REDIS_URL
if (-not $REDIS_URL) {
    Write-Host "Failed to get REDIS_URL from Railway" -ForegroundColor Red
    exit 1
}

# Set other required environment variables
Write-Host "Setting up authentication secrets..." -ForegroundColor Yellow
$JWT_SECRET = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$MAGIC_LINK_SECRET = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

railway variables set JWT_SECRET=$JWT_SECRET
railway variables set MAGIC_LINK_SECRET=$MAGIC_LINK_SECRET

# Set email configuration
Write-Host "Setting up email configuration..." -ForegroundColor Yellow
railway variables set EMAIL_FROM="noreply@vyb.app"
Write-Host "Please set RESEND_API_KEY in Railway dashboard:" -ForegroundColor Yellow
Write-Host "https://railway.app/dashboard" -ForegroundColor Cyan

# Set CORS origin
Write-Host "Setting CORS configuration..." -ForegroundColor Yellow
railway variables set CORS_ORIGIN="https://your-frontend-domain.com"

# Set ranking algorithm weights
Write-Host "Setting ranking algorithm weights..." -ForegroundColor Yellow
railway variables set RANKING_W1_LIQUIDITY=0.28
railway variables set RANKING_W2_VOLUME=0.22
railway variables set RANKING_W3_DRIFT=0.16
railway variables set RANKING_W4_SOCIAL=0.24
railway variables set RANKING_W5_TIME=0.10

# Set rate limits
Write-Host "Setting rate limits..." -ForegroundColor Yellow
railway variables set RATE_LIMIT_IP_PER_MINUTE=120
railway variables set RATE_LIMIT_USER_SWIPES_PER_MINUTE=30

# Set feature flags
Write-Host "Setting feature flags..." -ForegroundColor Yellow
railway variables set ENABLE_INSIGHTS=true
railway variables set ENABLE_REALTIME=true
railway variables set ENABLE_OTEL=false

# Deploy the application
Write-Host "Deploying application..." -ForegroundColor Yellow
railway up

# Wait for deployment to complete
Write-Host "Waiting for deployment to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Run database migrations
Write-Host "Running database migrations..." -ForegroundColor Yellow
railway run npm run db:migrate:deploy

# Seed the database
Write-Host "Seeding database..." -ForegroundColor Yellow
railway run npm run db:seed

# Get the deployed URL
$DEPLOY_URL = railway domain
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Your VYB API is available at: https://$DEPLOY_URL" -ForegroundColor Cyan
Write-Host "API Documentation: https://$DEPLOY_URL/docs" -ForegroundColor Cyan
Write-Host "Health Check: https://$DEPLOY_URL/healthz" -ForegroundColor Cyan
Write-Host "OpenAPI JSON: https://$DEPLOY_URL/docs-json" -ForegroundColor Cyan

# Test the deployment
Write-Host "Testing deployment..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://$DEPLOY_URL/healthz" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "Health check passed" -ForegroundColor Green
    } else {
        throw "Health check failed with status $($response.StatusCode)"
    }
} catch {
    Write-Host "Health check failed. Please check the logs:" -ForegroundColor Red
    railway logs
    exit 1
}

Write-Host "VYB Backend successfully deployed to Railway!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Set RESEND_API_KEY in Railway dashboard" -ForegroundColor White
Write-Host "2. Update CORS_ORIGIN with your frontend domain" -ForegroundColor White
Write-Host "3. Configure your Lovable frontend with the API URL" -ForegroundColor White
Write-Host "4. Test the integration with your frontend" -ForegroundColor White
Write-Host ""
Write-Host "Railway Dashboard: https://railway.app/dashboard" -ForegroundColor Cyan
Write-Host "API URL: https://$DEPLOY_URL" -ForegroundColor Cyan