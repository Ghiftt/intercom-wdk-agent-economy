import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

const oldText = `  const bids = Object.entries(PERSONALITIES).map(([id, p]) => {
    const b = p.bidStyle
    const price = (Math.random() * (b.priceMax - b.priceMin) + b.priceMin).toFixed(4)
    const time = Math.floor(Math.random() * (b.timeMax - b.timeMin) + b.timeMin)
    const confidence = Math.floor(Math.random() * (b.confidenceMax - b.confidenceMin) + b.confidenceMin)
    const wins = reputation[id]?.wins || 0
    return { id, name: p.name, bid: { price, estimatedTime: time, confidence }, wins }
  })`

const newText = `  // Filter out banned scouts
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

  console.log('[BIDDING] ' + activeScouts.length + ' scout(s) eligible to bid\\n')

  const bids = activeScouts.map(([id, p]) => {
    const b = p.bidStyle
    const price = (Math.random() * (b.priceMax - b.priceMin) + b.priceMin).toFixed(4)
    const time = Math.floor(Math.random() * (b.timeMax - b.timeMin) + b.timeMin)
    const confidence = Math.floor(Math.random() * (b.confidenceMax - b.confidenceMin) + b.confidenceMin)
    const wins = reputation[id]?.wins || 0
    return { id, name: p.name, bid: { price, estimatedTime: time, confidence }, wins }
  })`

if (content.includes(oldText)) {
  writeFileSync('wdk-sidecar/agent-economy.mjs', content.replace(oldText, newText))
  console.log('Done')
} else {
  console.log('Pattern not found')
}
