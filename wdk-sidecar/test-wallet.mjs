import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

// TEST seed only — never put real money on this
const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

async function main() {
  console.log('🔧 Initializing WDK...')

  const wdk = new WDK(TEST_SEED)
  wdk.registerWallet('ethereum', WalletManagerEvm, {
    provider: 'https://rpc.sepolia.org'
  })

  console.log('✅ WDK initialized\n')
  console.log('🤖 Deriving agent wallets...\n')

  const agentNames = ['Data-Fetcher', 'Analyzer', 'Reporter']

  for (let i = 0; i < 3; i++) {
    const account = await wdk.getAccount('ethereum', i)
    const address = await account.getAddress()
    console.log(`Agent ${i} — ${agentNames[i]}`)
    console.log(`  Wallet: ${address}`)
    console.log('')
  }

  console.log('✅ Day 1 complete — wallet derivation working!')
}

main().catch(console.error)

