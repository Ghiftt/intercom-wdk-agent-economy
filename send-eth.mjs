import { ethers } from 'ethers';

const KITE_RPC = process.env.KITE_RPC;
const SCOUT_KEY = process.env.SCOUT_PRIVATE_KEY;

async function sendETH() {
  const provider = new ethers.JsonRpcProvider(KITE_RPC, {
    chainId: 2368,
    name: 'kite-testnet'
  });

  const scout = new ethers.Wallet(SCOUT_KEY, provider);

  const tx = await scout.sendTransaction({
    to: '0xB49c26DaCFA3a244b401A2BB360530a97D9e3527',
    value: ethers.parseEther('0.2')
  });

  console.log('Transaction sent:', tx.hash);
  await tx.wait();
  console.log('Confirmed.');

  const scoutBalance = await provider.getBalance(scout.address);
  const validatorBalance = await provider.getBalance('0xB49c26DaCFA3a244b401A2BB360530a97D9e3527');

  console.log(`\nScout-1    : ${ethers.formatEther(scoutBalance)} ETH`);
  console.log(`Validator-1: ${ethers.formatEther(validatorBalance)} ETH`);
}

sendETH().catch(console.error);
