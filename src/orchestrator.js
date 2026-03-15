import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import readline from 'readline'
import { assignWalletsToSubtasks } from '../wdk-sidecar/wallet-service.mjs'
import { fundAgentWallets } from '../wdk-sidecar/fund-agents.mjs'
import { runAgentEconomy } from '../wdk-sidecar/agent-economy.mjs'

import Groq from 'groq-sdk'
const ORCHESTRATOR_VERSION = '1.0.0'

async function decomposeGoal(goal) {
  console.log('[ORCH] Decomposing goal with Groq Llama 3...')
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an AI task decomposer. Break down any goal into exactly 3 subtasks for these specialist agents:
- data-fetcher: gathers raw data and information
- analyzer: processes and analyzes the data
- executor: produces the final deliverable or takes action

Respond ONLY with a JSON array, no explanation. Example:
[
  {"id":1,"agentType":"data-fetcher","task":"specific task here","priority":"high","dependsOn":[]},
  {"id":2,"agentType":"analyzer","task":"specific task here","priority":"high","dependsOn":[1]},
  {"id":3,"agentType":"executor","task":"specific task here","priority":"medium","dependsOn":[2]}
]`
        },
        {
          role: 'user',
          content: 'Goal: ' + goal
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })

    const content = response.choices[0].message.content.trim()
    const clean = content.replace(/```json|```/g, '').trim()
    const subtasks = JSON.parse(clean)
    console.log('[ORCH] Groq decomposition successful')
    return subtasks
  } catch (err) {
    console.log('[ORCH] Groq failed, using mock decomposition: ' + err.message)
    return [
      { id:1, agentType:'data-fetcher', task:'Gather all relevant data for: ' + goal, priority:'high', dependsOn:[] },
      { id:2, agentType:'analyzer', task:'Analyse the data and identify key actions for: ' + goal, priority:'high', dependsOn:[1] },
      { id:3, agentType:'executor', task:'Execute actions and produce deliverable for: ' + goal, priority:'medium', dependsOn:[2] },
    ]
  }
}

async function broadcastSubtasks(goal, subtasks) {
  const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
  const swarm = new Hyperswarm()
  swarm.on('connection', (conn, info) => {
    const peerId = info.publicKey.toString('hex').slice(0,12)
    console.log('[P2P] Peer connected: ' + peerId)
    for (const subtask of subtasks) {
      conn.write(JSON.stringify({ type:'orchestrator_task', version:ORCHESTRATOR_VERSION, goal, subtask, timestamp:Date.now() }))
      console.log('[TASK] broadcast task #' + subtask.id + ' [' + subtask.agentType + '] to ' + peerId)
    }
    conn.on('error', ()=>{})
  })
  await swarm.join(topic, { server:true, client:true })
  console.log('[P2P] Listening on sidechannel. Waiting 8s for peers...')
  await new Promise(r => setTimeout(r, 8000))
  await swarm.destroy()
}

async function main() {
  console.log('\n==== Intercom AI Agent Task Orchestrator ====')
  console.log('     Built on Trac Network v' + ORCHESTRATOR_VERSION)
  console.log('=============================================\n')
  const args = process.argv.slice(2)
  let goal = args.join(' ').replace(/^--goal\s*/i,'').trim()
  if (!goal) {
    const rl = readline.createInterface({ input:process.stdin, output:process.stdout })
    goal = await new Promise(r => rl.question('Enter your automation goal: ', ans => { rl.close(); r(ans.trim()) }))
  }
  if (!goal) { console.error('No goal. Exiting.'); process.exit(1) }
  console.log('[ORCH] Decomposing goal...')
  const subtasks = await decomposeGoal(goal)
  console.log('\nGoal: ' + goal)
  console.log('\nSubtasks:')
  for (const s of subtasks) console.log('  #' + s.id + ' [' + s.agentType + '] ' + s.priority + ' - ' + s.task)
  console.log()
  console.log('[ORCH] Assigning WDK wallets to agents...')
const enrichedSubtasks = await assignWalletsToSubtasks(subtasks)

console.log('\n[WALLET SUMMARY]')
for (const s of enrichedSubtasks) {
  console.log('  Agent #' + s.id + ' [' + s.agentType + '] → ' + s.wallet)
}

console.log('\n[ORCH] Funding agent wallets on Sepolia...')
const fundedSubtasks = await fundAgentWallets(enrichedSubtasks)

console.log('\n[FUND SUMMARY]')
for (const s of fundedSubtasks) {
  console.log('  Agent #' + s.id + ' [' + s.agentType + '] → ' + (s.funded ? 'FUNDED ✓ ' + s.txHash : 'FAILED ✗'))
}

console.log('\n[ORCH] Broadcasting ' + fundedSubtasks.length + ' subtasks over Intercom sidechannel...')
await broadcastSubtasks(goal, fundedSubtasks)

console.log('\n[ORCH] Running agent economy — agents paying each other...')
const economyResults = await runAgentEconomy(fundedSubtasks)

console.log('\n[ECONOMY SUMMARY]')
for (const r of economyResults) {
  if (r.status === 'settled' || r.status === 'pending') {
    console.log('  ' + r.from + ' → ' + r.to + ' | ' + r.amount + ' | SETTLED ✓')
  } else if (r.status === 'delivered') {
    console.log('  ' + r.from + ' → coordinator | report delivered ✓')
  } else {
    console.log('  ' + JSON.stringify(r))
  }
}  

console.log('\n[WALLET BALANCES]')
const { ethers: ethersLib } = await import('ethers')
const balanceProvider = new ethersLib.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com')
const USDT_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']
const usdtContract = new ethersLib.Contract('0x186cca6904490818AB0DC409ca59D932A2366031', USDT_ABI, balanceProvider)
const usdtDecimals = await usdtContract.decimals()
const agentWallets = [
  { name: 'data-fetcher', address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' },
  { name: 'analyzer', address: '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0' },
  { name: 'executor', address: '0xb6716976A3ebe8D39aCEB04372f22Ff8e6802D7A' },
]
for (const agent of agentWallets) {
  const balance = await usdtContract.balanceOf(agent.address)
  console.log('  ' + agent.name + ' → ' + ethersLib.formatUnits(balance, usdtDecimals) + ' USDT')
}

console.log('\n[OK] Orchestration complete. Agent economy cycle finished.')

}

main().catch(e => { console.error(e); process.exit(1) })
