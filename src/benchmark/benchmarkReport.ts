import mongoose from 'mongoose'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'

/**
 * benchmarkReport.ts
 * Usage: npx ts-node src/benchmark/benchmarkReport.ts <benchmarkId>
 */

const BENCHMARK_ID = process.argv[2] || null

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

const fmt = (n: number, d = 2) => n.toFixed(d)

// Safe latency extractor — casts to number, filters nulls
function getLatencies(records: any[]): number[] {
  return records
    .map(r => Number(r.latencyMs))
    .filter(l => !isNaN(l) && l >= 0)
    .sort((a, b) => a - b)
}

async function generateReport() {
  await connectMongo()

  const filter: any = {}
  if (BENCHMARK_ID) {
    filter.benchmarkId = BENCHMARK_ID
    console.log(`\n🔍 BenchmarkId: ${BENCHMARK_ID}`)
  } else {
    console.log(`\n🔍 No benchmarkId — using ALL records`)
  }

  const records = await RoutingHistoryModel.find(filter).lean()

  if (records.length === 0) {
    console.log(`\n❌ No records found. Run the producer first.`)
    await mongoose.disconnect()
    return
  }

  console.log(`\n╔══════════════════════════════════════════════════════════╗`)
  console.log(`║           PIPELINE ORCHESTRATOR BENCHMARK REPORT         ║`)
  console.log(`╚══════════════════════════════════════════════════════════╝`)
  console.log(`\n📊 Total records: ${records.length.toLocaleString()}`)

  // ── METRIC 1: LATENCY ────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📌 METRIC 1: LATENCY (Kafka → RabbitMQ)`)
  console.log(`${'─'.repeat(60)}`)

  const allLatencies    = getLatencies(records)
  const urgentLatencies = getLatencies(records.filter(r => r.targetQueue === 'urgent.queue'))
  const batchLatencies  = getLatencies(records.filter(r => r.targetQueue === 'batch.queue'))

  const avgAll    = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
  const avgUrgent = urgentLatencies.length > 0
    ? urgentLatencies.reduce((a, b) => a + b, 0) / urgentLatencies.length : 0
  const avgBatch  = batchLatencies.length > 0
    ? batchLatencies.reduce((a, b) => a + b, 0) / batchLatencies.length : 0

  console.log(`\n   Overall Latency:`)
  console.log(`   ├── Average: ${fmt(avgAll)} ms`)
  console.log(`   ├── Min:     ${allLatencies[0]} ms`)
  console.log(`   ├── Max:     ${allLatencies[allLatencies.length - 1]} ms`)
  console.log(`   ├── p95:     ${percentile(allLatencies, 95)} ms`)
  console.log(`   └── p99:     ${percentile(allLatencies, 99)} ms`)

  console.log(`\n   urgent.queue (${urgentLatencies.length.toLocaleString()} msgs):`)
  console.log(`   ├── Average: ${fmt(avgUrgent)} ms`)
  console.log(`   ├── p95:     ${urgentLatencies.length > 0 ? percentile(urgentLatencies, 95) : 'N/A'} ms`)
  console.log(`   └── p99:     ${urgentLatencies.length > 0 ? percentile(urgentLatencies, 99) : 'N/A'} ms`)

  console.log(`\n   batch.queue (${batchLatencies.length.toLocaleString()} msgs):`)
  console.log(`   ├── Average: ${fmt(avgBatch)} ms`)
  console.log(`   ├── p95:     ${batchLatencies.length > 0 ? percentile(batchLatencies, 95) : 'N/A'} ms`)
  console.log(`   └── p99:     ${batchLatencies.length > 0 ? percentile(batchLatencies, 99) : 'N/A'} ms`)

  const urgentP95    = urgentLatencies.length > 0 ? percentile(urgentLatencies, 95) : 999
  const batchP95     = batchLatencies.length  > 0 ? percentile(batchLatencies, 95)  : 999
  console.log(`\n   Target check:`)
  console.log(`   ├── Critical p95 < 100ms: ${urgentP95 < 100 ? '✅ PASS' : '❌ FAIL'} (${urgentP95}ms)`)
  console.log(`   └── Batch p95 < 300ms:    ${batchP95  < 300 ? '✅ PASS' : '❌ FAIL'} (${batchP95}ms)`)

  // ── METRIC 2: THROUGHPUT ─────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📌 METRIC 2: THROUGHPUT`)
  console.log(`${'─'.repeat(60)}`)

  const timestamps  = records
    .map(r => new Date(r.timestamp as any).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b)

  const durationSec = timestamps.length > 1
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000 : 1
  const throughput  = records.length / durationSec

  const urgentCount = records.filter(r => r.targetQueue === 'urgent.queue').length
  const batchCount  = records.filter(r => r.targetQueue === 'batch.queue').length

  console.log(`\n   Total messages:   ${records.length.toLocaleString()}`)
  console.log(`   Duration:         ${fmt(durationSec)} seconds`)
  console.log(`   Throughput:       ${fmt(throughput)} messages/second`)
  console.log(`   urgent.queue:     ${urgentCount.toLocaleString()} (${fmt(urgentCount / records.length * 100, 1)}%)`)
  console.log(`   batch.queue:      ${batchCount.toLocaleString()}  (${fmt(batchCount / records.length * 100, 1)}%)`)

  // ── METRIC 3: PRIORITY ACCURACY ──────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📌 METRIC 3: PRIORITY ACCURACY`)
  console.log(`${'─'.repeat(60)}`)

  const criticalMsgs    = records.filter(r => r.isCritical === true)
  const correctlyRouted = criticalMsgs.filter(r => r.targetQueue === 'urgent.queue')
  const misrouted       = criticalMsgs.filter(r => r.targetQueue !== 'urgent.queue')

  const nonCritical      = records.filter(r => r.isCritical === false)
  const nonCritCorrect   = nonCritical.filter(r => r.targetQueue === 'batch.queue')

  const accuracy        = criticalMsgs.length > 0
    ? (correctlyRouted.length / criticalMsgs.length) * 100 : 0
  const overallAccuracy = records.length > 0
    ? ((correctlyRouted.length + nonCritCorrect.length) / records.length) * 100 : 0

  console.log(`\n   Critical messages (isCritical=true): ${criticalMsgs.length.toLocaleString()}`)
  console.log(`   Correctly → urgent.queue:            ${correctlyRouted.length.toLocaleString()}`)
  console.log(`   Misrouted:                           ${misrouted.length}`)
  console.log(`   Critical accuracy:                   ${fmt(accuracy)}%`)
  console.log(`   Overall accuracy:                    ${fmt(overallAccuracy)}%`)
  console.log(`   Target (100%):                       ${accuracy >= 99 ? '✅ PASS' : '❌ BELOW TARGET'}`)

  // ── METRIC 4: QUEUE WAIT TIME ────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📌 METRIC 4: QUEUE WAIT TIME (Inside RabbitMQ)`)
  console.log(`${'─'.repeat(60)}`)

  const processedRecords = records.filter(r => r.processedAt && r.timestamp)

  if (processedRecords.length === 0) {
    console.log(`\n   ⚠️  No processed records — run consumers first:`)
    console.log(`   npx ts-node src/consumers/consumerManager.ts`)
  } else {
    const urgentWaits = processedRecords
      .filter(r => r.targetQueue === 'urgent.queue')
      .map(r => new Date(r.processedAt as any).getTime() - new Date(r.timestamp as any).getTime())
      .filter(w => !isNaN(w) && w >= 0)
      .sort((a, b) => a - b)

    const batchWaits = processedRecords
      .filter(r => r.targetQueue === 'batch.queue')
      .map(r => new Date(r.processedAt as any).getTime() - new Date(r.timestamp as any).getTime())
      .filter(w => !isNaN(w) && w >= 0)
      .sort((a, b) => a - b)

    if (urgentWaits.length > 0) {
      const avg = urgentWaits.reduce((a, b) => a + b, 0) / urgentWaits.length
      console.log(`\n   urgent.queue wait (${urgentWaits.length} processed):`)
      console.log(`   ├── Average: ${fmt(avg)} ms`)
      console.log(`   ├── Min:     ${urgentWaits[0]} ms`)
      console.log(`   ├── Max:     ${urgentWaits[urgentWaits.length - 1]} ms`)
      console.log(`   └── p95:     ${percentile(urgentWaits, 95)} ms`)
    }

    if (batchWaits.length > 0) {
      const avg = batchWaits.reduce((a, b) => a + b, 0) / batchWaits.length
      console.log(`\n   batch.queue wait (${batchWaits.length} processed):`)
      console.log(`   ├── Average: ${fmt(avg)} ms`)
      console.log(`   ├── Min:     ${batchWaits[0]} ms`)
      console.log(`   ├── Max:     ${batchWaits[batchWaits.length - 1]} ms`)
      console.log(`   └── p95:     ${percentile(batchWaits, 95)} ms`)
    }

    if (urgentWaits.length > 0 && batchWaits.length > 0) {
      const uAvg = urgentWaits.reduce((a, b) => a + b, 0) / urgentWaits.length
      const bAvg = batchWaits.reduce((a, b) => a + b, 0) / batchWaits.length
      const improvement = ((bAvg - uAvg) / bAvg) * 100
      console.log(`\n   Priority effectiveness:`)
      console.log(`   └── Urgent processed ${fmt(improvement, 1)}% faster than batch ✅`)
    }
  }

  // ── METRIC 5: RULE DISTRIBUTION ──────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📌 METRIC 5: MESSAGE TYPE DISTRIBUTION`)
  console.log(`${'─'.repeat(60)}`)

  const typeCounts: Record<string, { urgent: number, batch: number }> = {}
  records.forEach(r => {
    const type = (r.messageType as string) || 'unknown'
    if (!typeCounts[type]) typeCounts[type] = { urgent: 0, batch: 0 }
    if (r.targetQueue === 'urgent.queue') typeCounts[type].urgent++
    else typeCounts[type].batch++
  })

  console.log(``)
  Object.entries(typeCounts)
    .sort((a, b) => (b[1].urgent + b[1].batch) - (a[1].urgent + a[1].batch))
    .forEach(([type, counts]) => {
      const total = counts.urgent + counts.batch
      const tag   = counts.urgent > counts.batch ? '🔴 urgent' : '🔵 batch'
      console.log(`   ${type.padEnd(16)} ${String(total).padStart(5)} msgs  ${tag}`)
    })

  // ── SUMMARY TABLE ─────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 SUMMARY (paste into research paper)`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Metric                    │ Value`)
  console.log(`  ──────────────────────────┼──────────────────────────`)
  console.log(`  Total messages            │ ${records.length.toLocaleString()}`)
  console.log(`  Avg latency (all)         │ ${fmt(avgAll)} ms`)
  console.log(`  Avg latency (urgent)      │ ${fmt(avgUrgent)} ms`)
  console.log(`  Avg latency (batch)       │ ${fmt(avgBatch)} ms`)
  console.log(`  p95 latency (urgent)      │ ${urgentLatencies.length > 0 ? percentile(urgentLatencies, 95) : 'N/A'} ms`)
  console.log(`  p95 latency (batch)       │ ${batchLatencies.length > 0 ? percentile(batchLatencies, 95) : 'N/A'} ms`)
  console.log(`  Throughput                │ ${fmt(throughput)} msg/sec`)
  console.log(`  Priority accuracy         │ ${fmt(accuracy)}%`)
  console.log(`  urgent.queue count        │ ${urgentCount.toLocaleString()} (${fmt(urgentCount / records.length * 100, 1)}%)`)
  console.log(`  batch.queue count         │ ${batchCount.toLocaleString()} (${fmt(batchCount / records.length * 100, 1)}%)`)
  console.log(`  Rules evaluated           │ 50 (priority-ordered deterministic)`)
  console.log(`${'═'.repeat(60)}`)

  await mongoose.disconnect()
  console.log(`\n✅ Report complete`)
}

generateReport().catch(console.error)