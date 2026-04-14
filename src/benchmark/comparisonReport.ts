import mongoose from 'mongoose'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'

/**
 * comparisonReport.ts
 * Usage: npx ts-node src/benchmark/comparisonReport.ts <smartId> <naiveId>
 */

const SMART_ID = process.argv[2]
const NAIVE_ID = process.argv[3]

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

const fmt = (n: number, d = 2) => isNaN(n) ? 'N/A' : n.toFixed(d)

function getLatencies(records: any[]): number[] {
  return records
    .map(r => Number(r.latencyMs))
    .filter(l => !isNaN(l) && l >= 0)
    .sort((a, b) => a - b)
}

function getTimestamps(records: any[]): number[] {
  return records
    .map(r => new Date(r.timestamp as string).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b)
}

async function compare() {
  await connectMongo()

  if (!SMART_ID || !NAIVE_ID) {
    console.log(`\n❌ Usage: npx ts-node src/benchmark/comparisonReport.ts <smartId> <naiveId>`)
    console.log(`\n   Find your IDs:`)
    console.log(`   mongosh → use orchestrator → db.routinghistories.distinct('benchmarkId')`)
    await mongoose.disconnect()
    return
  }

  console.log(`\n╔══════════════════════════════════════════════════════════╗`)
  console.log(`║         SMART vs NAIVE COMPARISON REPORT                 ║`)
  console.log(`╚══════════════════════════════════════════════════════════╝`)

  const smartRecords = await RoutingHistoryModel.find({ benchmarkId: SMART_ID }).lean()
  const naiveRecords = await RoutingHistoryModel.find({ benchmarkId: NAIVE_ID }).lean()

  if (smartRecords.length === 0) {
    console.log(`\n❌ No records for smart ID: ${SMART_ID}`)
    await mongoose.disconnect()
    return
  }
  if (naiveRecords.length === 0) {
    console.log(`\n❌ No records for naive ID: ${NAIVE_ID}`)
    await mongoose.disconnect()
    return
  }

  console.log(`\n   Smart: ${smartRecords.length.toLocaleString()} records (${SMART_ID})`)
  console.log(`   Naive: ${naiveRecords.length.toLocaleString()} records (${NAIVE_ID})`)

  // ── Smart metrics ────────────────────────────────────────────
  const smartAll    = getLatencies(smartRecords)
  const smartUrgent = getLatencies(smartRecords.filter(r => r.targetQueue === 'urgent.queue'))

  const smartAvg    = smartAll.reduce((a, b) => a + b, 0) / smartAll.length
  const smartP95    = percentile(smartAll, 95)
  const smartP99    = percentile(smartAll, 99)
  const smartUrgAvg = smartUrgent.length > 0
    ? smartUrgent.reduce((a, b) => a + b, 0) / smartUrgent.length : 0
  const smartUrgP95 = smartUrgent.length > 0 ? percentile(smartUrgent, 95) : 0

  const smartTs     = getTimestamps(smartRecords)
  const smartDur    = smartTs.length > 1 ? (smartTs[smartTs.length - 1] - smartTs[0]) / 1000 : 1
  const smartThrpt  = smartRecords.length / smartDur

  const smartCrit   = smartRecords.filter(r => r.isCritical === true)
  const smartCorr   = smartCrit.filter(r => r.targetQueue === 'urgent.queue')
  const smartAcc    = smartCrit.length > 0 ? (smartCorr.length / smartCrit.length) * 100 : 0

  // ── Naive metrics ────────────────────────────────────────────
  const naiveAll    = getLatencies(naiveRecords)
  const naiveAvg    = naiveAll.reduce((a, b) => a + b, 0) / naiveAll.length
  const naiveP95    = percentile(naiveAll, 95)
  const naiveP99    = percentile(naiveAll, 99)

  const naiveTs     = getTimestamps(naiveRecords)
  const naiveDur    = naiveTs.length > 1 ? (naiveTs[naiveTs.length - 1] - naiveTs[0]) / 1000 : 1
  const naiveThrpt  = naiveRecords.length / naiveDur
  const naiveAcc    = 0  // No routing = no priority separation

  // ── Improvements ─────────────────────────────────────────────
  const latImp  = naiveAvg  > 0 ? ((naiveAvg  - smartAvg)  / naiveAvg)  * 100 : 0
  const p95Imp  = naiveP95  > 0 ? ((naiveP95  - smartP95)  / naiveP95)  * 100 : 0
  const thrpDif = naiveThrpt > 0 ? ((smartThrpt - naiveThrpt) / naiveThrpt) * 100 : 0

  // ── Print table ───────────────────────────────────────────────
  console.log(`\n${'─'.repeat(65)}`)
  console.log(`  Metric                    │ Smart System  │ Naive System`)
  console.log(`${'─'.repeat(65)}`)
  console.log(`  Messages                  │ ${String(smartRecords.length.toLocaleString()).padEnd(13)} │ ${naiveRecords.length.toLocaleString()}`)
  console.log(`  Avg latency (all)         │ ${fmt(smartAvg).padEnd(13)} │ ${fmt(naiveAvg)} ms`)
  console.log(`  Avg latency (critical)    │ ${fmt(smartUrgAvg).padEnd(13)} │ N/A (no routing)`)
  console.log(`  p95 latency               │ ${String(smartP95).padEnd(13)} │ ${naiveP95} ms`)
  console.log(`  p99 latency               │ ${String(smartP99).padEnd(13)} │ ${naiveP99} ms`)
  console.log(`  Throughput                │ ${fmt(smartThrpt).padEnd(13)} │ ${fmt(naiveThrpt)} msg/sec`)
  console.log(`  Priority accuracy         │ ${fmt(smartAcc).padEnd(13)} │ ${naiveAcc}%`)
  console.log(`  Queues used               │ 2 (priority)  │ 1 (FIFO)`)
  console.log(`  Rules evaluated           │ 50 rules      │ 0 rules`)
  console.log(`${'─'.repeat(65)}`)

  console.log(`\n📈 IMPROVEMENT (Smart vs Naive):`)
  console.log(`   Latency reduction:  ${fmt(latImp, 1)}% faster`)
  console.log(`   p95 improvement:    ${fmt(p95Imp, 1)}% faster`)
  console.log(`   Throughput:         ${thrpDif >= 0 ? '+' : ''}${fmt(thrpDif, 1)}%`)
  console.log(`   Priority accuracy:  ${fmt(smartAcc, 1)}% vs 0%`)

  
  await mongoose.disconnect()
  console.log(`\n✅ Comparison complete`)
}

compare().catch(console.error)