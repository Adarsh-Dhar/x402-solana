# Deployment Guide

## Vercel Deployment

This is a monorepo with the Next.js app located in `main-app/human-rpc-app/` directory.

### Vercel Project Configuration

In your Vercel project settings, configure:

1. **Framework Preset**: Next.js
2. **Root Directory**: `main-app/human-rpc-app`
3. **Build Command**: `pnpm install && pnpm prisma generate && pnpm run build`
4. **Output Directory**: Leave empty (default `.next`)
5. **Install Command**: `pnpm install`

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
   - In project settings, set Root Directory to `main-app/human-rpc-app`
   - Configure the build commands as shown above

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

- **404 Error**: Ensure Root Directory is set to `main-app/human-rpc-app` in Vercel project settings
- **Build Errors**: Check that all environment variables are set correctly
- **Database Errors**: Ensure DATABASE_URL is correct and database is accessible
- **Auth Errors**: Verify AUTH_SECRET is set and NEXTAUTH_URL matches your domain

### Alternative: Manual Configuration

If the Vercel dashboard configuration doesn't work, you can also configure the project by:

1. Going to your Vercel project settings
2. Under "General" → "Root Directory", set it to `main-app/human-rpc-app`
3. Under "General" → "Build & Output Settings":
   - Build Command: `pnpm install && pnpm prisma generate && pnpm run build`
   - Output Directory: Leave empty
   - Install Command: `pnpm install`