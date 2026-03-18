import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

const oldText = `    console.log('[PAYMENT] ❌ Score ' + validation.score + '/100 — REJECTED. Payment BLOCKED.')
    // Escrow refund — send 2 USDT back to user`

const newText = `    console.log('[PAYMENT] ❌ Score ' + validation.score + '/100 — REJECTED. Payment BLOCKED.')

    // Reputation penalty on rejection
    console.log('\\n[REPUTATION] Applying penalties for failed work...')
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

    // Check for bans
    for (const [id, r] of Object.entries(reputation)) {
      const repScore = r.runs > 0 ? r.totalScore / r.runs : 100
      if (repScore < 40 && !r.banned) {
        reputation[id].banned = true
        saveReputation(reputation)
        console.log('[BANNED] ' + id + ' reputation ' + repScore.toFixed(1) + ' — EXCLUDED from future rounds ❌')
      }
    }

    // Escrow refund — send 2 USDT back to user`

if (content.includes(oldText)) {
  writeFileSync('wdk-sidecar/agent-economy.mjs', content.replace(oldText, newText))
  console.log('Done')
} else {
  console.log('Pattern not found')
}
