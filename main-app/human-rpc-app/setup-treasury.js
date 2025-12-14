#!/usr/bin/env node

/**
 * Setup script to generate a test treasury keypair for SOL payments
 * This is for development/testing purposes only
 */

const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔑 Generating test treasury keypair...');

// Generate a new keypair
const keypair = Keypair.generate();

console.log('📋 Treasury Configuration:');
console.log('Public Key (Wallet Address):', keypair.publicKey.toBase58());
console.log('Secret Key (for .env):', JSON.stringify(Array.from(keypair.secretKey)));

// Update .env.local file
const envPath = '.env.local';
let envContent = '';

try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  console.log('Creating new .env.local file...');
}

// Remove existing treasury config if present
envContent = envContent.replace(/^TREASURY_SECRET_KEY=.*$/gm, '');
envContent = envContent.replace(/^NEXT_PUBLIC_STAKING_WALLET=.*$/gm, '');

// Add new treasury config
envContent += `\n# Treasury configuration for SOL payments (TEST ONLY)`;
envContent += `\nTREASURY_SECRET_KEY=${JSON.stringify(Array.from(keypair.secretKey))}`;
envContent += `\nNEXT_PUBLIC_STAKING_WALLET=${keypair.publicKey.toBase58()}`;
envContent += `\n`;

// Write back to file
fs.writeFileSync(envPath, envContent);

console.log('✅ Treasury configuration added to .env.local');
console.log('');
console.log('⚠️  IMPORTANT: This is a TEST keypair with no SOL balance!');
console.log('   For actual payments, you need to:');
console.log('   1. Fund this wallet with SOL on devnet');
console.log('   2. Or use a different wallet with sufficient balance');
console.log('');
console.log('💰 To fund the test wallet on devnet:');
console.log(`   Visit: https://faucet.solana.com/`);
console.log(`   Address: ${keypair.publicKey.toBase58()}`);