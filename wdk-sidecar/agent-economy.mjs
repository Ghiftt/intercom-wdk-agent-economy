import { agentPay } from './wallet-service.mjs'

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
      results.push({
        from: current.agentType,
        to: 'coordinator',
        status: 'delivered'
      })
    }
  }

  return results
}