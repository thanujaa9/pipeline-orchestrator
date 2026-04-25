import amqplib from 'amqplib'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'
import { config } from '../config/index'
import { QUEUE_CONFIG } from '../config/queues'

/**
 * Urgent Consumer
 * Reads from urgent.queue and processes messages immediately.
 * Handles critical payments, fraud alerts, high-risk transactions.
 * Processes ONE message at a time — speed is priority.
 */

async function processUrgentMessage(message: any): Promise<void> {
  const startTime = Date.now()

  console.log(`\n🚨 [URGENT] Processing message: ${message.id}`)
  console.log(`   Type:     ${message.type}`)
  console.log(`   Priority: ${message.priority}`)
  if (message.amount)    console.log(`   Amount:   $${message.amount}`)
  if (message.riskScore) console.log(`   Risk:     ${message.riskScore}`)

  if (message.type === 'fraud') {
    console.log(`   🔍 Action: Running fraud detection algorithm...`)
    await new Promise(r => setTimeout(r, 100))
    console.log(`   ✅ Action: Fraud alert raised — account flagged`)

  } else if (message.type === 'payment' && message.amount > 10000) {
    console.log(`   💳 Action: High-value payment — requesting manual approval...`)
    await new Promise(r => setTimeout(r, 80))
    console.log(`   ✅ Action: Payment queued for senior approval`)

  } else if (message.riskScore > 0.8) {
    console.log(`   ⚠️  Action: High risk score — blocking transaction...`)
    await new Promise(r => setTimeout(r, 60))
    console.log(`   ✅ Action: Transaction blocked, user notified`)

  } else {
    console.log(`   ⚡ Action: Critical message — fast-tracked for processing`)
    await new Promise(r => setTimeout(r, 50))
    console.log(`   ✅ Action: Processed successfully`)
  }

  const processingTime = Date.now() - startTime

  await RoutingHistoryModel.findOneAndUpdate(
    { messageId: message.id },
    {
      $set: {
        processedAt:    new Date().toISOString(),
        processedBy:    'urgent-consumer',
        processingTime: processingTime,
        status:         'processed',
      }
    }
  )

  console.log(`   ⏱️  Processing time: ${processingTime}ms`)
}

export async function startUrgentConsumer(): Promise<void> {
  await connectMongo()

  console.log('🚀 Starting Urgent Consumer...')

  const connection = await amqplib.connect(config.RABBITMQ_URL)
  const channel    = await (connection as any).createChannel()

  await channel.assertQueue(
    QUEUE_CONFIG.urgent.name,
    QUEUE_CONFIG.urgent.options,
  )

  channel.prefetch(1)

  console.log('✅ Urgent Consumer ready — listening on urgent.queue')
  console.log('   Processing: payments, fraud alerts, high-risk transactions\n')

  let processedCount = 0
  let dlqCount       = 0

  channel.consume(QUEUE_CONFIG.urgent.name, async (msg: any) => {
    if (!msg) return

    // ── Always log raw content so we can see what arrived ────
    const raw = msg.content.toString()
    console.log(`\n📨 Raw message received (${raw.length} bytes): ${raw.substring(0, 80)}${raw.length > 80 ? '...' : ''}`)

    try {
      // ── Validate it's parseable JSON ──────────────────────
      let message: any
      try {
        message = JSON.parse(raw)
      } catch (parseError: any) {
        // JSON parse failed — this is a broken/malformed message
        console.error(`\n☠️  [DLQ DEMO] Malformed JSON detected!`)
        console.error(`   Raw content: ${raw}`)
        console.error(`   Parse error: ${parseError.message}`)
        console.error(`   Action: Sending to dead.letter.queue via nack...`)
        channel.nack(msg, false, false)  // false = don't requeue → goes to DLQ
        dlqCount++
        console.error(`   ☠️  Message rejected → dead.letter.queue (total DLQ: ${dlqCount})`)
        return
      }

      // ── Validate required fields exist ────────────────────
      if (!message.id || !message.type) {
        console.error(`\n☠️  [DLQ DEMO] Missing required fields!`)
        console.error(`   Message: ${JSON.stringify(message)}`)
        console.error(`   Action: Sending to dead.letter.queue via nack...`)
        channel.nack(msg, false, false)
        dlqCount++
        console.error(`   ☠️  Message rejected → dead.letter.queue (total DLQ: ${dlqCount})`)
        return
      }

      // ── Normal processing ─────────────────────────────────
      await processUrgentMessage(message)
      channel.ack(msg)
      processedCount++
      console.log(`   📊 Total processed: ${processedCount} | DLQ rejections: ${dlqCount}`)

    } catch (error: any) {
      console.error(`\n❌ Unexpected error processing message: ${error.message}`)
      console.error(`   Sending to dead.letter.queue...`)
      channel.nack(msg, false, false)
      dlqCount++
      console.error(`   ☠️  Message rejected → dead.letter.queue (total DLQ: ${dlqCount})`)
    }
  })

  process.on('SIGINT', async () => {
    console.log('\n⚠️  Urgent Consumer shutting down...')
    await channel.close()
    await connection.close()
    process.exit(0)
  })
}

// ✅ NO self-invocation — consumerManager.ts is the entry point