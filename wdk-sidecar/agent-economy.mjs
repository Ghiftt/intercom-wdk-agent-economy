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
  },
  'scout-4': {
    name: '🔎 Scout-4 "The Newcomer"',
    bidStyle: { priceMin: 0.30, priceMax: 0.60, timeMin: 8, timeMax: 15, confidenceMin: 65, confidenceMax: 80 },
    systemPrompt: 'You are The Newcomer — eager to prove yourself. You bid low to win work, are thorough and careful, and never overstate your confidence.'
  }
}

const AGENT_PROMPTS = {
  analyzer: 'You are the Analyzer — methodical and skeptical. You question assumptions, cross-check data, and only accept conclusions supported by evidence. Structure your analysis clearly with key findings, data points, and identified patterns.',
  executor: 'You are the Executor — action-oriented and structured. You receive analyzed data and produce clean professional reports with clear sections, specific metrics, and actionable recommendations. No fluff.',
  validator: 'You are the Validator — brutal and unforgiving. You score reports 0-100 and REJECT anything below 75. You MUST reject reports that: (1) address a vague or undefined goal — score below 30 automatically, (2) contain hallucinated or unverifiable data — score below 40, (3) lack specific cited sources with real URLs or protocol names, (4) are generic and not directly tied to the exact goal, (5) answer a yes/no question with a generic essay — score below 40, (6) do not include real protocol names, real APY numbers, or real TVL figures when the goal requires them, (7) require real-time price data (current price, live rates, right now) but cannot provide verified timestamps or exchange sources — score below 35 automatically. A report that sounds professional but lacks verifiable on-chain or market data with specific numbers scores below 50. Only approve reports with specific, verifiable, goal-relevant data, real numbers from named sources, and clear actionable recommendations.'
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
  const scoutIds = ['scout-1', 'scout-2', 'scout-3', 'scout-4']
  const sorted = Object.entries(rep)
    .filter(([id]) => scoutIds.includes(id))
    .sort((a, b) => b[1].wins - a[1].wins)
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

  // Filter out banned scouts
  const activeScouts = Object.entries(PERSONALITIES).filter(([id]) => {
    const r = reputation[id]
    if (r && r.banned) {
      console.log('[BANNED] ' + id + ' is excluded from bidding ❌')
      return false
    }
    return true
  })

  if (activeScouts.length === 0) {
    console.log('[BIDDING] No active scouts available — all banned')
    throw new Error('No active scouts available')
  }

  console.log('[BIDDING] ' + activeScouts.length + ' scout(s) eligible to bid\n')

  const bids = activeScouts.map(([id, p]) => {
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

async function fetchDeFiLlamaData(goal) {
  try {
    console.log('[DEFILLAMA] Fetching real yield data...')
    const response = await fetch('https://yields.llama.fi/pools')
    const data = await response.json()
    const usdtPools = data.data
      .filter(p => p.symbol && p.symbol.toUpperCase().includes('USDT') && p.tvlUsd > 1000000 && p.apy > 0)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 10)
    if (usdtPools.length === 0) {
      console.log('[DEFILLAMA] No USDT pools found — using Groq knowledge')
      return null
    }
    const formatted = usdtPools.map(p =>
      '- ' + p.project + ' | ' + p.symbol + ' | APY: ' + (p.apy || 0).toFixed(2) + '% | TVL: $' + (p.tvlUsd / 1e6).toFixed(1) + 'M | Chain: ' + p.chain
    ).join('\n')
    console.log('[DEFILLAMA] Real data fetched — ' + usdtPools.length + ' USDT pools found ✓')
    console.log('[DEFILLAMA] Live data sample:\n' + formatted.split('\n').slice(0, 3).join('\n'))
    return formatted
  } catch (err) {
    console.log('[DEFILLAMA] Fetch failed: ' + err.message + ' — falling back to Groq knowledge')
    return null
  }
}

async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with real DeFiLlama data + Groq...')
  const liveData = await fetchDeFiLlamaData(goal)
  const groq = await getGroq()
  const userContent = liveData
    ? 'Goal: ' + goal + '\n\n[LIVE DATA FROM DEFILLAMA — USE THIS, DO NOT HALLUCINATE]:\n' + liveData + '\n\nAnalyze this real data thoroughly. Include:\n- Specific protocol names and APYs FROM THE DATA ABOVE\n- TVL figures FROM THE DATA ABOVE\n- Real risks and considerations\n- Market context and trends\n- Note this is live data fetched at runtime\n\nTask: ' + task
    : 'Goal: ' + goal + '\n\nAnalyze thoroughly. Include:\n- Specific protocol names, current APYs, TVL figures\n- Real risks and considerations\n- Market context and trends\n- Flag any data you are uncertain about\n\nTask: ' + task
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: AGENT_PROMPTS.analyzer },
      { role: 'user', content: userContent }
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
        content: AGENT_PROMPTS.validator + ' Respond ONLY with valid JSON, no extra text: {"approved":true/false,"score":0-100,"breakdown":{"accuracy":0-100,"completeness":0-100,"source_quality":0-100,"actionability":0-100},"feedback":"two sentences max"}. The score must equal the weighted average: accuracy(30%) + completeness(25%) + source_quality(25%) + actionability(20%). Approve if score >= 75.'
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
  if (result.breakdown) {
    console.log('[VALIDATOR] Breakdown:')
    console.log('[VALIDATOR]   Accuracy:       ' + result.breakdown.accuracy + '/100')
    console.log('[VALIDATOR]   Completeness:   ' + result.breakdown.completeness + '/100')
    console.log('[VALIDATOR]   Source Quality: ' + result.breakdown.source_quality + '/100')
    console.log('[VALIDATOR]   Actionability:  ' + result.breakdown.actionability + '/100')
  }
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
  for (const id of ['scout-1', 'scout-2', 'scout-3', 'scout-4']) {
    if (reputation[id]) reputation[id].runs += 1
  }
  if (!reputation[winner.id]) reputation[winner.id] = { wins: 0, totalScore: 0, runs: 0, banned: false }
  if (!reputation[winner.id]) reputation[winner.id] = { wins: 0, totalScore: 0, runs: 0, banned: false }
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

    // Reputation penalty on rejection
    console.log('\n[REPUTATION] Applying penalties for failed work...')
    const PENALTY = 15
    if (reputation[winner.id]) {
      const oldScore = reputation[winner.id].totalScore
      reputation[winner.id].totalScore = Math.max(0, oldScore - PENALTY)
      console.log('[REPUTATION] ' + winner.id + ' penalized -' + PENALTY + ' reputation points')
    }
    // Penalize analyzer and executor
    for (const agentId of ['analyzer', 'executor']) {
      if (!reputation[agentId]) reputation[agentId] = { wins: 0, totalScore: 100, runs: 0 }
      reputation[agentId].totalScore = Math.max(0, reputation[agentId].totalScore - PENALTY)
      reputation[agentId].runs = (reputation[agentId].runs || 0) + 1
      console.log('[REPUTATION] ' + agentId + ' penalized -' + PENALTY + ' → score: ' + reputation[agentId].totalScore)
    }
    saveReputation(reputation)

    // Check for bans (scouts only — pipeline agents never banned)
    const scoutOnly = ['scout-1','scout-2','scout-3','scout-4']
    for (const [id, r] of Object.entries(reputation)) {
      if (!scoutOnly.includes(id)) continue
      const repScore = r.runs > 0 ? r.totalScore / r.runs : 100
      if (repScore < 5 && !r.banned) {
        reputation[id].banned = true
        saveReputation(reputation)
        console.log('[BANNED] ' + id + ' reputation ' + repScore.toFixed(1) + ' — EXCLUDED from future rounds ❌')
      }
    }

    // Auto-spawn replacement scout if needed
    const activeScouting = ['scout-1', 'scout-2', 'scout-3', 'scout-4'].filter(id => !reputation[id]?.banned)
    if (activeScouting.length < 2 && !reputation['scout-4']?.banned) {
      if (!reputation['scout-4']) {
        reputation['scout-4'] = { wins: 0, totalScore: 0, runs: 0, personality: 'The Newcomer', banned: false }
        saveReputation(reputation)
        console.log('\n[SPAWN] 🆕 Scout-4 "The Newcomer" joined the marketplace')
        console.log('[SPAWN] Wallet: 0xB191a13bfE648B61002F2e2135867015B71816a6')
        console.log('[SPAWN] Reputation: 0 — must prove itself\n')
      }
    }

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
