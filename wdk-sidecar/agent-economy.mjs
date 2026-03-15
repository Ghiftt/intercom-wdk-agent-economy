import { agentPay } from './wallet-service.mjs'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

async function getGroq() {
  const Groq = (await import('groq-sdk')).default
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

async function runScoutBidding(task) {
  console.log('\n[BIDDING] 3 Scout agents competing for the data-fetching task...\n')

  const scouts = [
    { id: 'scout-1', name: '🔎 Scout Agent 1' },
    { id: 'scout-2', name: '🔎 Scout Agent 2' },
    { id: 'scout-3', name: '🔎 Scout Agent 3' }
  ]

  const bids = scouts.map(scout => {
    const price = (Math.random() * 0.08 + 0.02).toFixed(4)
    const time = Math.floor(Math.random() * 20 + 5)
    const confidence = Math.floor(Math.random() * 30 + 70)
    return { ...scout, bid: { price, estimatedTime: time, confidence } }
  })

  console.log('[BIDDING] Bids received:')
  for (const s of bids) {
    console.log('  ' + s.name + ' → $' + s.bid.price + ' USDT | ' + s.bid.estimatedTime + 's | confidence: ' + s.bid.confidence + '%')
  }

  console.log('\n[BIDDING] Asking Groq to evaluate bids...')
  const groq = await getGroq()
  const bidSummary = bids.map(s =>
    s.id + ': price=$' + s.bid.price + ' USDT, estimatedTime=' + s.bid.estimatedTime + 's, confidence=' + s.bid.confidence + '%'
  ).join('\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are an AI agent coordinator. Given 3 agent bids for a task, select the best agent based on value (not just lowest price — consider confidence and speed too). Respond ONLY with a JSON object like: {"winner":"scout-1","reason":"one sentence explanation"}'
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

  return winner
}

async function runValidator(report, goal) {
  console.log('\n[VALIDATOR] ✅ Validator Agent reviewing output...')
  const groq = await getGroq()

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a validator agent. Review the report and check if it adequately addresses the goal. Respond ONLY with JSON: {"approved":true/false,"score":0-100,"feedback":"one sentence"}'
      },
      {
        role: 'user',
        content: 'Goal: ' + goal + '\n\nReport:\n' + report
      }
    ],
    temperature: 0.2,
    max_tokens: 100
  })

  const raw = response.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const result = JSON.parse(raw)

  console.log('[VALIDATOR] Score: ' + result.score + '/100')
  console.log('[VALIDATOR] Approved: ' + (result.approved ? '✅ YES' : '❌ NO'))
  console.log('[VALIDATOR] Feedback: ' + result.feedback + '\n')

  return result
}

export async function runAgentEconomy(fundedSubtasks, goal) {
  console.log('\n[ECONOMY] Agent economy starting...\n')
  const results = []

  // Step 1 — Scout bidding
  const dataTask = fundedSubtasks.find(s => s.agentType === 'analyzer')?.task || goal
  const winner = await runScoutBidding(dataTask)

  // Pay winning scout
  const scoutPayResult = await agentPay({
    from: winner.id,
    to: 'analyzer',
    reason: 'won bid — data fetching service fee'
  })
  results.push(scoutPayResult)

  // Step 2 — Analyzer works and pays executor
  const analyzerTask = fundedSubtasks.find(s => s.agentType === 'analyzer')
  if (analyzerTask) {
    console.log('[AGENT:analyzer] Payment received. Analyzing data...')
    console.log('[AGENT:analyzer] ' + analyzerTask.task.slice(0, 70) + '...')
    await new Promise(r => setTimeout(r, 1000))
    console.log('[AGENT:analyzer] Analysis complete\n')

    const analyzerPayResult = await agentPay({
      from: 'analyzer',
      to: 'executor',
      reason: 'execution service fee'
    })
    results.push(analyzerPayResult)
  }

  // Step 3 — Executor generates report
  const executorTask = fundedSubtasks.find(s => s.agentType === 'executor')
  let report = ''
  if (executorTask) {
    console.log('[AGENT:executor] Payment received. Generating final report...')
    console.log('[AGENT:executor] ' + executorTask.task.slice(0, 70) + '...')
    await new Promise(r => setTimeout(r, 1000))

    console.log('\n[REPORT] Generating report with Groq Llama 3...')
    try {
      const groq = await getGroq()
      const reportResponse = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a DeFi research agent. Generate a concise, structured report based on the goal provided. Include specific protocols, metrics, and actionable recommendations. Keep it under 200 words. Format with clear sections.'
          },
          {
            role: 'user',
            content: 'Generate a report for this goal: ' + executorTask.task
          }
        ],
        temperature: 0.4,
        max_tokens: 400
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

  const validatorPayResult = await agentPay({
    from: 'executor',
    to: 'validator',
    reason: 'validation service fee'
  })
  results.push(validatorPayResult)

  console.log('[AGENT:validator] Payment received. Validation complete ✓\n')

  results.push({
    from: 'validator',
    to: 'coordinator',
    status: 'delivered',
    validationScore: validation.score,
    approved: validation.approved
  })

  return results
}
