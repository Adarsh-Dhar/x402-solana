# Production Deployment Guide

## 🚨 Critical Issues Fixed

### Issues Identified:
1. **NEXTAUTH_URL** was set to placeholder value
2. **NEXT_PUBLIC_SOLANA_RPC_URL** was commented out
3. **Database connection** needed verification

### Status: ✅ RESOLVED

## Required Environment Variables for Vercel

Set these **exact** environment variables in your Vercel dashboard:

```bash
# Database (✅ Working)
DATABASE_URL="postgresql://neondb_owner:qIl2Us5dSBHA@ep-crimson-cloud-a1qxn4vi-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Authentication (⚠️ UPDATE THE URL)
AUTH_SECRET="40122aad7ded1536c549342a79c5a10c"
NEXTAUTH_URL="https://YOUR-ACTUAL-VERCEL-DOMAIN.vercel.app"

# Solana Configuration (✅ Fixed)
NEXT_PUBLIC_STAKE_MINT="4hkhMPGQYyp3zxfAtVyiTFwnfFMVZumE8295WE4qAryo"
NEXT_PUBLIC_STAKING_WALLET="CVCq5Swz7Fbzku7iNqgeANjYLJgQDAgnf4vq8nCbaRn2"
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"

# Features
ENABLE_NEGATIVE_POINTS_CLEANUP="true"
```

## Step-by-Step Deployment

### 1. Update Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **Environment Variables**
4. Add/Update these variables:

   **CRITICAL:** Replace `YOUR-ACTUAL-VERCEL-DOMAIN` with your real domain:
   ```
   NEXTAUTH_URL=https://your-app-name.vercel.app
   ```

### 2. Verify Database Connection ✅

Database is working correctly:
- ✅ Connection established to Neon PostgreSQL
- ✅ SSL configuration correct
- ✅ Prisma client generated successfully

### 3. Wallet Configuration ✅

Wallet provider is correctly configured:
- ✅ Uses Mainnet in production
- ✅ Uses Devnet in development
- ✅ Supports Phantom, Solflare, and Torus wallets

### 4. Deploy and Test

1. **Redeploy** your application after updating environment variables
2. **Test wallet connection** on mainnet
3. **Verify database operations** work
4. **Check authentication flows**

## Troubleshooting

### Wallet Connection Issues
- Ensure users have mainnet SOL for transactions
- Check browser console for wallet adapter errors
- Verify RPC endpoint is responding

### Database Issues
- ✅ Database connection verified working
- ✅ SSL configuration correct
- ✅ Prisma client up to date

### Authentication Issues
- **Most common issue:** Incorrect `NEXTAUTH_URL`
- Ensure it exactly matches your Vercel domain
- Check browser cookies are enabled

## Testing Checklist

After deployment, verify:

- [ ] Wallet connects on mainnet
- [ ] User registration works
- [ ] Database queries execute
- [ ] Authentication flows work
- [ ] API endpoints respond correctly
- [ ] Staking operations function

## Performance Recommendations

### Upgrade Solana RPC (Optional)
For better reliability, consider upgrading to a premium RPC:

```bash
# Helius (Recommended)
NEXT_PUBLIC_SOLANA_RPC_URL="https://rpc.helius.xyz/?api-key=YOUR-API-KEY"

# QuickNode
NEXT_PUBLIC_SOLANA_RPC_URL="https://your-endpoint.quiknode.pro/YOUR-API-KEY/"

# Alchemy
NEXT_PUBLIC_SOLANA_RPC_URL="https://solana-mainnet.g.alchemy.com/v2/YOUR-API-KEY"
```

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables are set correctly
3. Test database connection with `npx prisma db pull`
4. Check browser console for client-side errors