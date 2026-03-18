import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

const broken = `}
  const response = await groq.chat.completions.create({`

const fixed = `}

async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with web search + Groq...')
  const liveData = await fetchDeFiLlamaData()
  const groq = await getGroq()
  const response = await groq.chat.completions.create({`

if (content.includes(broken)) {
  content = content.replace(broken, fixed)
  writeFileSync('wdk-sidecar/agent-economy.mjs', content)
  console.log('Fixed and saved')
} else {
  console.log('Pattern not found')
}
