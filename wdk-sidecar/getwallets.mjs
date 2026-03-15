import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const wdk = new WDK('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
wdk.registerWallet('ethereum', WalletManagerEvm, { provider: 'https://ethereum-sepolia-rpc.publicnode.com' })
for (let i = 0; i <= 6; i++) {
  const acc = await wdk.getAccount('ethereum', i)
  const addr = await acc.getAddress()
  console.log('Index ' + i + ': ' + addr)
}
