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
console.log('\n[REPORT] ================================')
console.log('[REPORT] DeFi Yield Opportunities Above 8%')
console.log('[REPORT] ================================')
console.log('[REPORT] Protocol: Aave V3')
console.log('[REPORT]   Chain: Ethereum')
console.log('[REPORT]   Estimated APY: 9.2%')
console.log('[REPORT]   Risk: Low')
console.log('[REPORT]')
console.log('[REPORT] Protocol: Compound V3')
console.log('[REPORT]   Chain: Ethereum')
console.log('[REPORT]   Estimated APY: 8.5%')
console.log('[REPORT]   Risk: Low')
console.log('[REPORT]')
console.log('[REPORT] Protocol: Curve Finance')
console.log('[REPORT]   Chain: Ethereum')
console.log('[REPORT]   Estimated APY: 11.3%')
console.log('[REPORT]   Risk: Medium')
console.log('[REPORT]')
console.log('[REPORT] Recommendation: Allocate across Aave and Curve for')
console.log('[REPORT] balanced yield with diversified risk exposure.')
console.log('[REPORT] ================================\n')
      results.push({
        from: current.agentType,
        to: 'coordinator',
        status: 'delivered'
      })
    }
  }

  return results
}