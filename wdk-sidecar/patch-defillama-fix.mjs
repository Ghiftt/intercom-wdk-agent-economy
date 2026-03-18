import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

// Find and fix the broken toFixed line in fetchDeFiLlamaData
const broken = `p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M | Chain: ' + p.chain`
const fixed = `p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M | Chain: ' + p.chain`

if (content.includes(broken)) {
  content = content.replace(broken, fixed)
  writeFileSync('wdk-sidecar/agent-economy.mjs', content)
  console.log('Fixed')
} else {
  console.log('Pattern not found — showing line 150-160 for inspection')
  const lines = content.split('\n').slice(148, 160)
  lines.forEach((l, i) => console.log((149+i) + ': ' + l))
}
