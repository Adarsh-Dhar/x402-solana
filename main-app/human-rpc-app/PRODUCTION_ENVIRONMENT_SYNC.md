# Production Environment Synchronization Guide

This guide ensures that production environment matches the development environment configuration.

## Critical Environment Variables

### Required for Production Deployment

Add these environment variables to your production environment (Vercel, Railway, etc.):

```bash
# Stake Configuration
NEXT_PUBLIC_STAKE_AMOUNT_SOL=0.01

# Solana Configuration
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
NEXT_PUBLIC_STAKING_WALLET=CVCq5Swz7Fbzku7iNqgeANjYLJgQDAgnf4vq8nCbaRn2
NEXT_PUBLIC_STAKE_MINT=4hkhMPGQYyp3zxfAtVyiTFwnfFMVZumE8295WE4qAryo

# Authentication
AUTH_SECRET=your-production-auth-secret
NEXTAUTH_URL=https://your-production-domain.com

# Database
DATABASE_URL=your-production-database-url

# Optional Features
ENABLE_NEGATIVE_POINTS_CLEANUP=true
```

## Deployment Checklist

### 1. Environment Variables
- [ ] `NEXT_PUBLIC_STAKE_AMOUNT_SOL` is set to `0.01`
- [ ] All Solana-related environment variables are configured
- [ ] Database URL is set for production
- [ ] Auth secret is set and secure

### 2. Code Synchronization
- [ ] Latest code is deployed from main branch
- [ ] All hardcoded stake amounts have been removed
- [ ] Centralized stake configuration is being used

### 3. Wallet Configuration
- [ ] Solana wallet adapter is properly configured
- [ ] Wallet buttons are rendering correctly
- [ ] Connection to devnet is working

### 4. Testing
- [ ] Register page shows correct stake amount (0.01 SOL)
- [ ] Wallet connection works properly
- [ ] Staking flow completes successfully
- [ ] No debug elements are visible in production

## Key Changes Made

1. **Centralized Configuration**: Created `lib/stake-config.ts` to manage stake amounts
2. **Environment Variable**: Added `NEXT_PUBLIC_STAKE_AMOUNT_SOL` to control stake amount
3. **Removed Hardcoded Values**: Eliminated hardcoded 0.1 SOL and $20 SOL references
4. **Cleaned UI**: Removed debug elements and test buttons
5. **Synchronized Frontend/Backend**: Both use the same stake configuration

## Verification

After deployment, verify:

1. Visit `/login/register` page
2. Check that "Required Stake" shows `0.01 SOL`
3. Verify wallet connection buttons are visible and functional
4. Confirm no debug elements are present
5. Test the complete registration and staking flow

## Troubleshooting

If production still shows different values:

1. Check environment variables in your deployment platform
2. Verify the latest code is deployed
3. Clear any build caches
4. Check browser cache and hard refresh
5. Verify the `lib/stake-config.ts` file is included in the build