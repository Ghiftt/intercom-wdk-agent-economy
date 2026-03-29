import { ethers } from 'ethers';

// Kite testnet config
const KITE_RPC = process.env.KITE_RPC;
const BUNDLER_RPC = process.env.BUNDLER_RPC;

// Genesis agents — Scout and Validator
const GENESIS_AGENTS = [
  { name: 'Scout-1',     privateKey: process.env.SCOUT_PRIVATE_KEY },
  { name: 'Validator-1', privateKey: process.env.VALIDATOR_PRIVATE_KEY },
];

async function setupAgents() {
  const provider = new ethers.JsonRpcProvider(KITE_RPC);

  for (const agent of GENESIS_AGENTS) {
    const wallet = new ethers.Wallet(agent.privateKey, provider);
    const balance = await provider.getBalance(wallet.address);

    console.log(`\n${agent.name}`);
    console.log(`  Address : ${wallet.address}`);
    console.log(`  Balance : ${ethers.formatEther(balance)} ETH`);
  }
}

setupAgents().catch(console.error);
