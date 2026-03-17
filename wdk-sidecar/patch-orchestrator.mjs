import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('src/orchestrator.js', 'utf8')

// Replace the broadcastSubtasks function with dispatchToAgent
const oldBroadcast = `async function broadcastSubtasks(goal, subtasks) {
  const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
  const swarm = new Hyperswarm()
  swarm.on('connection', (conn, info) => {
    const peerId = info.publicKey.toString('hex').slice(0,12)
    console.log('[P2P] Peer connected: ' + peerId)
    for (const subtask of subtasks) {
      conn.write(JSON.stringify({ type:'orchestrator_task', version:ORCHESTRATOR_VERSION, goal, subtask, timestamp:Date.now() }))
      console.log('[TASK] broadcast task #' + subtask.id + ' [' + subtask.agentType + '] to ' + peerId)
    }
    conn.on('error', ()=>{})
  })
  await swarm.join(topic, { server:true, client:true })
  console.log('[P2P] Listening on sidechannel. Waiting 8s for peers...')
  await new Promise(r => setTimeout(r, 8000))
  await swarm.destroy()
}`

const newDispatch = `async function dispatchToAgent(agentType, taskId, payload) {
  return new Promise((resolve, reject) => {
    const topic = crypto.createHash('sha256').update('intercom-ai-orchestrator-v1').digest()
    const swarm = new Hyperswarm()
    let settled = false
    let agentProcess = null

    const timeout = setTimeout(async () => {
      if (!settled) {
        settled = true
        console.log('[P2P] Agent ' + agentType + ' timed out')
        if (agentProcess) agentProcess.kill()
        await swarm.destroy()
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
            conn.write(JSON.stringify({
              type: 'task',
              taskId,
              payload
            }))
          }

          if (msg.type === 'result' && msg.taskId === taskId) {
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              console.log('[P2P] Agent ' + agentType + ' result received')
              await swarm.destroy()
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

    swarm.join(topic, { server: true, client: false }).then(() => {
      console.log('[P2P] Orchestrator waiting for ' + agentType + '...')

      // Spawn agent process
      const { spawn } = require('child_process') 
      agentProcess = spawn('node', ['wdk-sidecar/agent.mjs', '--type=' + agentType], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env
      })

      agentProcess.on('error', async (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          await swarm.destroy()
          resolve(null)
        }
      })

      agentProcess.on('exit', async (code) => {
        if (!settled && code !== 0) {
          settled = true
          clearTimeout(timeout)
          await swarm.destroy()
          resolve(null)
        }
      })
    })
  })
}`

if (content.includes('async function broadcastSubtasks')) {
  content = content.replace(oldBroadcast, newDispatch)
  writeFileSync('src/orchestrator.js', content)
  console.log('Done - broadcastSubtasks replaced with dispatchToAgent')
} else {
  console.log('Pattern not found')
}
