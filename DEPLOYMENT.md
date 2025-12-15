# Deployment Guide

## Vercel Deployment

This project is configured to deploy the Next.js app from `main-app/human-rpc-app/` directory.

### Required Environment Variables

Set these environment variables in your Vercel project settings:

```bash
# Database
DATABASE_URL="your-postgresql-connection-string"

# Authentication
AUTH_SECRET="your-secure-random-string-32-chars-min"
NEXTAUTH_URL="https://your-vercel-domain.vercel.app"

# Solana Configuration
NEXT_PUBLIC_STAKE_MINT="4hkhMPGQYyp3zxfAtVyiTFwnfFMVZumE8295WE4qAryo"
NEXT_PUBLIC_STAKING_WALLET="CVCq5Swz7Fbzku7iNqgeANjYLJgQDAgnf4vq8nCbaRn2"

# Optional Features
ENABLE_NEGATIVE_POINTS_CLEANUP="true"
```

### Setup Steps

1. **Database Setup**: 
   - Create a PostgreSQL database (recommended: Neon, Supabase, or PlanetScale)
   - Set the `DATABASE_URL` environment variable

2. **Authentication Secret**:
   - Generate a secure random string: `openssl rand -base64 32`
   - Set as `AUTH_SECRET` environment variable

3. **Domain Configuration**:
   - Set `NEXTAUTH_URL` to your Vercel deployment URL
   - Example: `https://your-app.vercel.app`

4. **Deploy**:
   - Push to your connected Git repository
   - Vercel will automatically build and deploy

### Troubleshooting

- **404 Error**: Check that `rootDirectory` is set to `main-app/human-rpc-app` in vercel.json
- **Database Errors**: Ensure DATABASE_URL is correct and database is accessible
- **Auth Errors**: Verify AUTH_SECRET is set and NEXTAUTH_URL matches your domain