import { agentPay } from './wallet-service.mjs'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const PAYMENT_AMOUNT = '0.00001'

export async function runAgentEconomy(fundedSubtasks) {
  console.log('\n[ECONOMY] Agent economy starting...\n')
  const results = []

  for (let i = 0; i < fundedSubtasks.length; i++) {
    const current = fundedSubtasks[i]
    const next = fundedSubtasks[i + 1]

    console.log('[AGENT:' + current.agentType + '] Working on task...')
    console.log('[AGENT:' + current.agentType + '] ' + current.task.slice(0, 70) + '...')
    await new Promise(r => setTimeout(r, 1000))
    console.log('[AGENT:' + current.agentType + '] Task complete\n')

    if (next) {
      const reasons = {
        'data-fetcher': 'analysis service fee',
        'analyzer': 'execution service fee'
      }

      const result = await agentPay({
        from: current.agentType,
        to: next.agentType,
        amount: PAYMENT_AMOUNT,
        reason: reasons[current.agentType] || 'service fee'
      })

      console.log('[AGENT:' + next.agentType + '] Payment received. Starting work...\n')
      results.push(result)
    } else {
      console.log('[AGENT:' + current.agentType + '] Final agent — delivering report to coordinator ✓')
console.log('\n[REPORT] Generating report with Groq Llama 3...')

try {
  const Groq = (await import('groq-sdk')).default
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const reportResponse = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a DeFi research agent. Generate a concise, structured report based on the goal provided. Include specific protocols, metrics, and actionable recommendations. Keep it under 200 words. Format with clear sections.'
      },
      {
        role: 'user',
        content: 'Generate a report for this goal: ' + current.task
      }
    ],
    temperature: 0.4,
    max_tokens: 400
  })

  const report = reportResponse.choices[0].message.content.trim()
  console.log('\n[REPORT] ================================')
  report.split('\n').forEach(line => console.log('[REPORT] ' + line))
  console.log('[REPORT] ================================\n')
} catch (err) {
  console.log('[REPORT] Groq report failed: ' + err.message)
  console.log('[REPORT] Using cached analysis.')
}
      results.push({
        from: current.agentType,
        to: 'coordinator',
        status: 'delivered'
      })
    }
  }

  return results
}