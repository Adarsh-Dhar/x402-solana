#!/usr/bin/env node

/**
 * Setup script to create test users with wallet addresses for SOL payments
 * This is for development/testing purposes only
 */

const { PrismaClient } = require('@prisma/client');
const { Keypair } = require('@solana/web3.js');
const bcrypt = require('bcryptjs');

async function setupTestUsers() {
  const prisma = new PrismaClient();
  
  console.log('👥 Setting up test users with wallet addresses...');
  
  try {
    // Create 5 test users with wallet addresses
    const testUsers = [];
    
    for (let i = 1; i <= 5; i++) {
      const email = `#1${i}@gmail.com`;
      const password = await bcrypt.hash('password123', 10);
      const walletKeypair = Keypair.generate();
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        // Update existing user with wallet address
        const updatedUser = await prisma.user.update({
          where: { email },
          data: {
            walletAddress: walletKeypair.publicKey.toBase58(),
            points: 0 // Reset points for testing
          }
        });
        console.log(`✅ Updated user: ${email} -> ${updatedUser.walletAddress}`);
        testUsers.push(updatedUser);
      } else {
        // Create new user
        const newUser = await prisma.user.create({
          data: {
            email,
            password,
            walletAddress: walletKeypair.publicKey.toBase58(),
            points: 0,
            rank: 'CADET'
          }
        });
        console.log(`✅ Created user: ${email} -> ${newUser.walletAddress}`);
        testUsers.push(newUser);
      }
    }
    
    console.log('');
    console.log('📊 Test Users Summary:');
    testUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} -> ${user.walletAddress} (${user.points} points)`);
    });
    
    console.log('');
    console.log('✅ Test users setup complete!');
    console.log('💡 These users can now receive SOL payments when they vote correctly.');
    
  } catch (error) {
    console.error('❌ Error setting up test users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupTestUsers();