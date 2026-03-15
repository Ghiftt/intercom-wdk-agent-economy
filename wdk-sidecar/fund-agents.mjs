import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const USDT_CONTRACT = '0x186cca6904490818AB0DC409ca59D932A2366031'
const USDT_AMOUNT = '0.1'
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
]
export async function fundAgentWallets(enrichedSubtasks) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
  const coordinator = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider)
  const usdt = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, coordinator)
  const decimals = await usdt.decimals()
  const balance = await usdt.balanceOf(coordinator.address)
  const ethBalance = await provider.getBalance(coordinator.address)
  console.log('[FUND] Coordinator: ' + coordinator.address)
  console.log('[FUND] USDT Balance: ' + ethers.formatUnits(balance, decimals) + ' USDT')
  console.log('[FUND] ETH Balance: ' + ethers.formatEther(ethBalance) + ' ETH (for gas)')

  const requiredAmount = ethers.parseUnits((parseFloat(USDT_AMOUNT) * enrichedSubtasks.length).toFixed(6), decimals)
  if (balance < requiredAmount) {
    const have = ethers.formatUnits(balance, decimals)
    const need = ethers.formatUnits(requiredAmount, decimals)
    console.error('[FUND] ❌ Insufficient USDT balance. Have ' + have + ' USDT, need ' + need + ' USDT. Aborting.')
    throw new Error('Insufficient USDT balance. Have ' + have + ', need ' + need)
  }

  console.log('[FUND] Sending ' + USDT_AMOUNT + ' USDT to each agent...\n')
  const results = []
  for (const subtask of enrichedSubtasks) {
    try {
      const amount = ethers.parseUnits(USDT_AMOUNT, decimals)
      const tx = await usdt.transfer(subtask.wallet, amount)
      console.log('[FUND] Agent #' + subtask.id + ' [' + subtask.agentType + '] funded!')
      console.log('       Tx: ' + tx.hash)
      console.log('       View: https://sepolia.etherscan.io/tx/' + tx.hash)
      await new Promise(r => setTimeout(r, 3000))
      const receipt = await provider.getTransactionReceipt(tx.hash)
      const confirmed = receipt && receipt.status === 1
      console.log('       Status: ' + (confirmed ? 'CONFIRMED ON-CHAIN ✓' : 'PENDING...') + '\n')
      results.push({ ...subtask, txHash: tx.hash, funded: true, token: 'USDT' })
    } catch (err) {
      console.error('[FUND] Failed for agent #' + subtask.id + ': ' + err.message)
      results.push({ ...subtask, txHash: null, funded: false })
    }
  }
  return results
}
