import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

const oldAnalyzer = `async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with web search + Groq...')
  const groq = await getGroq()`

const newAnalyzer = `async function fetchDeFiLlamaData() {
  try {
    const res = await fetch('https://yields.llama.fi/pools')
    const json = await res.json()
    const relevant = json.data.filter(p =>
      ['aave-v3', 'compound-v3', 'aave-v2', 'compound'].includes(p.project) &&
      p.symbol.toUpperCase().includes('USDT') &&
      p.chain === 'Ethereum'
    ).slice(0, 6)
    if (relevant.length === 0) return null
    const summary = relevant.map(p =>
      p.project + ' | ' + p.symbol + ' | APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M | Chain: ' + p.chain
    ).join('\\n')
    console.log('[DEFILLAMA] Live data fetched:')
    relevant.forEach(p => console.log('  ' + p.project + ' ' + p.symbol + ' → APY: ' + p.apy.toFixed(2) + '% | TVL: $' + (p.tvlUsd/1e6).toFixed(1) + 'M'))
    return summary
  } catch (err) {
    console.log('[DEFILLAMA] Fetch failed: ' + err.message)
    return null
  }
}

async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with web search + Groq...')
  const liveData = await fetchDeFiLlamaData()
  const groq = await getGroq()`

const oldUserContent = `        content: 'Goal: ' + goal + '\\n\\nSearch the web for current data then analyze thoroughly. Include:\\n- Specific protocol names, current APYs, TVL figures\\n- Real risks and considerations\\n- Market context and trends\\n- Flag any data you are uncertain about\\n\\nTask: ' + task`

const newUserContent = `        content: 'Goal: ' + goal + (liveData ? '\\n\\n[LIVE DATA FROM DEFILLAMA]:\\n' + liveData + '\\n\\nUse this real data in your analysis. Do not hallucinate APY or TVL figures.' : '') + '\\n\\nAnalyze thoroughly. Include:\\n- Specific protocol names, current APYs, TVL figures\\n- Real risks and considerations\\n- Market context and trends\\n- Flag any data you are uncertain about\\n\\nTask: ' + task`

let fixed = 0

if (content.includes(oldAnalyzer)) {
  content = content.replace(oldAnalyzer, newAnalyzer)
  console.log('Fix 1 applied: fetchDeFiLlamaData function added')
  fixed++
} else {
  console.log('Fix 1 NOT found')
}

if (content.includes(oldUserContent)) {
  content = content.replace(oldUserContent, newUserContent)
  console.log('Fix 2 applied: live data injected into analyzer prompt')
  fixed++
} else {
  console.log('Fix 2 NOT found')
}

if (fixed > 0) {
  writeFileSync('wdk-sidecar/agent-economy.mjs', content)
  console.log('Saved. ' + fixed + '/2 fixes applied.')
} else {
  console.log('Nothing saved.')
}
