import { ethers } from 'ethers';

const KITE_RPC = process.env.KITE_RPC;
const KITE_TOKEN = process.env.KITE_TOKEN;

const AGENTS = [
  { name: 'Scout-1',     address: '0x254902e2a61D9193544FE13aDc80A9a45f66a747' },
  { name: 'Validator-1', address: '0xB49c26DaCFA3a244b401A2BB360530a97D9e3527' },
];

async function checkBalances() {
  const provider = new ethers.JsonRpcProvider(KITE_RPC, {
    chainId: 2368,
    name: 'kite-testnet'
  });

  // Check ETH balance first to confirm connection works
  for (const agent of AGENTS) {
    const balance = await provider.getBalance(agent.address);
    console.log(`\n${agent.name}`);
    console.log(`  Address : ${agent.address}`);
    console.log(`  ETH Balance : ${ethers.formatEther(balance)}`);

    // Manual ERC20 balanceOf call
    const data = '0x70a08231' + agent.address.slice(2).padStart(64, '0');
    const result = await provider.call({
      to: KITE_TOKEN,
      data: data
    });
    const tokenBalance = BigInt(result);
    console.log(`  Token Balance : ${ethers.formatUnits(tokenBalance, 18)}`);
  }
}

checkBalances().catch(console.error);
