import express from 'express'
import { exec } from 'child_process'
import * as dotenv from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config()

const app = express()
app.use(express.json())
app.use(express.static(__dirname))

const TASKS_FILE = resolve(__dirname, 'tasks.json')
const PROJECT_PATH = '/home/ubuntu/intercom-wdk-agent-economy'

// Load tasks
function loadTasks() {
  if (!existsSync(TASKS_FILE)) return []
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8'))
}

// Save tasks
function saveTasks(tasks) {
  writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
}

// Generate task ID
function generateId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
}

// Run pipeline in background
function runPipeline(task) {
  const tasks = loadTasks()
  const idx = tasks.findIndex(t => t.id === task.id)
  if (idx !== -1) {
    tasks[idx].status = 'running'
    tasks[idx].startedAt = new Date().toISOString()
    saveTasks(tasks)
  }

  const safeGoal = task.goal.replace(/"/g, '\\"')
  const safeWallet = (task.posterWallet || '').replace(/"/g, '')
  const command = `node ${PROJECT_PATH}/src/orchestrator.js --goal "${safeGoal}" --userWallet="${safeWallet}" --taskId="${task.id}"`

  console.log('[PROVEX] Running pipeline for task: ' + task.id)

  exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
    const tasks = loadTasks()
    const idx = tasks.findIndex(t => t.id === task.id)
    if (idx === -1) return

    if (error) {
      console.error('[PROVEX] Pipeline error: ' + error.message)
      tasks[idx].status = 'failed'
      tasks[idx].error = error.message
      tasks[idx].completedAt = new Date().toISOString()
      saveTasks(tasks)
      return
    }

    // Parse output for key results
    const scoreMatch = stdout.match(/\[VALIDATOR\] Score: (\d+)\/100/)
    const approvedMatch = stdout.match(/Approved: (✅ YES|❌ NO)/)
    const accuracyMatch = stdout.match(/Accuracy:\s+(\d+)\/100/)
    const completenessMatch = stdout.match(/Completeness:\s+(\d+)\/100/)
    const sourceMatch = stdout.match(/Source Quality:\s+(\d+)\/100/)
    const actionMatch = stdout.match(/Actionability:\s+(\d+)\/100/)
    const feedbackMatch = stdout.match(/\[VALIDATOR\] Feedback: (.+)/)

    const score = scoreMatch ? parseInt(scoreMatch[1]) : null
    const approved = approvedMatch ? approvedMatch[1].includes('YES') : false

    // Extract payments
    const paymentMatches = [...stdout.matchAll(/\[PAYMENT\] (\w[\w-]*) → (\w[\w-]*)\n.*?Amount: ([\d.]+ USDT)\n.*?Tx:\s+(0x[a-f0-9]+)/gs)]
    const payments = paymentMatches.map(m => ({
      from: m[1], to: m[2], amount: m[3], tx: m[4]
    }))

    // Extract refund
    const refundMatch = stdout.match(/\[ESCROW\] User refunded.*\n.*Tx: https:\/\/sepolia\.etherscan\.io\/tx\/(0x[a-f0-9]+)/)
    const refundTx = refundMatch ? refundMatch[1] : null

    // Extract DeFiLlama data
    const llamaMatches = [...stdout.matchAll(/- ([^\|]+) \| ([^\|]+) \| APY: ([\d.]+)% \| TVL: \$([\d.]+)M \| Chain: (\w+)/g)]
    const liveYields = llamaMatches.map(m => ({
      protocol: m[1].trim(),
      symbol: m[2].trim(),
      apy: parseFloat(m[3]),
      tvlM: parseFloat(m[4]),
      chain: m[5].trim()
    }))

    tasks[idx].status = approved ? 'completed' : 'refunded'
    tasks[idx].completedAt = new Date().toISOString()
    tasks[idx].validatorScore = score
    tasks[idx].approved = approved
    tasks[idx].validatorBreakdown = {
      accuracy: accuracyMatch ? parseInt(accuracyMatch[1]) : null,
      completeness: completenessMatch ? parseInt(completenessMatch[1]) : null,
      source_quality: sourceMatch ? parseInt(sourceMatch[1]) : null,
      actionability: actionMatch ? parseInt(actionMatch[1]) : null
    }
    tasks[idx].feedback = feedbackMatch ? feedbackMatch[1] : null
    tasks[idx].payments = payments
    tasks[idx].refundTx = refundTx
    tasks[idx].liveYields = liveYields
    tasks[idx].output = stdout.slice(-3000) // last 3000 chars

    saveTasks(tasks)
    console.log('[PROVEX] Task ' + task.id + ' completed — score: ' + score + '/100 — ' + (approved ? 'APPROVED' : 'REJECTED'))
  })
}

// POST /tasks — submit new task
app.post('/tasks', (req, res) => {
  const { goal, budget, posterWallet } = req.body

  if (!goal) return res.status(400).json({ error: 'goal is required' })

  const budgetNum = parseFloat(budget) || 3
  if (budgetNum < 3) return res.status(400).json({ error: 'minimum budget is 3 USDT' })

  const task = {
    id: generateId(),
    goal,
    budget: budgetNum,
    posterWallet: posterWallet || '',
    status: 'open',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    validatorScore: null,
    approved: null,
    validatorBreakdown: null,
    feedback: null,
    payments: [],
    refundTx: null,
    liveYields: [],
    output: null
  }

  const tasks = loadTasks()
  tasks.push(task)
  saveTasks(tasks)

  console.log('[PROVEX] New task posted: ' + task.id + ' | Goal: ' + goal + ' | Budget: ' + budgetNum + ' USDT')

  // Run pipeline immediately in background
  setTimeout(() => runPipeline(task), 100)

  res.json({ success: true, taskId: task.id, message: 'Task submitted. Pipeline running.' })
})

// GET /tasks — list all tasks
app.get('/tasks', (req, res) => {
  const tasks = loadTasks()
  res.json(tasks.reverse()) // newest first
})

// GET /tasks/:id — get specific task
app.get('/tasks/:id', (req, res) => {
  const tasks = loadTasks()
  const task = tasks.find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  res.json(task)
})

// GET /dashboard-data — full snapshot for dashboard
app.get('/dashboard-data', (req, res) => {
  const tasks = loadTasks()
  
  // Load reputation
  let reputation = {}
  try {
    reputation = JSON.parse(readFileSync(resolve(__dirname, 'reputation.json'), 'utf8'))
  } catch(e) {}

  // Stats
  const completed = tasks.filter(t => t.status === 'completed').length
  const refunded = tasks.filter(t => t.status === 'refunded').length
  const total = tasks.length
  const approvalRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const totalPaid = completed * 3

  // Last completed run
  const lastRun = tasks.filter(t => t.status === 'completed' || t.status === 'refunded')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0] || null

  // Live yields from last run
  const liveYields = lastRun?.liveYields || []

  // All payments from last run
  const lastPayments = lastRun?.payments || []

  res.json({
    stats: { total, completed, refunded, approvalRate, totalPaid },
    reputation,
    tasks: tasks.slice(-20).reverse(),
    lastRun,
    liveYields,
    lastPayments
  })
})

// POST /run — kept for CLI compatibility
app.post('/run', (req, res) => {
  const goal = req.body.goal || 'scan defi yields'
  const userWallet = req.body.userWallet || ''
  
  const task = {
    id: generateId(),
    goal,
    budget: 3,
    posterWallet: userWallet,
    status: 'open',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    validatorScore: null,
    approved: null,
    validatorBreakdown: null,
    feedback: null,
    payments: [],
    refundTx: null,
    liveYields: [],
    output: null
  }

  const tasks = loadTasks()
  tasks.push(task)
  saveTasks(tasks)

  setTimeout(() => runPipeline(task), 100)
  res.json({ success: true, taskId: task.id, message: 'Task submitted via /run' })
})

// GET /health
app.get('/health', (req, res) => {
  const tasks = loadTasks()
  res.json({
    status: 'ok',
    service: 'Provex Agent Marketplace',
    version: '1.0.0',
    tasks: tasks.length,
    uptime: process.uptime()
  })
})

// GET / — serve dashboard
app.get('/', (req, res) => {
  res.sendFile(resolve(__dirname, 'dashboard.html'))
})

const PORT = 3001
app.listen(PORT, () => {
  console.log('[PROVEX] Agent Marketplace running on port ' + PORT)
  console.log('[PROVEX] Dashboard: http://localhost:' + PORT)
  console.log('[PROVEX] API: POST http://localhost:' + PORT + '/tasks')
})
