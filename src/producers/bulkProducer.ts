import { Kafka, Partitioners } from 'kafkajs'
import { config } from '../config/index'
import { Message } from '../models/message.model'

/**
 * Bulk Message Producer
 *
 * Generates realistic financial transaction messages covering
 * all 50 routing rules across 6 categories.
 *
 * Designed for benchmarking — each message has:
 *   - Realistic random values for all rule fields
 *   - benchmarkId to link to a test run
 *   - testLoad to record messages/sec target
 *   - isCritical flag for priority accuracy measurement
 *
 * Usage:
 *   npx ts-node src/producers/bulkProducer.ts
 *
 * To change volume: update TOTAL_MESSAGES below
 */

// ── Configuration ─────────────────────────────────────────────
const TOTAL_MESSAGES = 15000   // Change to 20000 for larger test
const BATCH_SIZE     = 100     // Messages per Kafka send call
const BENCHMARK_ID   = `bench-${Date.now()}`   // Unique ID for this run

// ── Realistic random value pools ──────────────────────────────

const FRAUD_TYPES     = ['fraud', 'breach', 'chargeback', 'alert',
                         'suspicious', 'blacklisted', 'aml', 'sanction']

const BATCH_TYPES     = ['analytics', 'report', 'sensor', 'log', 'metrics']

const URGENT_TYPES    = ['payment', 'transfer', 'withdrawal']

const ALL_TYPES       = [...FRAUD_TYPES, ...URGENT_TYPES, ...BATCH_TYPES]

const URGENT_PRIORITIES = ['critical', 'emergency', 'high', 'urgent', 'immediate']
const BATCH_PRIORITIES  = ['low', 'minimal', 'routine', 'scheduled', 'deferred']
const ALL_PRIORITIES    = [...URGENT_PRIORITIES, ...BATCH_PRIORITIES]

const URGENT_REGIONS  = ['HIGH-RISK', 'SANCTIONED']
const BATCH_REGIONS   = ['DOMESTIC', 'APAC', 'EU', 'LATAM', 'AFRICA', 'MONITORED']
const ALL_REGIONS     = [...URGENT_REGIONS, ...BATCH_REGIONS]

const CURRENCIES      = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD']
const SOURCES         = ['mobile', 'web', 'api', 'atm', 'pos']

// ── Helper functions ───────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

const rand = (min: number, max: number, decimals = 0): number => {
  const val = Math.random() * (max - min) + min
  return decimals > 0 ? parseFloat(val.toFixed(decimals)) : Math.floor(val)
}

const userId = (i: number) => `user-${String(rand(1, 9999)).padStart(4, '0')}`

/**
 * Message generation strategy:
 * We divide messages into 4 groups so all rule categories are tested:
 *
 * Group A (25%) — Fraud/Security messages     → always urgent (Rules 1–8)
 * Group B (25%) — High-value payment messages → urgent (Rules 9–13)
 * Group C (25%) — High-risk score messages    → urgent (Rules 19–23)
 * Group D (25%) — Routine/Batch messages      → batch (various rules)
 *
 * Within each group, values vary realistically so different
 * rules within the category are triggered.
 */
function generateMessage(index: number): Message {
  const id          = `msg-${String(index).padStart(5, '0')}`
  const timestamp   = new Date().toISOString()
  const group       = index % 4   // 0=fraud, 1=high-payment, 2=high-risk, 3=batch

  switch (group) {

    // ── Group A: Fraud/Security messages ──────────────────────
    case 0: {
      const type = pick(FRAUD_TYPES)
      return {
        id, timestamp, type,
        priority:    pick(URGENT_PRIORITIES),
        amount:      rand(100, 50000),
        riskScore:   rand(0.6, 1.0, 2),
        region:      pick(ALL_REGIONS),
        currency:    pick(CURRENCIES),
        userId:      userId(index),
        source:      pick(SOURCES),
        benchmarkId: BENCHMARK_ID,
        isCritical:  true,
      }
    }

    // ── Group B: High-value payment messages ──────────────────
    case 1: {
      // Vary amounts to trigger different payment rules (9-13)
      const amountRanges = [
        rand(100001, 200000),   // → Rule 9  (> 100,000)
        rand(50001,  100000),   // → Rule 10 (> 50,000)
        rand(10001,  50000),    // → Rule 11 (> 10,000)
        rand(5001,   10000),    // → Rule 12 (> 5,000)
        rand(1001,   5000),     // → Rule 13 (> 1,000)
      ]
      const amount = pick(amountRanges)
      return {
        id, timestamp,
        type:        pick(URGENT_TYPES),
        priority:    pick([...URGENT_PRIORITIES, ...BATCH_PRIORITIES]),
        amount,
        riskScore:   rand(0.1, 0.6, 2),
        region:      pick(ALL_REGIONS),
        currency:    pick(CURRENCIES),
        userId:      userId(index),
        source:      pick(SOURCES),
        benchmarkId: BENCHMARK_ID,
        isCritical:  true,
      }
    }

    // ── Group C: High fraud risk messages ─────────────────────
    case 2: {
      // Vary risk scores to trigger different risk rules (19-23)
      const riskRanges = [
        rand(0.96, 1.00, 2),   // → Rule 19 (> 0.95)
        rand(0.91, 0.95, 2),   // → Rule 20 (> 0.90)
        rand(0.86, 0.90, 2),   // → Rule 21 (> 0.85)
        rand(0.81, 0.85, 2),   // → Rule 22 (> 0.80)
        rand(0.71, 0.80, 2),   // → Rule 23 (> 0.70)
      ]
      return {
        id, timestamp,
        type:        pick([...URGENT_TYPES, ...BATCH_TYPES]),
        priority:    pick(ALL_PRIORITIES),
        amount:      rand(50, 5000),
        riskScore:   pick(riskRanges),
        region:      pick(ALL_REGIONS),
        currency:    pick(CURRENCIES),
        userId:      userId(index),
        source:      pick(SOURCES),
        benchmarkId: BENCHMARK_ID,
        isCritical:  true,
      }
    }

    // ── Group D: Routine/Batch messages ───────────────────────
    case 3:
    default: {
      // Mix of batch types, low amounts, low risk
      const subGroup = index % 5
      const amounts  = [
        rand(1, 9),      // → Rule 14 (< 10)
        rand(10, 49),    // → Rule 15 (< 50)
        rand(50, 99),    // → Rule 16 (< 100)
        rand(100, 499),  // → Rule 17 (< 500)
        rand(500, 999),  // → Rule 18 (< 1000)
      ]
      return {
        id, timestamp,
        type:        pick(BATCH_TYPES),
        priority:    pick(BATCH_PRIORITIES),
        amount:      amounts[subGroup],
        riskScore:   rand(0.0, 0.50, 2),
        region:      pick(BATCH_REGIONS),
        currency:    pick(CURRENCIES),
        userId:      userId(index),
        source:      pick(SOURCES),
        benchmarkId: BENCHMARK_ID,
        isCritical:  false,
      }
    }
  }
}

// ── Main ───────────────────────────────────────────────────────
async function runBulkProducer() {
  const kafka = new Kafka({
  clientId: 'bulk-producer',
  brokers: config.KAFKA_BROKERS,
})

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
})
  await producer.connect()

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║           BULK MESSAGE PRODUCER              ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(``)
  console.log(`📋 Benchmark ID:    ${BENCHMARK_ID}`)
  console.log(`📨 Total messages:  ${TOTAL_MESSAGES.toLocaleString()}`)
  console.log(`📦 Batch size:      ${BATCH_SIZE} messages per send`)
  console.log(``)
  console.log(`📊 Message distribution:`)
  console.log(`   Group A (Fraud/Security):   ~${Math.floor(TOTAL_MESSAGES * 0.25).toLocaleString()} messages → urgent`)
  console.log(`   Group B (High payments):    ~${Math.floor(TOTAL_MESSAGES * 0.25).toLocaleString()} messages → urgent`)
  console.log(`   Group C (High risk score):  ~${Math.floor(TOTAL_MESSAGES * 0.25).toLocaleString()} messages → urgent`)
  console.log(`   Group D (Routine/Batch):    ~${Math.floor(TOTAL_MESSAGES * 0.25).toLocaleString()} messages → batch`)
  console.log(``)
  console.log(`🚀 Sending messages...`)
  console.log(``)

  let sent      = 0
  const startMs = Date.now()

  for (let i = 1; i <= TOTAL_MESSAGES; i += BATCH_SIZE) {
    const batch: any[] = []

    for (let j = i; j < i + BATCH_SIZE && j <= TOTAL_MESSAGES; j++) {
      const msg = generateMessage(j)
      batch.push({
        key:   msg.id,
        value: JSON.stringify(msg),
      })
    }

    await producer.send({
      topic:    config.KAFKA_TOPIC,
      messages: batch,
    })

    sent += batch.length

    // Progress every 1000 messages
    if (sent % 1000 === 0 || sent === TOTAL_MESSAGES) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
      const rate    = Math.floor(sent / parseFloat(elapsed))
      console.log(`   📤 ${sent.toLocaleString().padStart(6)}/${TOTAL_MESSAGES.toLocaleString()} messages  |  ${elapsed}s  |  ~${rate.toLocaleString()} msg/sec`)
    }
  }

  const totalSeconds = (Date.now() - startMs) / 1000
  const avgRate      = Math.floor(TOTAL_MESSAGES / totalSeconds)

  await producer.disconnect()

  console.log(``)
  console.log(`╔══════════════════════════════════════════════╗`)
  console.log(`║              PRODUCER COMPLETE               ║`)
  console.log(`╚══════════════════════════════════════════════╝`)
  console.log(``)
  console.log(`✅ ${TOTAL_MESSAGES.toLocaleString()} messages sent in ${totalSeconds.toFixed(2)} seconds`)
  console.log(`⚡ Average throughput: ${avgRate.toLocaleString()} messages/second`)
  console.log(`🔑 Benchmark ID: ${BENCHMARK_ID}`)
  console.log(``)
  console.log(`📌 Expected routing (verify at http://localhost:15672):`)
  console.log(`   urgent.queue → ~${Math.floor(TOTAL_MESSAGES * 0.75).toLocaleString()} messages  (groups A + B + C)`)
  console.log(`   batch.queue  → ~${Math.floor(TOTAL_MESSAGES * 0.25).toLocaleString()} messages  (group D)`)
  console.log(``)
  console.log(`📌 Verify in MongoDB:`)
  console.log(`   mongosh → use orchestrator`)
  console.log(`   db.routinghistories.countDocuments({ benchmarkId: "${BENCHMARK_ID}" })`)
}

runBulkProducer().catch(console.error)