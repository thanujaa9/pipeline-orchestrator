import express from 'express'
import cors from 'cors'
import amqplib from 'amqplib'
import { connectMongo, RuleModel, RoutingHistoryModel } from '../db/mongo'
import { connectRedis, redisClient } from '../db/redis'
import { config } from '../config/index'

/**
 * REST API — 6 endpoints for the dashboard
 *
 * GET  /api/queues    — RabbitMQ queue message counts
 * GET  /api/history   — recent routing decisions
 * GET  /api/metrics   — latency, throughput, accuracy
 * GET  /api/rules     — all routing rules
 * POST /api/rules     — add a new rule
 * DELETE /api/rules/:id — delete a rule
 *
 * Run: npx ts-node src/api/server.ts
 */

const app = express()
app.use(cors())
app.use(express.json())

// ── GET /api/queues ───────────────────────────────────────────
// Returns live message counts from RabbitMQ
app.get('/api/queues', async (req, res) => {
  try {
    const connection = await amqplib.connect(config.RABBITMQ_URL)
    const channel    = await (connection as any).createChannel()

    const urgent = await channel.checkQueue('urgent.queue')
    const batch  = await channel.checkQueue('batch.queue')
    const dlq    = await channel.checkQueue('dead.letter.queue')

    await channel.close()
    await connection.close()

    const totalProcessed = await RoutingHistoryModel.countDocuments({ status: 'processed' })

    res.json({
      urgentCount:    urgent.messageCount,
      batchCount:     batch.messageCount,
      dlqCount:       dlq.messageCount,
      totalProcessed,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── GET /api/history ─────────────────────────────────────────
// Returns recent routing history records
app.get('/api/history', async (req, res) => {
  try {
    const limit   = parseInt(req.query.limit as string) || 50
    const records = await RoutingHistoryModel
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
    res.json(records)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── GET /api/metrics ─────────────────────────────────────────
// Returns latency, throughput, accuracy metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const records = await RoutingHistoryModel
      .find()
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean()

    if (records.length === 0) {
      return res.json({
        totalMessages: 0, avgLatency: 0,
        urgentCount: 0,  batchCount: 0,
        accuracy: 0,     throughput: 0,
      })
    }

    const latencies   = records.map(r => Number(r.latencyMs)).filter(l => !isNaN(l) && l >= 0)
    const avgLatency  = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0

    const urgentCount = records.filter(r => r.targetQueue === 'urgent.queue').length
    const batchCount  = records.filter(r => r.targetQueue === 'batch.queue').length

    const critical    = records.filter(r => r.isCritical === true)
    const correct     = critical.filter(r => r.targetQueue === 'urgent.queue')
    const accuracy    = critical.length > 0 ? (correct.length / critical.length) * 100 : 100

   const timestamps  = records.map(r => new Date(r.timestamp as any).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b)
    const duration    = timestamps.length > 1 ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000 : 1
    const throughput  = records.length / duration

    res.json({
      totalMessages: records.length,
      avgLatency:    parseFloat(avgLatency.toFixed(2)),
      urgentCount,
      batchCount,
      accuracy:      parseFloat(accuracy.toFixed(2)),
      throughput:    parseFloat(throughput.toFixed(2)),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── GET /api/rules ────────────────────────────────────────────
// Returns all routing rules sorted by priority
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await RuleModel.find().sort({ priority: 1 }).lean()
    res.json(rules)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── POST /api/rules ───────────────────────────────────────────
// Add a new routing rule
app.post('/api/rules', async (req, res) => {
  try {
    const { field, operator, value, targetQueue, priority, category, description } = req.body

    if (!field || !operator || value === undefined || !targetQueue || !priority) {
      return res.status(400).json({ error: 'Missing required fields: field, operator, value, targetQueue, priority' })
    }

    const rule = await RuleModel.create({ field, operator, value, targetQueue, priority, category, description })

    // Invalidate Redis cache so new rule is picked up immediately
    await redisClient.del('routing_rules')
    console.log('🔄 Redis cache invalidated — new rule will take effect immediately')

    res.status(201).json({ message: 'Rule created', rule })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── DELETE /api/rules/:id ─────────────────────────────────────
// Delete a routing rule by ID
app.delete('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params
    await RuleModel.findByIdAndDelete(id)

    // Invalidate Redis cache
    await redisClient.del('routing_rules')
    console.log('🔄 Redis cache invalidated — deleted rule removed from evaluation')

    res.json({ message: 'Rule deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Start server ──────────────────────────────────────────────
async function startServer() {
  await connectMongo()
  await connectRedis()

  app.listen(config.API_PORT, () => {
    console.log(`\n🚀 REST API running at http://localhost:${config.API_PORT}`)
    console.log(`\n   Endpoints:`)
    console.log(`   GET  /api/queues    — RabbitMQ queue counts`)
    console.log(`   GET  /api/history   — routing history`)
    console.log(`   GET  /api/metrics   — latency, throughput, accuracy`)
    console.log(`   GET  /api/rules     — all 50 rules`)
    console.log(`   POST /api/rules     — add a rule`)
    console.log(`   DELETE /api/rules/:id — delete a rule`)
    console.log(`   GET  /api/health    — health check`)
  })
}

startServer().catch(console.error)