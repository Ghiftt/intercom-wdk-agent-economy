import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

let wdk = null

async function initWDK() {
  if (wdk) return wdk
  wdk = new WDK(TEST_SEED)
  wdk.registerWallet('ethereum', WalletManagerEvm, {
    provider: 'https://rpc.sepolia.org'
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