# Production Setup Guide

## Critical Issues Fixed

### 1. Wallet Connection Issues
- **Problem**: Wallet provider was hardcoded to use Devnet in production
- **Fix**: Updated to use Mainnet in production, Devnet in development
- **Files Updated**: 
  - `components/providers/wallet-provider.tsx`
  - `main-app/human-rpc-app/components/providers/wallet-provider.tsx`

### 2. Authentication Issues
- **Problem**: `NEXTAUTH_URL` was commented out
- **Fix**: Added production URL configuration
- **File Updated**: `main-app/human-rpc-app/.env`

### 3. Database Connection
- **Current**: Using Neon PostgreSQL with SSL
- **Status**: ✅ Properly configured with SSL requirements

## Required Environment Variables for Production

Set these in your Vercel deployment:

```bash
# Database (already configured)
DATABASE_URL="postgresql://neondb_owner:qIl2Us5dSBHA@ep-crimson-cloud-a1qxn4vi-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Authentication (CRITICAL - update the URL)
AUTH_SECRET="40122aad7ded1536c549342a79c5a10c"
NEXTAUTH_URL="https://YOUR-ACTUAL-VERCEL-DOMAIN.vercel.app"

# Solana Configuration
NEXT_PUBLIC_STAKE_MINT="4hkhMPGQYyp3zxfAtVyiTFwnfFMVZumE8295WE4qAryo"
NEXT_PUBLIC_STAKING_WALLET="CVCq5Swz7Fbzku7iNqgeANjYLJgQDAgnf4vq8nCbaRn2"

# Solana RPC (REQUIRED for production)
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
# Or use a premium RPC provider for better reliability:
# NEXT_PUBLIC_SOLANA_RPC_URL="https://rpc.helius.xyz/?api-key=YOUR-API-KEY"

# Features
ENABLE_NEGATIVE_POINTS_CLEANUP="true"
```

## Immediate Actions Required

### 1. Update NEXTAUTH_URL ⚠️ CRITICAL
Replace `https://your-production-domain.vercel.app` with your actual Vercel domain in Vercel environment variables:
```bash
NEXTAUTH_URL="https://your-actual-app-name.vercel.app"
```

**How to fix:**
1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add/Update `NEXTAUTH_URL` with your actual domain
5. Redeploy the application

### 2. Consider Premium Solana RPC
The default Solana RPC (`https://api.mainnet-beta.solana.com`) has rate limits. For production, consider:

- **Helius**: `https://rpc.helius.xyz/?api-key=YOUR-API-KEY`
- **QuickNode**: `https://your-endpoint.quiknode.pro/YOUR-API-KEY/`
- **Alchemy**: `https://solana-mainnet.g.alchemy.com/v2/YOUR-API-KEY`

### 3. Test Database Connection
Run this to verify database connectivity:
```bash
npx prisma db pull
```

### 4. Deploy and Test
1. Update environment variables in Vercel
2. Redeploy the application
3. Test wallet connection on mainnet
4. Verify database operations work

## Troubleshooting

### Wallet Issues
- Ensure users have mainnet SOL for transactions
- Check that wallet adapters support mainnet
- Verify RPC endpoint is responding

### Database Issues
- Check Neon database is active and accessible
- Verify SSL connection requirements
- Run `prisma generate` if schema changes

### Auth Issues
- Ensure NEXTAUTH_URL exactly matches your domain
- Check AUTH_SECRET is properly set
- Verify session cookies are working

## Testing Checklist

- [ ] Wallet connects on mainnet
- [ ] User registration works
- [ ] Database queries execute
- [ ] Authentication flows work
- [ ] API endpoints respond correctly
- [ ] Staking operations function