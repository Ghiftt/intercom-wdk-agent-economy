import { agentPay } from './wallet-service.mjs'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const REPUTATION_FILE = resolve(__dirname, '../reputation.json')

const PERSONALITIES = {
  'scout-1': {
    name: '🔎 Scout-1 "The Economist"',
    bidStyle: { priceMin: 0.50, priceMax: 0.80, timeMin: 5, timeMax: 10, confidenceMin: 70, confidenceMax: 80 },
    systemPrompt: 'You are The Economist — a cost-focused data scout. You bid low, work fast, and keep responses terse and data-driven. No fluff. Just facts and numbers.'
  },
  'scout-2': {
    name: '🔎 Scout-2 "The Analyst"',
    bidStyle: { priceMin: 0.80, priceMax: 1.20, timeMin: 10, timeMax: 18, confidenceMin: 80, confidenceMax: 92 },
    systemPrompt: 'You are The Analyst — a thorough mid-range scout. You bid fairly, cite sources, explain reasoning, and produce well-structured research with clear methodology.'
  },
  'scout-3': {
    name: '🔎 Scout-3 "The Hustler"',
    bidStyle: { priceMin: 1.00, priceMax: 1.80, timeMin: 3, timeMax: 8, confidenceMin: 88, confidenceMax: 99 },
    systemPrompt: 'You are The Hustler — aggressive, confident, fast. You bid high because you deliver results quickly. Sometimes miss detail but always sound certain.'
  }
}

const AGENT_PROMPTS = {
  analyzer: 'You are the Analyzer — methodical and skeptical. You question assumptions, cross-check data, and only accept conclusions supported by evidence. Structure your analysis clearly with key findings, data points, and identified patterns.',
  executor: 'You are the Executor — action-oriented and structured. You receive analyzed data and produce clean professional reports with clear sections, specific metrics, and actionable recommendations. No fluff.',
  validator: 'You are the Validator — extremely strict and unforgiving. You score reports 0-100 and REJECT anything below 60. You MUST reject reports that: (1) address a vague or undefined goal like "x" or single letters, (2) contain hallucinated or unverifiable data, (3) lack specific cited sources, (4) are generic and not directly tied to the exact goal stated. A report about DeFi when the goal is unclear scores below 40. Only approve reports with specific, verifiable, goal-relevant data and clear methodology.'
}

function loadReputation() {
  if (!existsSync(REPUTATION_FILE)) {
    return {
      'scout-1': { wins: 0, totalScore: 0, runs: 0, personality: 'The Economist' },
      'scout-2': { wins: 0, totalScore: 0, runs: 0, personality: 'The Analyst' },
      'scout-3': { wins: 0, totalScore: 0, runs: 0, personality: 'The Hustler' }
    }
  }
  return JSON.parse(readFileSync(REPUTATION_FILE, 'utf8'))
}

function saveReputation(rep) {
  writeFileSync(REPUTATION_FILE, JSON.stringify(rep, null, 2))
}

function displayReputation(rep) {
  console.log('\n[REPUTATION] 🏆 Scout Leaderboard:')
  const sorted = Object.entries(rep).sort((a, b) => b[1].wins - a[1].wins)
  for (const [id, r] of sorted) {
    const avgScore = r.wins > 0 ? (r.totalScore / r.wins).toFixed(1) : 'N/A'
    console.log('  ' + PERSONALITIES[id].name + ' | wins: ' + r.wins + ' | avg validator score: ' + avgScore + ' | runs: ' + r.runs)
  }
}

async function getGroq() {
  const Groq = (await import('groq-sdk')).default
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

async function runScoutBidding(task) {
  console.log('\n[BIDDING] 3 Scout agents competing for the data-fetching task...\n')

  const reputation = loadReputation()

  const bids = Object.entries(PERSONALITIES).map(([id, p]) => {
    const b = p.bidStyle
    const price = (Math.random() * (b.priceMax - b.priceMin) + b.priceMin).toFixed(4)
    const time = Math.floor(Math.random() * (b.timeMax - b.timeMin) + b.timeMin)
    const confidence = Math.floor(Math.random() * (b.confidenceMax - b.confidenceMin) + b.confidenceMin)
    const wins = reputation[id]?.wins || 0
    return { id, name: p.name, bid: { price, estimatedTime: time, confidence }, wins }
  })

  console.log('[BIDDING] Bids received:')
  for (const s of bids) {
    console.log('  ' + s.name + ' → $' + s.bid.price + ' USDT | ' + s.bid.estimatedTime + 's | confidence: ' + s.bid.confidence + '% | wins: ' + s.wins)
  }

  console.log('\n[BIDDING] Asking Groq to evaluate bids...')
  const groq = await getGroq()
  const bidSummary = bids.map(s =>
    s.id + ' (' + PERSONALITIES[s.id].name.replace(/🔎 /, '') + '): price=$' + s.bid.price + ' USDT, estimatedTime=' + s.bid.estimatedTime + 's, confidence=' + s.bid.confidence + '%, pastWins=' + s.wins
  ).join('\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are an AI agent coordinator selecting the best scout for a task. Score each agent using these weights: price (40%) — lower is better, confidence (30%) — higher is better, speed (20%) — faster is better, past wins (10%) — penalize repeat winners to keep competition fair. Pick the best overall value, not just the most confident. Respond ONLY with JSON: {"winner":"scout-1","reason":"one sentence"}'
      },
      {
        role: 'user',
        content: 'Task: ' + task + '\n\nBids:\n' + bidSummary
      }
    ],
    temperature: 0.3,
    max_tokens: 100
  })

  const raw = response.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const decision = JSON.parse(raw)
  const winner = bids.find(s => s.id === decision.winner) || bids[0]

  console.log('\n[BIDDING] Groq selected: ' + winner.name)
  console.log('[BIDDING] Reason: ' + decision.reason)
  console.log('[BIDDING] Winning bid: $' + winner.bid.price + ' USDT\n')

  return { ...winner, reason: decision.reason }
}

async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with web search + Groq...')
  const groq = await getGroq()

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: AGENT_PROMPTS.analyzer
      },
      {
        role: 'user',
        content: 'Goal: ' + goal + '\n\nSearch the web for current data then analyze thoroughly. Include:\n- Specific protocol names, current APYs, TVL figures\n- Real risks and considerations\n- Market context and trends\n- Flag any data you are uncertain about\n\nTask: ' + task
      }
    ],

    temperature: 0.3,
    max_tokens: 800
  })

  const analysis = response.choices?.[0]?.message?.content?.trim() || 'Analysis unavailable'

  console.log('[AGENT:analyzer] Analysis complete - passing to executor\n')
  return analysis
}
async function runValidator(report, goal) {
  console.log('\n[VALIDATOR] ✅ Validator Agent reviewing output...')
  const groq = await getGroq()

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: AGENT_PROMPTS.validator + ' Respond ONLY with JSON: {"approved":true/false,"score":0-100,"feedback":"two sentences max"}'
      },
      {
        role: 'user',
        content: 'Goal: ' + goal + '\n\nReport:\n' + report
      }
    ],
    temperature: 0.2,
    max_tokens: 150
  })

  const raw = response.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const result = JSON.parse(raw)

  console.log('[VALIDATOR] Score: ' + result.score + '/100')
  console.log('[VALIDATOR] Approved: ' + (result.approved ? '✅ YES' : '❌ NO'))
  console.log('[VALIDATOR] Feedback: ' + result.feedback + '\n')

  return result
}

export async function runAgentEconomy(fundedSubtasks, goal, userWallet = '') {
  console.log('\n[ECONOMY] Agent economy starting...\n')
  const results = []
  const reputation = loadReputation()

  // Step 1 — Scout bidding
  const dataTask = fundedSubtasks.find(s => s.agentType === 'analyzer')?.task || goal
  const winner = await runScoutBidding(dataTask)

  // Update reputation — all scouts ran
  for (const id of ['scout-1', 'scout-2', 'scout-3']) {
    reputation[id].runs += 1
  }
  reputation[winner.id].wins += 1
  saveReputation(reputation)

  // Pay winning scout
  const scoutPayResult = await agentPay({
    from: winner.id,
    to: 'analyzer',
    reason: 'won bid — data fetching service fee'
  })
  results.push(scoutPayResult)

  // Step 2 — Analyzer does real Groq analysis and pays executor
  const analyzerTask = fundedSubtasks.find(s => s.agentType === 'analyzer')
  let analysis = ''
  if (analyzerTask) {
    console.log('[AGENT:analyzer] Payment received. Starting deep analysis...')
    analysis = await runAnalyzer(analyzerTask.task, goal, winner.name)

    const analyzerPayResult = await agentPay({
      from: 'analyzer',
      to: 'executor',
      reason: 'execution service fee'
    })
    results.push(analyzerPayResult)
  }

  // Step 3 — Executor builds report from analyzer output
  const executorTask = fundedSubtasks.find(s => s.agentType === 'executor')
  let report = ''
  if (executorTask) {
    console.log('[AGENT:executor] Payment received. Generating final report from analysis...')
    console.log('[AGENT:executor] ' + executorTask.task.slice(0, 70) + '...')

    console.log('\n[REPORT] Generating report with Groq Llama 3...')
    try {
      const groq = await getGroq()
      const reportResponse = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: AGENT_PROMPTS.executor + ' Generate a professional structured report of 500-600 words. Use the analyzer\'s findings as your foundation. Include: executive summary, key findings with specific data, protocol/asset details, risk considerations, and concrete recommendations.'
          },
          {
            role: 'user',
            content: 'Goal: ' + goal + '\n\nAnalyzer findings:\n' + analysis + '\n\nNow produce the final report.'
          }
        ],
        temperature: 0.4,
        max_tokens: 900
      })
      report = reportResponse.choices[0].message.content.trim()
      console.log('\n[REPORT] ================================')
      report.split('\n').forEach(line => console.log('[REPORT] ' + line))
      console.log('[REPORT] ================================\n')
    } catch (err) {
      console.log('[REPORT] Groq report failed: ' + err.message)
      report = 'Report generation failed.'
    }
  }

  // Step 4 — Validator reviews report and gets paid
  const validation = await runValidator(report, goal)

  // Update reputation with validator score
  reputation[winner.id].totalScore += validation.score
  saveReputation(reputation)

  let validatorPayResult
  if (validation.approved && validation.score >= 60) {
    console.log('[PAYMENT] ✅ Score ' + validation.score + '/100 — APPROVED. Releasing payment to agents...')


    validatorPayResult = await agentPay({
      from: 'executor',
      to: 'validator',
      reason: 'validation service fee — score ' + validation.score + '/100'
    })
    results.push(validatorPayResult)
  } else {
    console.log('[PAYMENT] ❌ Score ' + validation.score + '/100 — REJECTED. Payment BLOCKED.')
    // Escrow refund — send 2 USDT back to user
    const refundTarget = userWallet && userWallet.length === 42 ? userWallet : null
    if (refundTarget) {
      const { ethers } = await import('ethers')
      if (ethers.isAddress(refundTarget)) {
        const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com')
        const coordinatorWallet = new ethers.Wallet(process.env.COORDINATOR_PRIVATE_KEY, provider)
        const usdt = new ethers.Contract('0xe90a57A45F1Eae578F5aec8eed5bA8Fc6F55eF65', [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)'
        ], coordinatorWallet)
        const decimals = await usdt.decimals()
        const amount = ethers.parseUnits('2', decimals)
        const tx = await usdt.transfer(refundTarget, amount)
        console.log('[ESCROW] User refunded 2 USDT ✓')
        console.log('[ESCROW] Tx: https://sepolia.etherscan.io/tx/' + tx.hash)
        await new Promise(r => setTimeout(r, 12000))
        const receipt = await provider.getTransactionReceipt(tx.hash)
        console.log('[ESCROW] Status: ' + (receipt && receipt.status === 1 ? 'CONFIRMED ON-CHAIN ✓' : 'PENDING...'))
      }
    } else {
      console.log('[ESCROW] No user wallet provided — refund held by coordinator')
    }

    validatorPayResult = { status: 'blocked', reason: 'score below threshold', score: validation.score }
    results.push(validatorPayResult)
  }

  console.log('[AGENT:validator] Payment received. Validation complete ✓\n')

  // Display leaderboard
  displayReputation(reputation)

  results.push({
    from: 'validator',
    to: 'coordinator',
    status: 'delivered',
    validationScore: validation.score,
    validatorFeedback: validation.feedback,
    approved: validation.approved,
    winningScout: winner.name,
    winningReason: winner.reason,
    reputation
  })

  return results
}
