# Deployment Guide

## Vercel Deployment

The Next.js app has been moved to the root directory for easier deployment.

### Vercel Project Configuration

Vercel should automatically detect this as a Next.js project. Default settings should work:

1. **Framework Preset**: Next.js (auto-detected)
2. **Root Directory**: Leave empty (root)
3. **Build Command**: `pnpm run build` (auto-detected)
4. **Output Directory**: Leave empty (default `.next`)
5. **Install Command**: `pnpm install` (auto-detected)

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

1. **Vercel Project Setup**:
   - Import your GitHub repository to Vercel
   - Vercel should automatically detect this as a Next.js project
   - No additional configuration needed

2. **Database Setup**: 
   - Create a PostgreSQL database (recommended: Neon, Supabase, or PlanetScale)
   - Set the `DATABASE_URL` environment variable

3. **Authentication Secret**:
   - Generate a secure random string: `openssl rand -base64 32`
   - Set as `AUTH_SECRET` environment variable

4. **Domain Configuration**:
   - Set `NEXTAUTH_URL` to your Vercel deployment URL
   - Example: `https://your-app.vercel.app`

5. **Deploy**:
   - Push to your connected Git repository
   - Vercel will automatically build and deploy

### Testing the Deployment

After deployment, test these URLs:
- `https://your-app.vercel.app/health` - App health check
- `https://your-app.vercel.app/api/health` - API health check
- `https://your-app.vercel.app/login` - Login page

### Troubleshooting

- **Build Errors**: Check that all environment variables are set correctly
- **Database Errors**: Ensure DATABASE_URL is correct and database is accessible
- **Auth Errors**: Verify AUTH_SECRET is set and NEXTAUTH_URL matches your domain
- **Prisma Errors**: The `postinstall` script should automatically run `prisma generate`