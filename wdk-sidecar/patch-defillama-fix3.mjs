import { readFileSync, writeFileSync } from 'fs'

let lines = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8').split('\n')

// Find the broken lines (152-154) and replace them
const startLine = 151 // 0-indexed = line 152
const endLine = 153   // 0-indexed = line 154

const replacement = [
  `    const summary = relevant.map(p =>`,
  `      p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M | Chain: ' + p.chain`,
  `    ).join('\\n')`,
  `    console.log('[DEFILLAMA] Live data fetched:')`,
  `    relevant.forEach(p => console.log('  ' + p.project + ' ' + p.symbol + ' -> APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M'))`,
  `    return summary`,
  `  } catch (err) {`,
  `    console.log('[DEFILLAMA] Fetch failed: ' + err.message)`,
  `    return null`,
  `  }`,
  `}`
]

// Verify what we're replacing
console.log('Lines being replaced:')
for (let i = startLine; i <= endLine; i++) {
  console.log(i+1 + ': ' + lines[i])
}

lines.splice(startLine, endLine - startLine + 1, ...replacement)

writeFileSync('wdk-sidecar/agent-economy.mjs', lines.join('\n'))
console.log('Done — verifying fix:')

const verify = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8').split('\n').slice(148, 168)
verify.forEach((l, i) => console.log((149+i) + ': ' + l))
