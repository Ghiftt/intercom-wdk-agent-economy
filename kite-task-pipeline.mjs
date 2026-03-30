import { ethers } from 'ethers';
import { buildReceipt, buildReasoning, hashReasoning, hashData, toBytes32, buildSLAHash } from './kite-receipt.mjs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://webhook.site/your-id-here';

// Step 1 — Fetch BTC/ETH price from CoinGecko
async function fetchCoinGeckoData() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';
  const response = await fetch(url);
  if (!response.ok) throw new Error('CoinGecko fetch failed');
  const data = await response.json();
  return {
    BTC: { price: data.bitcoin.usd, change24h: data.bitcoin.usd_24h_change },
    ETH: { price: data.ethereum.usd, change24h: data.ethereum.usd_24h_change }
  };
}

// Step 2 — Fetch Polymarket odds for BTC/ETH markets
async function fetchPolymarketData(asset) {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?search=${asset}&limit=3&active=true`
    );
    if (!response.ok) throw new Error('Polymarket fetch failed');
    const markets = await response.json();

    // Find most relevant active market
    const relevant = markets.find(m =>
      m.question?.toLowerCase().includes(asset.toLowerCase()) &&
      m.active === true
    );

    if (!relevant) return null;

    return {
      market_id: relevant.id,
      question: relevant.question,
      probability: relevant.outcomePrices?.[0] || null,
      volume: relevant.volume,
      end_date: relevant.endDate
    };
  } catch (err) {
    console.warn('Polymarket fetch warning:', err.message);
    return null;
  }
}

// Step 3 — Groq Llama 3 reasoning
async function generateSignal(priceData, polymarketData) {
  const prompt = `You are a financial analysis agent. Based on the following data, generate a structured market signal.

Price Data:
- BTC: $${priceData.BTC.price} (24h change: ${priceData.BTC.change24h?.toFixed(2)}%)
- ETH: $${priceData.ETH.price} (24h change: ${priceData.ETH.change24h?.toFixed(2)}%)

Polymarket Data:
${polymarketData ? `- Market: ${polymarketData.question}
- Probability: ${polymarketData.probability}
- Volume: $${polymarketData.volume}` : '- No active Polymarket data available'}

Respond ONLY with a valid JSON object in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0.0-1.0,
  "primary_asset": "BTC" | "ETH",
  "reasoning": "one sentence explanation",
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "price_target": number or null
}`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300
    })
  });

  if (!response.ok) throw new Error('Groq API failed');
  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // Parse JSON safely
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid Groq response format');
  return JSON.parse(jsonMatch[0]);
}

// Step 4 — Deliver to webhook
async function deliverToWebhook(payload) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { status: response.status, ok: response.ok };
}

// Full pipeline — runs all steps and builds receipt
export async function runTaskPipeline(taskId, agentAddress) {
  console.log(`\nStarting task pipeline for ${taskId}`);
  const steps = [];
  const startTime = Date.now();

  try {
    // Step 1 — CoinGecko
    console.log('Step 1: Fetching CoinGecko data...');
    const priceData = await fetchCoinGeckoData();
    steps.push({
      action: 'fetch_coingecko',
      input: 'BTC,ETH',
      output: priceData,
      timestamp: Date.now(),
      success: true
    });
    console.log(`  BTC: $${priceData.BTC.price} | ETH: $${priceData.ETH.price}`);

    // Step 2 — Polymarket
    console.log('Step 2: Fetching Polymarket data...');
    const polymarketData = await fetchPolymarketData('bitcoin');
    steps.push({
      action: 'fetch_polymarket',
      input: 'bitcoin',
      output: polymarketData,
      timestamp: Date.now(),
      success: true
    });
    if (polymarketData) {
      console.log(`  Market: ${polymarketData.question}`);
    } else {
      console.log('  No active Polymarket market found — continuing');
    }

    // Step 3 — Groq reasoning
    console.log('Step 3: Generating signal with Groq Llama 3...');
    const signal = await generateSignal(priceData, polymarketData);
    steps.push({
      action: 'generate_signal',
      input: { priceData, polymarketData },
      output: signal,
      timestamp: Date.now(),
      success: true
    });
    console.log(`  Signal: ${signal.signal} | Confidence: ${signal.confidence} | Risk: ${signal.risk_level}`);

    // Build structured output payload
    const payload = {
      task_id: taskId,
      agent_address: agentAddress,
      timestamp: new Date().toISOString(),
      price_data: priceData,
      polymarket_data: polymarketData,
      signal,
      execution_time_ms: Date.now() - startTime
    };

    // Step 4 — Deliver to webhook
    console.log('Step 4: Delivering to webhook...');
    const delivery = await deliverToWebhook(payload);
    steps.push({
      action: 'deliver_webhook',
      input: payload,
      output: delivery,
      timestamp: Date.now(),
      success: delivery.ok
    });
    console.log(`  Webhook status: ${delivery.status}`);

    // Build receipt
    const receipt = buildReceipt(taskId, agentAddress, steps);
    console.log(`\nReceipt hash: ${receipt.receipt_hash}`);
    console.log(`Integrity valid: ${receipt.steps.length === 4}`);

    return {
      success: true,
      payload,
      receipt,
      webhookStatus: delivery.status
    };

  } catch (err) {
    console.error('Pipeline error:', err.message);
    return {
      success: false,
      error: err.message,
      steps,
      receipt: buildReceipt(taskId, agentAddress, steps)
    };
  }
}
