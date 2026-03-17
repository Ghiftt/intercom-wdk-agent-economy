import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

// Find and replace the entire runAnalyzer function
const start = content.indexOf('async function runAnalyzer(task, goal, winningScout)')
const end = content.indexOf('\nasync function runValidator')

if (start === -1 || end === -1) {
  console.log('Could not find function boundaries')
  process.exit(1)
}

const newAnalyzer = `async function runAnalyzer(task, goal, winningScout) {
  console.log('[AGENT:analyzer] Running deep analysis with web search + Groq...')
  const groq = await getGroq()

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: AGENT_PROMPTS.analyzer
      },
      {
        role: 'user',
        content: 'Goal: ' + goal + '\\n\\nSearch the web for current data then analyze thoroughly. Include:\\n- Specific protocol names, current APYs, TVL figures\\n- Real risks and considerations\\n- Market context and trends\\n- Flag any data you are uncertain about\\n\\nTask: ' + task
      }
    ],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    temperature: 0.3,
    max_tokens: 800
  })

  let analysis = ''
  for (const block of response.content) {
    if (block.type === 'text') analysis += block.text
  }
  if (!analysis) analysis = response.choices?.[0]?.message?.content?.trim() || 'Analysis unavailable'

  console.log('[AGENT:analyzer] Analysis complete - passing to executor\\n')
  return analysis
}`

const newContent = content.slice(0, start) + newAnalyzer + content.slice(end)
writeFileSync('wdk-sidecar/agent-economy.mjs', newContent)
console.log('Done')
