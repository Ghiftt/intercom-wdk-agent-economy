import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
const AMOUNT_PER_AGENT = '0.0001'

export async function fundAgentWallets(enrichedSubtasks) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
  const coordinator = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider)

  console.log('[FUND] Coordinator: ' + coordinator.address)
  const balance = await provider.getBalance(coordinator.address)
  console.log('[FUND] Balance: ' + ethers.formatEther(balance) + ' ETH')
  console.log('[FUND] Sending ' + AMOUNT_PER_AGENT + ' ETH to each agent...\n')

  const results = []
  for (const subtask of enrichedSubtasks) {
    try {
      const tx = await coordinator.sendTransaction({
        to: subtask.wallet,
        value: ethers.parseEther(AMOUNT_PER_AGENT)
      })
      console.log('[FUND] Agent #' + subtask.id + ' [' + subtask.agentType + '] funded!')
      console.log('       Tx: ' + tx.hash)
      console.log('       View: https://sepolia.etherscan.io/tx/' + tx.hash)
      results.push({ ...subtask, txHash: tx.hash, funded: true })
    } catch (err) {
      console.error('[FUND] Failed for agent #' + subtask.id + ': ' + err.message)
      results.push({ ...subtask, txHash: null, funded: false })
    }
  }
  return results
}