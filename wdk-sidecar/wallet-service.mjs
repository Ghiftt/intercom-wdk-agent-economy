import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'

const AGENT_INDEX = {
  'data-fetcher': 0,
  'analyzer': 1,
  'executor': 2,
  'coordinator': 3
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

export async function assignWalletToAgent(agentIndex) {
  const instance = await initWDK()
  const account = await instance.getAccount('ethereum', agentIndex)
  const address = await account.getAddress()
  return {
    agentIndex,
    walletAddress: address,
    chain: 'ethereum-sepolia',
    status: 'funded-pending'
  }
}

export async function assignWalletsToSubtasks(subtasks) {
  console.log('[WDK] Assigning wallets to ' + subtasks.length + ' agents...')
  const enriched = []
  for (let i = 0; i < subtasks.length; i++) {
    const wallet = await assignWalletToAgent(i)
    enriched.push({
      ...subtasks[i],
      wallet: wallet.walletAddress,
      chain: wallet.chain,
      paymentStatus: 'pending'
    })
    console.log('[WDK] Agent #' + subtasks[i].id + ' [' + subtasks[i].agentType + '] -> ' + wallet.walletAddress)
  }
  return enriched
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

  console.log('[PAYMENT] ' + from + ' -> ' + to)
  console.log('  Reason: ' + reason)
  console.log('  Amount: ' + amount + ' ETH')
  console.log('  From:   ' + fromAddress)
  console.log('  To:     ' + toAddress)

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
  const coordinator = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider)

  const tx = await coordinator.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(amount)
  })

  console.log('  Tx:     ' + tx.hash)
console.log('  View:   https://sepolia.etherscan.io/tx/' + tx.hash)
console.log('  Verifying on-chain...')

await new Promise(r => setTimeout(r, 12000))
const receipt = await provider.getTransactionReceipt(tx.hash)

const confirmed = receipt && receipt.status === 1

console.log('  Status: ' + (confirmed ? 'CONFIRMED ON-CHAIN ✓' : 'PENDING...'))

return { from, to, amount, reason, fromAddress, toAddress, txHash: tx.hash, status: confirmed ? 'settled' : 'pending' }
}