import { Kafka } from 'kafkajs'
import amqplib from 'amqplib'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'
import { connectRedis } from '../db/redis'
import { RuleEngine } from '../ruleEngine/ruleEngine'
import { Message } from '../models/message.model'
import { config } from '../config/index'

// ── RabbitMQ connection state ─────────────────────────────────────────
let rabbitConnection: any = null
let rabbitChannel: any    = null

// ── Track whether a publish actually succeeded ────────────────────────
let lastPublishSucceeded = false

/**
 * Always returns a live RabbitMQ channel.
 * If connection/channel is null (went down), reconnects first.
 * Retries the connection up to 3 times before giving up.
 *
 * DLQ FIX: urgent.queue now has x-dead-letter-exchange and x-message-ttl.
 * If a message sits in urgent.queue for 30 seconds with no consumer,
 * RabbitMQ automatically moves it to dead.letter.queue.
 * This is the CORRECT way DLQ works — RabbitMQ handles it internally.
 */
async function getChannel(): Promise<any> {
  if (rabbitChannel && rabbitConnection) {
    return rabbitChannel
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🔄 Connecting to RabbitMQ (attempt ${attempt}/3)...`)

      rabbitConnection = await amqplib.connect(config.RABBITMQ_URL)
      rabbitChannel    = await (rabbitConnection as any).createChannel()

      // ── Dead Letter Queue ──────────────────────────────────────────
      // Must be asserted FIRST before the queues that reference it
      await rabbitChannel.assertQueue('dead.letter.queue', {
        durable: true,
      })

      // ── urgent.queue ───────────────────────────────────────────────
      // x-dead-letter-exchange + x-dead-letter-routing-key:
      //   When a message expires (TTL) or is rejected, RabbitMQ
      //   automatically routes it to dead.letter.queue
      // x-message-ttl: 30000ms = 30 seconds
      //   If no consumer reads the message within 30s, it expires → DLQ
      await rabbitChannel.assertQueue('urgent.queue', {
        durable: true,
        arguments: {
          'x-max-priority':            10,
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': 'dead.letter.queue',
          'x-message-ttl':             30000,
        },
      })

      // ── batch.queue ────────────────────────────────────────────────
      // Same DLQ config — batch messages expire after 60 seconds
      await rabbitChannel.assertQueue('batch.queue', {
        durable: true,
        arguments: {
          'x-max-priority':            1,
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': 'dead.letter.queue',
          'x-message-ttl':             60000,
        },
      })

      rabbitConnection.on('close', () => {
        console.warn('⚠️  RabbitMQ connection closed — will reconnect on next message')
        rabbitConnection = null
        rabbitChannel    = null
      })

      rabbitConnection.on('error', (err: Error) => {
        console.warn('⚠️  RabbitMQ connection error:', err.message)
        rabbitConnection = null
        rabbitChannel    = null
      })

      console.log('✅ RabbitMQ connected and queues ready')
      console.log('   urgent.queue  — priority 10, TTL 30s → DLQ on expiry')
      console.log('   batch.queue   — priority 1,  TTL 60s → DLQ on expiry')
      console.log('   dead.letter.queue — receives expired/failed messages')
      return rabbitChannel

    } catch (err: any) {
      console.warn(`⚠️  RabbitMQ not reachable (attempt ${attempt}/3): ${err.message}`)
      rabbitConnection = null
      rabbitChannel    = null

      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  throw new Error('RabbitMQ unreachable after 3 connection attempts')
}

/**
 * Publishes a message to the target RabbitMQ queue.
 * Retries with exponential backoff on failure.
 * After MAX_RETRY_ATTEMPTS sends directly to dead.letter.queue.
 */
async function publishWithRetry(
  queue:   string,
  message: Message,
  attempt: number = 1
): Promise<void> {
  if (attempt === 1) {
    lastPublishSucceeded = false
  }

  try {
    const ch = await getChannel()

    ch.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        priority:   queue === 'urgent.queue' ? 10 : 1,
      }
    )

    lastPublishSucceeded = true

  } catch (error: any) {
    rabbitChannel    = null
    rabbitConnection = null

    if (attempt >= config.MAX_RETRY_ATTEMPTS) {
      console.error(`❌ Max retries reached for message ${message.id} — sending to DLQ`)

      try {
        const ch = await getChannel()
        ch.sendToQueue(
          'dead.letter.queue',
          Buffer.from(JSON.stringify({
            originalQueue: queue,
            message,
            error:         error.message,
            failedAt:      new Date().toISOString(),
          })),
          { persistent: true }
        )
        console.log(`☠️  Message ${message.id} saved to dead.letter.queue`)
        lastPublishSucceeded = false
      } catch (dlqErr: any) {
        console.error(`💀 RabbitMQ fully down — message ${message.id} could not reach DLQ`)
        console.error(`   Original error: ${error.message}`)
        console.error(`   DLQ error: ${dlqErr.message}`)
        lastPublishSucceeded = false
      }
      return
    }

    const delay = Math.pow(2, attempt) * 1000
    console.warn(`⚠️  Publish failed — retrying in ${delay / 1000}s (attempt ${attempt})`)
    await new Promise(resolve => setTimeout(resolve, delay))
    await publishWithRetry(queue, message, attempt + 1)
  }
}

/**
 * Main Orchestrator startup and processing loop.
 */
async function startOrchestrator(): Promise<void> {
  console.log('🚀 Starting Orchestrator...')

  await getChannel()
  await connectMongo()
  await connectRedis()

  const ruleEngine = new RuleEngine()
  await ruleEngine.loadRules()

  const kafka = new Kafka({
    clientId: 'orchestrator',
    brokers:  config.KAFKA_BROKERS,
  })

  const consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID })
  await consumer.connect()
  await consumer.subscribe({ topic: config.KAFKA_TOPIC, fromBeginning: false })

  console.log('✅ Orchestrator running — waiting for messages...')

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const raw = message.value?.toString()
        if (!raw) return

        const parsed: Message = JSON.parse(raw)

        const receivedAt      = Date.now()
        parsed.kafkaTimestamp = receivedAt

        const targetQueue = await ruleEngine.evaluate(parsed)
        const queueName   = targetQueue === 'urgent' ? 'urgent.queue' : 'batch.queue'

        await publishWithRetry(queueName, parsed)

        if (lastPublishSucceeded) {
          const latencyMs = Date.now() - receivedAt

          await RoutingHistoryModel.create({
  messageId:       parsed.id,
  timestamp:       new Date().toISOString(),
  matchedRule:     targetQueue,
  targetQueue:     queueName,
  latencyMs,
  benchmarkId:     parsed.benchmarkId    || null,
  isCritical:      parsed.isCritical     || false,
  messageType:     parsed.type           || null,
  messagePriority: parsed.priority       || null,
  messageRegion:   parsed.region         || null,
  riskScore:       parsed.riskScore      || null,
  amount:          parsed.amount         || null,
  source:          parsed.source         || null,
  userId:          parsed.userId         || null,
})
          console.log(`📨 Message ${parsed.id} → ${queueName} (${latencyMs}ms)`)
        }

      } catch (error) {
        console.error('❌ Error processing message:', error)
      }
    },
  })
}

startOrchestrator().catch(console.error)