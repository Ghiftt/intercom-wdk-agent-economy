import express from 'express'
import { exec } from 'child_process'
import * as dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(express.json())

app.post('/run', (req, res) => {
  const goal = req.body.goal || 'scan defi yields'
  const userWallet = req.body.userWallet || ''
  console.log('[SERVER] Received goal: ' + goal)
  console.log('[SERVER] User wallet: ' + (userWallet || 'not provided'))

  const safeGoal = goal.replace(/"/g, '\\"')
  const safeWallet = userWallet.replace(/"/g, '')
  const command = `node /home/ubuntu/intercom-wdk-agent-economy/src/orchestrator.js --goal "${safeGoal}" --userWallet="${safeWallet}"`

  exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('[SERVER] Error: ' + error.message)
      return res.json({ success: false, error: error.message, output: stdout })
    }
    console.log('[SERVER] Completed successfully')
    res.json({ success: true, output: stdout })
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Kenoflow Agent Economy' })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log('[SERVER] Kenoflow Agent Economy webhook running on port ' + PORT)
})
