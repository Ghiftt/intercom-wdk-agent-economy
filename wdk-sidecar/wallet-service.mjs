import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const USDT_CONTRACT = '0xe90a57A45F1Eae578F5aec8eed5bA8Fc6F55eF65'
const USDT_PAYMENT = '1'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
]

const AGENT_INDEX = {
  'scout-1': 0,
  'scout-2': 1,
  'scout-3': 2,
  'analyzer': 3,
  'executor': 4,
  'validator': 5,
  'coordinator': 6
}

const AGENT_NAMES = {
  'scout-1': '🔎 Scout Agent 1',
  'scout-2': '🔎 Scout Agent 2',
  'scout-3': '🔎 Scout Agent 3',
  'analyzer': '🧠 Analyst Agent',
  'executor': '⚡ Strategist Agent',
  'validator': '✅ Validator Agent'
}

const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

let wdk = null

async function initWDK() {
  if (wdk) return wdk
  wdk = new WDK(TEST_SEED)
  wdk.registerWallet('ethereum', WalletManagerEvm, {
    provider: SEPOLIA_RPC
  })
  console.log('[WDK] Wallet service initialized')
  return wdk
}

export async function assignWalletToAgent(agentType) {
  const instance = await initWDK()
  const index = AGENT_INDEX[agentType]
  if (index === undefined) throw new Error('Unknown agent type: ' + agentType)
  const account = await instance.getAccount('ethereum', index)
  const address = await account.getAddress()
  return {
    agentType,
    agentIndex: index,
    walletAddress: address,
    chain: 'ethereum-sepolia',
    status: 'funded-pending'
  }
}

export async function assignWalletsToSubtasks(subtasks) {
  console.log('\n[ORCH] Spawning specialist agents...\n')
  const enriched = []
  for (let i = 0; i < subtasks.length; i++) {
    const wallet = await assignWalletToAgent(subtasks[i].agentType)
    const displayName = AGENT_NAMES[subtasks[i].agentType] || subtasks[i].agentType
    console.log('[SPAWN] ' + displayName + ' created')
    console.log('        Wallet: ' + wallet.walletAddress)
    console.log('        Task:   ' + subtasks[i].task.slice(0, 60) + '...\n')
    enriched.push({
      ...subtasks[i],
      wallet: wallet.walletAddress,
      chain: wallet.chain,
      paymentStatus: 'pending'
    })
  }
  return enriched
}

export async function getWalletAddress(agentType) {
  const instance = await initWDK()
  const index = AGENT_INDEX[agentType]
  if (index === undefined) throw new Error('Unknown agent type: ' + agentType)
  const account = await instance.getAccount('ethereum', index)
  return await account.getAddress()
}

export async function agentPay({ from, to, amount, reason }) {
  const fromIndex = AGENT_INDEX[from]
  const toIndex = AGENT_INDEX[to]

  if (fromIndex === undefined) throw new Error('Unknown agent: ' + from)
  if (toIndex === undefined) throw new Error('Unknown agent: ' + to)

  const instance = await initWDK()

  const fromAccount = await instance.getAccount('ethereum', fromIndex)
  const fromAddress = await fromAccount.getAddress()

  const toAccount = await instance.getAccount('ethereum', toIndex)
  const toAddress = await toAccount.getAddress()

  console.log('\n[PAYMENT] ' + from + ' → ' + to)
  console.log('  Reason: ' + reason)
  console.log('  Amount: ' + USDT_PAYMENT + ' USDT')
  console.log('  From:   ' + fromAddress)
  console.log('  To:     ' + toAddress)

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
  const coordinator = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider)
  const usdt = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, coordinator)

  const decimals = await usdt.decimals()
  const usdtAmount = ethers.parseUnits(USDT_PAYMENT, decimals)

  const tx = await coordinator.sendTransaction({
    to: USDT_CONTRACT,
    data: usdt.interface.encodeFunctionData('transfer', [toAddress, usdtAmount])
  })

  console.log('  Tx:     ' + tx.hash)
  console.log('  View:   https://sepolia.etherscan.io/tx/' + tx.hash)

  await new Promise(r => setTimeout(r, 12000))
  const receipt = await provider.getTransactionReceipt(tx.hash)
  const confirmed = receipt && receipt.status === 1

  console.log('  Status: ' + (confirmed ? 'CONFIRMED ON-CHAIN ✓' : 'PENDING...') + '\n')

  return {
    from,
    to,
    amount: USDT_PAYMENT + ' USDT',
    reason,
    fromAddress,
    toAddress,
    txHash: tx.hash,
    status: confirmed ? 'settled' : 'pending'
  }
}

export { AGENT_INDEX, AGENT_NAMES }
