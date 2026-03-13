import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import readline from 'readline'
import { assignWalletsToSubtasks } from '../wdk-sidecar/wallet-service.mjs'
import { fundAgentWallets } from '../wdk-sidecar/fund-agents.mjs'
import { runAgentEconomy } from '../wdk-sidecar/agent-economy.mjs'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const ORCHESTRATOR_VERSION = '1.0.0'

function mockDecompose(goal) {
  return [
    { id:1, agentType:'data-fetcher', task:'Gather all relevant data for: ' + goal, priority:'high', dependsOn:[] },
    { id:2, agentType:'analyzer', task:'Analyse the data and identify key actions for: ' + goal, priority:'high', dependsOn:[1] },
    { id:3, agentType:'executor', task:'Execute actions and produce deliverable for: ' + goal, priority:'medium', dependsOn:[2] },
  ]
}

async function decomposeGoal(goal) {
  console.log('[ORCH] No OPENAI_API_KEY — using mock decomposition')
  return mockDecompose(goal)
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
  if (r.status === 'settled') {
    console.log('  ' + r.from + ' → ' + r.to + ' | ' + r.amount + ' ETH | SETTLED ✓')
  } else if (r.status === 'delivered') {
    console.log('  ' + r.from + ' → coordinator | report delivered ✓')
  } else {
    console.log('  payment failed ✗')
  }
}

console.log('\n[OK] Orchestration complete. Agent economy cycle finished.')

}

main().catch(e => { console.error(e); process.exit(1) })
