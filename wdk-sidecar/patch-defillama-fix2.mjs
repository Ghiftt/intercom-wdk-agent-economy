import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

const broken = `    const summary = relevant.map(p =>
      p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL:

  const response = await groq.chat.completions.create({`

const fixed = `    const summary = relevant.map(p =>
      p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M | Chain: ' + p.chain
    ).join('\\n')
    console.log('[DEFILLAMA] Live data fetched:')
    relevant.forEach(p => console.log('  ' + p.project + ' ' + p.symbol + ' -> APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M'))
    return summary
  } catch (err) {
    console.log('[DEFILLAMA] Fetch failed: ' + err.message)
    return null
  }
}

  const response = await groq.chat.completions.create({`

if (content.includes(broken)) {
  content = content.replace(broken, fixed)
  writeFileSync('wdk-sidecar/agent-economy.mjs', content)
  console.log('Fixed and saved')
} else {
  console.log('Pattern not found — printing lines 148-175')
  const lines = content.split('\n').slice(147, 175)
  lines.forEach((l, i) => console.log((148+i) + ': ' + l))
}
