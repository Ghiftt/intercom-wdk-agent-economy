import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import { ethers } from 'ethers'
import Groq from 'groq-sdk'
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// --- CLI args ---
const args = process.argv.slice(2)
const typeArg = args.find(a => a.startsWith('--type='))
const AGENT_TYPE = typeArg ? typeArg.replace('--type=', '') : 'analyzer'

// --- Agent index (matches wallet-service.mjs) ---
const AGENT_INDEX = {
  'scout-1': 0,
  'scout-2': 1,
  'scout-3': 2,
  'analyzer': 3,
  'executor': 4,
  'validator': 5
}

// --- Personalities ---
const PERSONALITIES = {
  'scout-1': 'You are The Economist — a cost-focused data scout. Terse, data-driven, no fluff. Facts and numbers only.',
  'scout-2': 'You are The Analyst — thorough and methodical. Cite reasoning, structure your findings clearly, explain your methodology.',
  'scout-3': 'You are The Hustler — aggressive and confident. Fast, bold, high conviction. Sometimes miss detail but always decisive.',
  'analyzer': 'You are the Analyzer — methodical and skeptical. Question assumptions, cross-check data, only accept conclusions supported by evidence.',
  'executor': 'You are the Executor — action-oriented and structured. Clean sections, bullet points, actionable recommendations only. No fluff.',
  'validator': 'You are the Validator — strict and scoring-focused. Harsh but fair. Approve only work that fully addresses the goal with sufficient evidence.'
}

const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'

async function getWallet() {
  const wdk = new WDK(TEST_SEED)
  wdk.registerWallet('ethereum', WalletManagerEvm, { provider: SEPOLIA_RPC })
  const index = AGENT_INDEX[AGENT_TYPE]
  if (index === undefined) throw new Error('Unknown agent type: ' + AGENT_TYPE)
  const account = await wdk.getAccount('ethereum', index)
  const address = await account.getAddress()
  return { address, index }
}

async function callGroq(task) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const personality = PERSONALITIES[AGENT_TYPE] || PERSONALITIES['analyzer']
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: personality },
      { role: 'user', content: task }
    ],
    temperature: 0.4,
    max_tokens: 800
  })
  return response.choices[0].message.content.trim()
}

function signOutput(output, privateKey) {
  const outputHash = ethers.id(output)
  const wallet = new ethers.Wallet(privateKey)
  return { outputHash, signature: wallet.signMessageSync(ethers.getBytes(outputHash)) }
}

async function main() {
  console.log('[AGENT:' + AGENT_TYPE + '] Starting...')

  const { address } = await getWallet()
  console.log('[AGENT:' + AGENT_TYPE + '] Wallet: ' + address)

  const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
  const swarm = new Hyperswarm()
  let taskReceived = false

  swarm.on('connection', (conn) => {
    console.log('[AGENT:' + AGENT_TYPE + '] Connected to orchestrator')

    // Send ready message
    conn.write(JSON.stringify({
      type: 'agent_ready',
      agent: AGENT_TYPE,
      wallet: address,
      timestamp: Date.now()
    }))

    conn.on('data', async (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type !== 'task' || taskReceived) return
        taskReceived = true
        const receivedTaskId = msg.taskId

        console.log('[AGENT:' + AGENT_TYPE + '] Task received: ' + msg.payload.slice(0, 60) + '...')
        console.log('[AGENT:' + AGENT_TYPE + '] Working...')

        // Do real Groq work
        const output = await callGroq(msg.payload)

        // Sign the output
        const outputHash = ethers.id(output)
        console.log('[AGENT:' + AGENT_TYPE + '] Output hash: ' + outputHash)
        console.log('[AGENT:' + AGENT_TYPE + '] Work complete. Sending result...')

        // Send result back
        conn.write(JSON.stringify({
          type: 'result',
          agent: AGENT_TYPE,
          taskId: receivedTaskId,
          output,
          outputHash,
          wallet: address,
          timestamp: Date.now()
        }))

        console.log('[AGENT:' + AGENT_TYPE + '] Result sent. Waiting 5s...')
        await new Promise(r => setTimeout(r, 5000))
        console.log('[AGENT:' + AGENT_TYPE + '] Exiting.')
        await swarm.destroy()
        process.exit(0)

      } catch (e) {
        console.error('[AGENT:' + AGENT_TYPE + '] Error: ' + e.message)
        await swarm.destroy()
        process.exit(1)
      }
    })

    conn.on('error', () => {})
  })

  await swarm.join(topic, { server: false, client: true })
  console.log('[AGENT:' + AGENT_TYPE + '] Joined P2P network. Waiting for task...')

  // Timeout after 60 seconds
  setTimeout(async () => {
    if (!taskReceived) {
      console.log('[AGENT:' + AGENT_TYPE + '] Timeout — no task received. Exiting.')
      await swarm.destroy()
      process.exit(1)
    }
  }, 120000)

  process.on('SIGINT', async () => {
    await swarm.destroy()
    process.exit(0)
  })
}

main().catch(e => {
  console.error('[AGENT:' + AGENT_TYPE + '] Fatal: ' + e.message)
  process.exit(1)
})
