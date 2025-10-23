# VYB Backend Railway Deployment Script (Simplified)
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

# Initialize Railway project
Write-Host "Initializing Railway project..." -ForegroundColor Yellow
railway init

# Deploy the application
Write-Host "Deploying application..." -ForegroundColor Yellow
railway up

# Wait for deployment to complete
Write-Host "Waiting for deployment to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Get the deployed URL
Write-Host "Getting deployment URL..." -ForegroundColor Yellow
$DEPLOY_URL = railway domain

if ($DEPLOY_URL) {
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
    }
    
    Write-Host "VYB Backend successfully deployed to Railway!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Set environment variables in Railway dashboard" -ForegroundColor White
    Write-Host "2. Add PostgreSQL and Redis services" -ForegroundColor White
    Write-Host "3. Configure your Lovable frontend with the API URL" -ForegroundColor White
    Write-Host "4. Test the integration with your frontend" -ForegroundColor White
    Write-Host ""
    Write-Host "Railway Dashboard: https://railway.app/dashboard" -ForegroundColor Cyan
    Write-Host "API URL: https://$DEPLOY_URL" -ForegroundColor Cyan
} else {
    Write-Host "Failed to get deployment URL. Please check Railway dashboard." -ForegroundColor Red
    railway status
}
