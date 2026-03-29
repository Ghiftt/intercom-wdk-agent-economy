import { GokiteAASDK } from 'gokite-aa-sdk';
import { ethers } from 'ethers';

// Kite testnet config
const KITE_RPC = 'https://rpc-testnet.gokite.ai';
const BUNDLER_RPC = 'https://bundler-service.staging.gokite.ai/rpc/';
const NETWORK = 'kite_testnet';

// Your agents — give each a unique private key
const AGENTS = [
  { name: 'Scout-1',    privateKey: process.env.SCOUT_KEY },
  { name: 'Analyzer-1', privateKey: process.env.ANALYZER_KEY },
  { name: 'Executor-1', privateKey: process.env.EXECUTOR_KEY },
  { name: 'Validator-1', privateKey: process.env.VALIDATOR_KEY },
];

async function setupAgents() {
  const sdk = new GokiteAASDK(NETWORK, KITE_RPC, BUNDLER_RPC);

  for (const agent of AGENTS) {
    const wallet = new ethers.Wallet(agent.privateKey);
    const aaAddress = sdk.getAccountAddress(wallet.address);

    console.log(`\n${agent.name}`);
    console.log(`  EOA Address : ${wallet.address}`);
    console.log(`  AA Wallet   : ${aaAddress}`);
  }
}

setupAgents().catch(console.error);
