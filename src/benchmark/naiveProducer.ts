import { Kafka, Partitioners } from 'kafkajs'
import { config } from '../config/index'

/**
 * naiveProducer.ts
 *
 * Naive system for benchmarking comparison.
 * Sends ALL messages to a single queue with NO priority separation.
 * No rule engine — just topic-based routing.
 *
 * This simulates a basic Kafka → single RabbitMQ queue setup
 * without content-based routing.
 *
 * Used to compare against our smart routing system.
 *
 * Usage: npx ts-node src/benchmark/naiveProducer.ts
 */

import amqplib from 'amqplib'
import mongoose from 'mongoose'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'

const TOTAL_MESSAGES = 15000
const BATCH_SIZE     = 100
const BENCHMARK_ID   = `naive-${Date.now()}`

const FRAUD_TYPES   = ['fraud', 'breach', 'chargeback', 'alert', 'suspicious', 'blacklisted', 'aml', 'sanction']
const BATCH_TYPES   = ['analytics', 'report', 'sensor', 'log', 'metrics']
const URGENT_TYPES  = ['payment', 'transfer', 'withdrawal']
const ALL_TYPES     = [...FRAUD_TYPES, ...URGENT_TYPES, ...BATCH_TYPES]

const URGENT_PRIORITIES = ['critical', 'emergency', 'high', 'urgent', 'immediate']
const BATCH_PRIORITIES  = ['low', 'minimal', 'routine', 'scheduled', 'deferred']
const ALL_PRIORITIES    = [...URGENT_PRIORITIES, ...BATCH_PRIORITIES]
const ALL_REGIONS       = ['HIGH-RISK', 'SANCTIONED', 'DOMESTIC', 'APAC', 'EU', 'LATAM']
const CURRENCIES        = ['USD', 'EUR', 'GBP', 'JPY', 'INR']
const SOURCES           = ['mobile', 'web', 'api', 'atm', 'pos']

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const rand = (min: number, max: number, decimals = 0): number => {
  const val = Math.random() * (max - min) + min
  return decimals > 0 ? parseFloat(val.toFixed(decimals)) : Math.floor(val)
}

async function runNaiveSystem() {
  await connectMongo()

  // Connect to RabbitMQ — assert ONE single queue (no priority)
  const connection = await amqplib.connect(config.RABBITMQ_URL)
  const channel    = await (connection as any).createChannel()

  // ── NAIVE: Single queue, no priority, no dead letter ─────────
  await channel.assertQueue('naive.queue', {
    durable: true,
    // NO x-max-priority
    // NO x-dead-letter-exchange
    // NO x-message-ttl
  })

  // Connect Kafka producer
  const kafka    = new Kafka({ clientId: 'naive-producer', brokers: config.KAFKA_BROKERS, createPartitioner: Partitioners.LegacyPartitioner } as any)
  const producer = kafka.producer()
  await producer.connect()

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║           NAIVE SYSTEM (NO ROUTING)          ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(``)
  console.log(`📋 Benchmark ID:  ${BENCHMARK_ID}`)
  console.log(`📨 Messages:      ${TOTAL_MESSAGES.toLocaleString()}`)
  console.log(`❌ No rules:      All messages → naive.queue (FIFO)`)
  console.log(`❌ No priority:   Critical and batch wait equally`)
  console.log(``)
  console.log(`🚀 Sending messages directly to naive.queue...`)
  console.log(``)

  let sent      = 0
  const startMs = Date.now()
  const latencies: number[] = []

  for (let i = 1; i <= TOTAL_MESSAGES; i++) {
    const group     = i % 4
    const isCritical = group !== 3

    const message = {
      id:          `naive-msg-${String(i).padStart(5, '0')}`,
      timestamp:   new Date().toISOString(),
      type:        group === 0 ? pick(FRAUD_TYPES)
                 : group === 1 ? pick(URGENT_TYPES)
                 : group === 2 ? pick(URGENT_TYPES)
                 : pick(BATCH_TYPES),
      priority:    group === 3 ? pick(BATCH_PRIORITIES) : pick(URGENT_PRIORITIES),
      amount:      rand(1, 200000),
      riskScore:   rand(0, 1, 2),
      region:      pick(ALL_REGIONS),
      currency:    pick(CURRENCIES),
      userId:      `user-${String(rand(1, 9999)).padStart(4, '0')}`,
      source:      pick(SOURCES),
      benchmarkId: BENCHMARK_ID,
      isCritical,
    }

    const publishStart = Date.now()

    // ── NAIVE: Publish directly to single queue, no priority ──
    channel.sendToQueue(
      'naive.queue',
      Buffer.from(JSON.stringify(message)),
      { persistent: true }   // NO priority option
    )

    const latencyMs = Date.now() - publishStart
    latencies.push(latencyMs)

    // Save to MongoDB for comparison
    await RoutingHistoryModel.create({
      messageId:       message.id,
      timestamp:       new Date().toISOString(),
      matchedRule:     'none',           // ← No rule matched — naive system
      targetQueue:     'naive.queue',    // ← Single queue
      latencyMs,
      benchmarkId:     BENCHMARK_ID,
      isCritical:      message.isCritical,
      messageType:     message.type,
      messagePriority: message.priority,
      messageRegion:   message.region,
      riskScore:       message.riskScore,
      amount:          message.amount,
      source:          message.source,
      userId:          message.userId,
    })

    sent++

    if (sent % 1000 === 0 || sent === TOTAL_MESSAGES) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
      console.log(`   📤 ${sent.toLocaleString().padStart(6)}/${TOTAL_MESSAGES.toLocaleString()} messages  |  ${elapsed}s`)
    }
  }

  const totalSeconds = (Date.now() - startMs) / 1000
  const sorted       = [...latencies].sort((a, b) => a - b)
  const avg          = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const p95          = sorted[Math.ceil(0.95 * sorted.length) - 1]

  // Priority accuracy for naive system
  // Critical messages go to naive.queue — but so does everything else
  // Accuracy = 0% because there's no priority separation
  const criticalCount = latencies.filter((_, i) => i % 4 !== 3).length
  const naiveAccuracy = 0  // By definition — no routing means no priority

  await producer.disconnect()
  await channel.close()
  await connection.close()

  console.log(``)
  console.log(`╔══════════════════════════════════════════════╗`)
  console.log(`║           NAIVE SYSTEM COMPLETE              ║`)
  console.log(`╚══════════════════════════════════════════════╝`)
  console.log(``)
  console.log(`✅ ${TOTAL_MESSAGES.toLocaleString()} messages sent in ${totalSeconds.toFixed(2)} seconds`)
  console.log(``)
  console.log(`📊 NAIVE SYSTEM RESULTS:`)
  console.log(`   Avg latency:      ${avg.toFixed(2)} ms`)
  console.log(`   p95 latency:      ${p95} ms`)
  console.log(`   Throughput:       ${Math.floor(TOTAL_MESSAGES / totalSeconds).toLocaleString()} msg/sec`)
  console.log(`   Priority accuracy: ${naiveAccuracy}%  ← No routing = no priority`)
  console.log(`   Queue used:        naive.queue (single, FIFO, no priority)`)
  console.log(``)
  console.log(`🔑 Benchmark ID: ${BENCHMARK_ID}`)
  console.log(``)
  console.log(`👉 Now run the smart system report to compare:`)
  console.log(`   npx ts-node src/benchmark/benchmarkReport.ts`)

  await mongoose.disconnect()
}

runNaiveSystem().catch(console.error)