import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('src/orchestrator.js', 'utf8')

const start = content.indexOf('async function dispatchToAgent(agentType, taskId, payload)')
const end = content.indexOf('\nasync function main()')

if (start === -1 || end === -1) {
  console.log('Could not find function boundaries')
  process.exit(1)
}

const newFunction = `async function dispatchToAgent(agentType, taskId, payload) {
  return new Promise(async (resolve) => {
    const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
    const swarm = new Hyperswarm()
    let settled = false
    let agentProcess = null

    const cleanup = async () => {
      if (agentProcess) agentProcess.kill()
      try { await swarm.destroy() } catch(e) {}
    }

    const timeout = setTimeout(async () => {
      if (!settled) {
        settled = true
        console.log('[P2P] Agent ' + agentType + ' timed out')
        await cleanup()
        resolve(null)
      }
    }, 90000)

    swarm.on('connection', (conn) => {
      console.log('[P2P] Agent ' + agentType + ' connected')

      conn.on('data', async (data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.type === 'agent_ready') {
            console.log('[P2P] Agent ' + agentType + ' ready — sending task...')
            conn.write(JSON.stringify({ type: 'task', taskId, payload }))
          }

          if (msg.type === 'result' && msg.taskId === taskId) {
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              console.log('[P2P] Agent ' + agentType + ' result received ✓')
              await cleanup()
              resolve({
                agentType,
                output: msg.output,
                outputHash: msg.outputHash,
                wallet: msg.wallet,
                taskId: msg.taskId
              })
            }
          }
        } catch (e) {
          console.error('[P2P] Parse error: ' + e.message)
        }
      })

      conn.on('error', () => {})
    })

    await swarm.join(topic, { server: true, client: false })
    console.log('[P2P] Orchestrator ready — spawning ' + agentType + '...')

    agentProcess = spawn('node', ['wdk-sidecar/agent.mjs', '--type=' + agentType], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env
    })

    agentProcess.on('error', async (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        console.log('[P2P] Agent ' + agentType + ' spawn error: ' + err.message)
        await cleanup()
        resolve(null)
      }
    })

    agentProcess.on('exit', async (code) => {
      if (!settled && code !== 0) {
        settled = true
        clearTimeout(timeout)
        console.log('[P2P] Agent ' + agentType + ' exited with code ' + code)
        await cleanup()
        resolve(null)
      }
    })
  })
}`

const newContent = content.slice(0, start) + newFunction + content.slice(end)
writeFileSync('src/orchestrator.js', newContent)
console.log('Done')
