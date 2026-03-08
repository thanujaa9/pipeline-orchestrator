import { Kafka } from 'kafkajs'
import amqplib, { Channel } from 'amqplib'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'
import { connectRedis } from '../db/redis'
import { RuleEngine } from '../ruleEngine/ruleEngine'
import { Message } from '../models/message.model'
import { config } from '../config/index'

/**
 * Orchestrator — main pipeline service.
 * Connects Kafka, Rule Engine, and RabbitMQ into one
 * continuous processing loop. Reads messages from Kafka,
 * evaluates routing rules, publishes to RabbitMQ queues,
 * and saves routing history to MongoDB.
 */

// ── RabbitMQ connection state ─────────────────────────
let rabbitmqChannel: Channel

/**
 * Asserts all three queues in RabbitMQ.
 * urgent.queue  — priority 10, drains before batch
 * batch.queue   — priority 1
 * dead.letter.queue — receives messages after max retries
 */
async function setupRabbitMQ(): Promise<void> {
  const connection = await amqplib.connect(config.RABBITMQ_URL)
  rabbitmqChannel = await (connection as any).createChannel()

  await rabbitmqChannel.assertQueue('urgent.queue', {
    durable: true,
    arguments: {
      'x-max-priority': 10,
    },
  })

  await rabbitmqChannel.assertQueue('batch.queue', {
    durable: true,
    arguments: { 'x-max-priority': 1 },
  })

  await rabbitmqChannel.assertQueue('dead.letter.queue', {
    durable: true,
  })

  console.log('✅ RabbitMQ queues asserted successfully')
}

/**
 * Publishes a message to the target RabbitMQ queue.
 * Retries with exponential backoff on failure.
 * After MAX_RETRY_ATTEMPTS sends to dead.letter.queue.
 */
async function publishWithRetry(
  queue: string,
  message: Message,
  attempt: number = 1
): Promise<void> {
  try {
    rabbitmqChannel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    )
  } catch (error) {
    if (attempt >= config.MAX_RETRY_ATTEMPTS) {
      console.error(`❌ Max retries reached for message ${message.id} — sending to DLQ`)
      rabbitmqChannel.sendToQueue(
        'dead.letter.queue',
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      )
      return
    }

    // Exponential backoff — 2s, 4s, 8s, 16s
    const delay = Math.pow(2, attempt) * 1000
    console.warn(`⚠️  Publish failed — retrying in ${delay / 1000}s (attempt ${attempt})`)
    await new Promise(resolve => setTimeout(resolve, delay))
    await publishWithRetry(queue, message, attempt + 1)
  }
}

/**
 * Main Orchestrator startup and processing loop.
 * Connects all services, then runs continuously
 * processing one Kafka message at a time.
 */
async function startOrchestrator(): Promise<void> {
  console.log('🚀 Starting Orchestrator...')

  // Step 1 — Connect all services
  await setupRabbitMQ()
  await connectMongo()
  await connectRedis()

  // Step 2 — Initialise Rule Engine and load rules
  const ruleEngine = new RuleEngine()
  await ruleEngine.loadRules()

  // Step 3 — Connect Kafka consumer
  const kafka = new Kafka({
    clientId: 'orchestrator',
    brokers: config.KAFKA_BROKERS,
  })

  const consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID })
  await consumer.connect()
  await consumer.subscribe({ topic: config.KAFKA_TOPIC, fromBeginning: false })

  console.log('✅ Orchestrator running — waiting for messages...')

  // Step 4 — Main processing loop
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        // Parse raw Kafka bytes into typed Message object
        const raw = message.value?.toString()
        if (!raw) return

        const parsed: Message = JSON.parse(raw)

        // Add kafkaTimestamp for latency calculation
        if (!parsed.kafkaTimestamp) {
          parsed.kafkaTimestamp = Date.now()
        }

        // Evaluate routing rules
        const targetQueue = ruleEngine.evaluate(parsed)
        const queueName = targetQueue === 'urgent' ? 'urgent.queue' : 'batch.queue'

        // Publish to correct RabbitMQ queue with retry
        await publishWithRetry(queueName, parsed)

        // Calculate latency
        const latencyMs = Date.now() - (parsed.kafkaTimestamp ?? Date.now())

        // Save routing decision to MongoDB history
        await RoutingHistoryModel.create({
          messageId:   parsed.id,
          timestamp:   new Date().toISOString(),
          matchedRule: targetQueue,
          targetQueue: queueName,
          latencyMs,
        })

        console.log(`📨 Message ${parsed.id} → ${queueName} (${latencyMs}ms)`)

      } catch (error) {
        // Catch all errors — never let eachMessage throw
        // so Kafka can commit the offset cleanly
        console.error('❌ Error processing message:', error)
      }
    },
  })
}

startOrchestrator().catch(console.error)