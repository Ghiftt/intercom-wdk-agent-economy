import { ethers } from 'ethers';

const KITE_RPC = process.env.KITE_RPC;
const SCOUT_KEY = process.env.SCOUT_PRIVATE_KEY;
const VALIDATOR_KEY = process.env.VALIDATOR_PRIVATE_KEY;
const REGISTRY_ADDRESS = process.env.PROVEX_REGISTRY;

const REGISTRY_ABI = [
  "function register(string memory name, string[] memory capabilities) external payable",
  "function getAgent(address agentAddress) external view returns (tuple(address agentAddress, string name, string[] capabilities, uint256 stake, uint256 registeredAt, uint256 reputationScore, uint8 status))",
  "event AgentRegistered(address indexed agentAddress, string name, uint256 timestamp)"
];

const AGENTS = [
  {
    name: 'Scout-1',
    privateKey: SCOUT_KEY,
    capabilities: ['task-discovery', 'task-routing'],
  },
  {
    name: 'Validator-1',
    privateKey: VALIDATOR_KEY,
    capabilities: ['validation', 'attestation', 'consensus'],
  },
];

async function registerAgents() {
  const provider = new ethers.JsonRpcProvider(KITE_RPC, {
    chainId: 2368,
    name: 'kite-testnet'
  });

  for (const agent of AGENTS) {
    const wallet = new ethers.Wallet(agent.privateKey, provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

    console.log(`\nRegistering ${agent.name}...`);
    const tx = await registry.register(agent.name, agent.capabilities, {
      value: ethers.parseEther('0.01')
    });
    await tx.wait();
    console.log(`  TX Hash : ${tx.hash}`);

    const agentData = await registry.getAgent(wallet.address);
    console.log(`  Name         : ${agentData.name}`);
    console.log(`  Reputation   : ${agentData.reputationScore}`);
    console.log(`  Registered At: ${new Date(Number(agentData.registeredAt) * 1000).toISOString()}`);
    console.log(`  Status       : ${agentData.status === 0n ? 'Active' : 'Banned'}`);
    console.log(`  Explorer     : https://testnet.kitescan.ai/tx/${tx.hash}`);
  }

  console.log('\nBoth genesis agents registered on Kite chain.');
}

registerAgents().catch(console.error);
