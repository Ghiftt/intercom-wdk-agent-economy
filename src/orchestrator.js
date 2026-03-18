import Hyperswarm from 'hyperswarm'
import { spawn } from 'child_process'
import crypto from 'crypto'
import readline from 'readline'
import { assignWalletsToSubtasks } from '../wdk-sidecar/wallet-service.mjs'
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
- analyzer: processes and analyzes gathered data
- executor: produces the final deliverable or takes action
- validator: verifies the final output meets the goal

Note: data-fetching is handled separately via a Scout bidding round before these agents run.

Respond ONLY with a JSON array, no explanation. Example:
[
  {"id":1,"agentType":"analyzer","task":"specific task here","priority":"high","dependsOn":[]},
  {"id":2,"agentType":"executor","task":"specific task here","priority":"high","dependsOn":[1]},
  {"id":3,"agentType":"validator","task":"specific task here","priority":"medium","dependsOn":[2]}
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
      { id:1, agentType:'analyzer', task:'Analyse all relevant data for: ' + goal, priority:'high', dependsOn:[] },
      { id:2, agentType:'executor', task:'Execute actions and produce deliverable for: ' + goal, priority:'high', dependsOn:[1] },
      { id:3, agentType:'validator', task:'Verify the output meets the goal: ' + goal, priority:'medium', dependsOn:[2] },
    ]
  }
}

async function dispatchToAgent(agentType, taskId, payload) {
  return new Promise(async (resolve) => {
    const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
    const swarm = new Hyperswarm()
    let settled = false
    let agentProcess = null

    const cleanup = async () => {
      if (agentProcess) agentProcess.kill()
      try { await swarm.destroy() } catch(e) {}
    }

    const timeout = setTimeout(async () => {
      if (!settled) {
        settled = true
        console.log('[P2P] Agent ' + agentType + ' timed out')
        await cleanup()
        resolve(null)
      }
    }, 90000)

    swarm.on('connection', (conn) => {
      console.log('[P2P] Agent ' + agentType + ' connected')

      conn.on('data', async (data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.type === 'agent_ready') {
            console.log('[P2P] Agent ' + agentType + ' ready — sending task...')
            conn.write(JSON.stringify({ type: 'task', taskId, payload }))
          }

          if (msg.type === 'result') {
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              console.log('[P2P] Agent ' + agentType + ' result received ✓')
              await cleanup()
              resolve({
                agentType,
                output: msg.output,
                outputHash: msg.outputHash,
                wallet: msg.wallet,
                taskId: msg.taskId
              })
            }
          }
        } catch (e) {
          console.error('[P2P] Parse error: ' + e.message)
        }
      })

      conn.on('error', () => {})
    })

    await swarm.join(topic, { server: true, client: false })
    console.log('[P2P] Orchestrator ready — waiting for DHT propagation...')
    await new Promise(r => setTimeout(r, 3000))
    console.log('[P2P] Spawning ' + agentType + '...')

    agentProcess = spawn('node', ['wdk-sidecar/agent.mjs', '--type=' + agentType], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env
    })

    agentProcess.on('error', async (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        console.log('[P2P] Agent ' + agentType + ' spawn error: ' + err.message)
        await cleanup()
        resolve(null)
      }
    })

    agentProcess.on('exit', async (code) => {
      if (!settled && code !== 0) {
        settled = true
        clearTimeout(timeout)
        console.log('[P2P] Agent ' + agentType + ' exited with code ' + code)
        await cleanup()
        resolve(null)
      }
    })
  })
}
async function main() {
  console.log('\n==== Intercom AI Agent Task Orchestrator ====')
  console.log('     Built on Trac Network v' + ORCHESTRATOR_VERSION)
  console.log('=============================================\n')
  const args = process.argv.slice(2)
  const walletArg = args.find(a => a.startsWith('--userWallet='))
  const userWallet = walletArg ? walletArg.replace('--userWallet=', '') : ''
  let goal = args.join(' ').replace(/^--goal\s*/i,'').replace(/--userWallet\s*=?\S*/g,'').trim()
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

  console.log('\n[ORCH] Dispatching subtasks to agents over P2P...')
  const p2pResults = {}
  for (const subtask of enrichedSubtasks) {
    console.log('[P2P] Dispatching to ' + subtask.agentType + '...')
    const result = await dispatchToAgent(subtask.agentType, String(subtask.id), subtask.task)
    if (result) {
      p2pResults[subtask.agentType] = result
      console.log('[P2P] ' + subtask.agentType + ' completed task ✓')
      console.log('[P2P] Output hash: ' + result.outputHash)
    } else {
      console.log('[P2P] ' + subtask.agentType + ' failed or timed out')
    }
  }

  console.log('\n[ORCH] Running agent economy — scouts bidding, agents paying each other...')
  const economyResults = await runAgentEconomy(enrichedSubtasks, goal, userWallet)

  console.log("\n[ECONOMY SUMMARY]"); 
  for (const r of economyResults) {
    if (r.status === 'settled' || r.status === 'pending') {
      console.log('  ' + r.from + ' → ' + r.to + ' | ' + r.amount + ' | SETTLED ✓')
    } else if (r.status === 'delivered') {
      const score = r.validationScore ? ' | score: ' + r.validationScore + '/100' : ''
      const approved = r.approved ? ' | ✅ APPROVED' : ' | ❌ REJECTED'
      console.log('  validator → coordinator | report delivered ✓' + score + approved)
    } else if (r.status === 'blocked') {
      console.log('  ❌ Payment BLOCKED — validator rejected output')
    } else if (r.status === 'refunded') {
      console.log('  💰 User refunded 2 USDT — work did not meet quality threshold')
    } else {
      console.log('  ' + r.from + ' → ' + r.to + ' | ' + (r.status || 'unknown'))
    }
  }

  console.log('\n[WALLET BALANCES]')
  const { ethers: ethersLib } = await import('ethers')
  const balanceProvider = new ethersLib.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com')
  const USDT_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']
  const usdtContract = new ethersLib.Contract('0x186cca6904490818AB0DC409ca59D932A2366031', USDT_ABI, balanceProvider)
  const usdtDecimals = await usdtContract.decimals()
  const agentWallets = [
    { name: 'scout-1',  address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' },
    { name: 'scout-2',  address: '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0' },
    { name: 'scout-3',  address: '0xb6716976A3ebe8D39aCEB04372f22Ff8e6802D7A' },
    { name: 'analyzer', address: '0xF3f50213C1d2e255e4B2bAD430F8A38EEF8D718E' },
    { name: 'executor', address: '0x51cA8ff9f1C0a99f88E86B8112eA3237F55374cA' },
    { name: 'validator',address: '0xA40cFBFc8534FFC84E20a7d8bBC3729B26a35F6f' },
  ]
  for (const agent of agentWallets) {
    const balance = await usdtContract.balanceOf(agent.address)
    console.log('  ' + agent.name + ' → ' + ethersLib.formatUnits(balance, usdtDecimals) + ' USDT')
  }

  console.log('\n[OK] Orchestration complete. Agent economy cycle finished.')
}

main().catch(e => { console.error(e); process.exit(1) })
