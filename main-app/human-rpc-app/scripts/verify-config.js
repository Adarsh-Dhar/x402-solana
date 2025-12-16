#!/usr/bin/env node

/**
 * Configuration Verification Script
 * 
 * This script verifies that the stake configuration is consistent
 * across frontend and backend components.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Human RPC Configuration...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log(`NEXT_PUBLIC_STAKE_AMOUNT_SOL: ${process.env.NEXT_PUBLIC_STAKE_AMOUNT_SOL || 'NOT SET'}`);
console.log(`NEXT_PUBLIC_SOLANA_RPC_URL: ${process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'NOT SET'}`);
console.log(`NEXT_PUBLIC_STAKING_WALLET: ${process.env.NEXT_PUBLIC_STAKING_WALLET || 'NOT SET'}`);
console.log('');

// Check if stake config file exists
const stakeConfigPath = path.join(__dirname, '../lib/stake-config.ts');
if (fs.existsSync(stakeConfigPath)) {
  console.log('✅ Stake configuration file exists: lib/stake-config.ts');
} else {
  console.log('❌ Stake configuration file missing: lib/stake-config.ts');
}

// Check for hardcoded values in key files
const filesToCheck = [
  'app/login/register/page.tsx',
  'app/api/stake/route.ts',
  'components/views/login.tsx',
  'app/login/page.tsx'
];

console.log('\n🔍 Checking for hardcoded stake values...');

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for hardcoded values
    const hardcodedPatterns = [
      /STAKE_AMOUNT_SOL\s*=\s*0\.1/,
      /STAKE_AMOUNT_SOL\s*=\s*0\.01/,
      /\$20.*SOL/,
      /20.*SOL/
    ];
    
    let hasHardcoded = false;
    hardcodedPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        hasHardcoded = true;
      }
    });
    
    if (hasHardcoded) {
      console.log(`⚠️  ${file}: May contain hardcoded values`);
    } else {
      console.log(`✅ ${file}: Clean`);
    }
  } else {
    console.log(`❌ ${file}: File not found`);
  }
});

console.log('\n📊 Configuration Summary:');
console.log('- Stake amount should be controlled by NEXT_PUBLIC_STAKE_AMOUNT_SOL');
console.log('- Default value is 0.01 SOL if environment variable is not set');
console.log('- All components should import from lib/stake-config.ts');
console.log('- No hardcoded stake amounts should remain in the code');

console.log('\n🚀 Verification complete!');