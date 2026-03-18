import { readFileSync, writeFileSync } from 'fs'

let content = readFileSync('wdk-sidecar/agent-economy.mjs', 'utf8')

// Fix 1: displayReputation — filter to scouts only, avoid crash on analyzer/executor
const oldDisplay = `function displayReputation(rep) {
  console.log('\\n[REPUTATION] 🏆 Scout Leaderboard:')
  const sorted = Object.entries(rep).sort((a, b) => b[1].wins - a[1].wins)
  for (const [id, r] of sorted) {
    const avgScore = r.wins > 0 ? (r.totalScore / r.wins).toFixed(1) : 'N/A'
    console.log('  ' + PERSONALITIES[id].name + ' | wins: ' + r.wins + ' | avg validator score: ' + avgScore + ' | runs: ' + r.runs)
  }
}`

const newDisplay = `function displayReputation(rep) {
  console.log('\\n[REPUTATION] 🏆 Scout Leaderboard:')
  const scoutIds = ['scout-1', 'scout-2', 'scout-3', 'scout-4']
  const sorted = Object.entries(rep)
    .filter(([id]) => scoutIds.includes(id))
    .sort((a, b) => b[1].wins - a[1].wins)
  for (const [id, r] of sorted) {
    const avgScore = r.wins > 0 ? (r.totalScore / r.wins).toFixed(1) : 'N/A'
    console.log('  ' + PERSONALITIES[id].name + ' | wins: ' + r.wins + ' | avg validator score: ' + avgScore + ' | runs: ' + r.runs)
  }
}`

// Fix 2: include scout-4 in runs increment
const oldRuns = `for (const id of ['scout-1', 'scout-2', 'scout-3']) {
    if (reputation[id]) reputation[id].runs += 1
  }`

const newRuns = `for (const id of ['scout-1', 'scout-2', 'scout-3', 'scout-4']) {
    if (reputation[id]) reputation[id].runs += 1
  }`

// Also handle version without the guard
const oldRuns2 = `for (const id of ['scout-1', 'scout-2', 'scout-3']) {
    reputation[id].runs += 1
  }`

const newRuns2 = `for (const id of ['scout-1', 'scout-2', 'scout-3', 'scout-4']) {
    if (reputation[id]) reputation[id].runs += 1
  }`

let fixed = 0

if (content.includes(oldDisplay)) {
  content = content.replace(oldDisplay, newDisplay)
  console.log('Fix 1 applied: displayReputation crash fixed')
  fixed++
} else {
  console.log('Fix 1 NOT found')
}

if (content.includes(oldRuns)) {
  content = content.replace(oldRuns, newRuns)
  console.log('Fix 2 applied: scout-4 runs counter fixed')
  fixed++
} else if (content.includes(oldRuns2)) {
  content = content.replace(oldRuns2, newRuns2)
  console.log('Fix 2 applied: scout-4 runs counter fixed')
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
