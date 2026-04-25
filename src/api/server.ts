import express from 'express'
import cors from 'cors'
import amqplib from 'amqplib'
import { connectMongo, RuleModel, RoutingHistoryModel } from '../db/mongo'
import { connectRedis, redisClient } from '../db/redis'
import { config } from '../config/index'

const app = express()
app.use(cors())
app.use(express.json())

// ── Helper: safely check a single queue ──────────────────────
// Returns 0 instead of throwing 404 if queue doesn't exist yet
async function safeQueueCount(channel: any, name: string): Promise<number> {
  try {
    const q = await channel.checkQueue(name)
    return q.messageCount
  } catch {
    return 0
  }
}

// ── GET /api/queues ───────────────────────────────────────────
app.get('/api/queues', async (req, res) => {
  let connection: any = null
  try {
    connection        = await amqplib.connect(config.RABBITMQ_URL)
    const channel     = await (connection as any).createChannel()

    // safeQueueCount returns 0 if queue doesn't exist yet
    const [urgentCount, batchCount, dlqCount] = await Promise.all([
      safeQueueCount(channel, 'urgent.queue'),
      safeQueueCount(channel, 'batch.queue'),
      safeQueueCount(channel, 'dead.letter.queue'),
    ])

    await connection.close()

    const totalProcessed = await RoutingHistoryModel.countDocuments({ status: 'processed' })

    res.json({ urgentCount, batchCount, dlqCount, totalProcessed })

  } catch (error: any) {
    if (connection) { try { await connection.close() } catch {} }
    // Return zeros instead of 500 — dashboard stays alive even if RabbitMQ is down
    res.json({ urgentCount: 0, batchCount: 0, dlqCount: 0, totalProcessed: 0 })
  }
})

// ── GET /api/history ─────────────────────────────────────────
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
app.get('/api/metrics', async (req, res) => {
  try {
    const records = await RoutingHistoryModel
      .find()
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean()

    if (records.length === 0) {
      return res.json({ totalMessages: 0, avgLatency: 0, urgentCount: 0, batchCount: 0, accuracy: 0, throughput: 0 })
    }

    const latencies  = records.map(r => Number(r.latencyMs)).filter(l => !isNaN(l) && l >= 0)
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0

    const urgentCount = records.filter(r => r.targetQueue === 'urgent.queue').length
    const batchCount  = records.filter(r => r.targetQueue === 'batch.queue').length

    const critical = records.filter(r => r.isCritical === true)
    const correct  = critical.filter(r => r.targetQueue === 'urgent.queue')
    const accuracy = critical.length > 0 ? (correct.length / critical.length) * 100 : 100

    const timestamps = records.map(r => new Date(r.timestamp as any).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b)
    const duration   = timestamps.length > 1 ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000 : 1
    const throughput = records.length / Math.max(duration, 1)

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
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await RuleModel.find().sort({ priority: 1 }).lean()
    res.json(rules)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── POST /api/rules ───────────────────────────────────────────
app.post('/api/rules', async (req, res) => {
  try {
    const { field, operator, value, targetQueue, priority, category, description } = req.body

    if (!field || !operator || value === undefined || !targetQueue || !priority) {
      return res.status(400).json({ error: 'Missing required fields: field, operator, value, targetQueue, priority' })
    }

    const rule = await RuleModel.create({ field, operator, value, targetQueue, priority, category, description })
    await redisClient.del('routing_rules')
    console.log('🔄 Redis cache invalidated — new rule active')

    res.status(201).json({ message: 'Rule created', rule })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── PUT /api/rules/:id ────────────────────────────────────────
app.put('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { field, operator, value, targetQueue, priority, category, description } = req.body

    if (!field || !operator || value === undefined || !targetQueue || !priority) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const rule = await RuleModel.findByIdAndUpdate(
      id,
      { field, operator, value, targetQueue, priority, category, description },
      { new: true }
    )

    if (!rule) return res.status(404).json({ error: 'Rule not found' })

    await redisClient.del('routing_rules')
    console.log('🔄 Redis cache invalidated — updated rule active')

    res.json({ message: 'Rule updated', rule })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── DELETE /api/rules/:id ─────────────────────────────────────
app.delete('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params
    await RuleModel.findByIdAndDelete(id)
    await redisClient.del('routing_rules')
    console.log('🔄 Redis cache invalidated — rule removed')
    res.json({ message: 'Rule deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
// Add to src/api/server.ts
// Find this in src/api/server.ts and replace:
app.post('/api/test/broken-message', async (req, res) => {
  try {
    const connection = await amqplib.connect(config.RABBITMQ_URL)
    const channel    = await (connection as any).createChannel()

    // DON'T assertQueue here — queue already exists with correct args
    // Just send directly to it
    channel.sendToQueue(
      'urgent.queue',
      Buffer.from('{ this is broken json !!!'),
      { persistent: true, priority: 10 }
    )

    await new Promise(r => setTimeout(r, 100)) // wait for send to complete
    await connection.close()

    res.json({ message: '💀 Broken message sent to urgent.queue → will go to DLQ' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
// ── Start ─────────────────────────────────────────────────────
async function startServer() {
  await connectMongo()
  await connectRedis()

  app.listen(config.API_PORT, () => {
    console.log(`\n🚀 REST API → http://localhost:${config.API_PORT}`)
    console.log(`   GET    /api/queues`)
    console.log(`   GET    /api/history`)
    console.log(`   GET    /api/metrics`)
    console.log(`   GET    /api/rules`)
    console.log(`   POST   /api/rules`)
    console.log(`   PUT    /api/rules/:id`)
    console.log(`   DELETE /api/rules/:id`)
    console.log(`   GET    /api/health`)
  })
}

startServer().catch(console.error)