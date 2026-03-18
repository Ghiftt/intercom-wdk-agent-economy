import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

// Add scout-4 to PERSONALITIES
content = content.replace(
  `  'scout-3': {
    name: '🔎 Scout-3 "The Hustler"',
    bidStyle: { priceMin: 1.00, priceMax: 1.80, timeMin: 3, timeMax: 8, confidenceMin: 88, confidenceMax: 99 },
    systemPrompt: 'You are The Hustler — aggressive, confident, fast. You bid high because you deliver results quickly. Sometimes miss detail but always sound certain.'
  }`,
  `  'scout-3': {
    name: '🔎 Scout-3 "The Hustler"',
    bidStyle: { priceMin: 1.00, priceMax: 1.80, timeMin: 3, timeMax: 8, confidenceMin: 88, confidenceMax: 99 },
    systemPrompt: 'You are The Hustler — aggressive, confident, fast. You bid high because you deliver results quickly. Sometimes miss detail but always sound certain.'
  },
  'scout-4': {
    name: '🔎 Scout-4 "The Newcomer"',
    bidStyle: { priceMin: 0.30, priceMax: 0.60, timeMin: 8, timeMax: 15, confidenceMin: 65, confidenceMax: 80 },
    systemPrompt: 'You are The Newcomer — eager to prove yourself. You bid low to win work, are thorough and careful, and never overstate your confidence.'
  }`
)

// Add auto-spawn check after ban detection
const oldBanCheck = `        console.log('[BANNED] ' + id + ' reputation ' + repScore.toFixed(1) + ' — EXCLUDED from future rounds ❌')
      }
    }

    // Escrow refund`

const newBanCheck = `        console.log('[BANNED] ' + id + ' reputation ' + repScore.toFixed(1) + ' — EXCLUDED from future rounds ❌')
      }
    }

    // Auto-spawn replacement scout if needed
    const activeScouting = ['scout-1', 'scout-2', 'scout-3', 'scout-4'].filter(id => !reputation[id]?.banned)
    if (activeScouting.length < 2 && !reputation['scout-4']?.banned) {
      if (!reputation['scout-4']) {
        reputation['scout-4'] = { wins: 0, totalScore: 0, runs: 0, personality: 'The Newcomer', banned: false }
        saveReputation(reputation)
        console.log('\\n[SPAWN] 🆕 Scout-4 "The Newcomer" joined the marketplace')
        console.log('[SPAWN] Wallet: 0xB191a13bfE648B61002F2e2135867015B71816a6')
        console.log('[SPAWN] Reputation: 0 — must prove itself\\n')
      }
    }

    // Escrow refund`

if (content.includes(oldBanCheck)) {
  content = content.replace(oldBanCheck, newBanCheck)
  writeFileSync('wdk-sidecar/agent-economy.mjs', content)
  console.log('Done')
} else {
  console.log('Pattern not found')
}
