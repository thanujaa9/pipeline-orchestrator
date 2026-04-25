import amqplib from 'amqplib'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'
import { config } from '../config/index'
import { QUEUE_CONFIG } from '../config/queues'

/**
 * Batch Consumer
 * Reads from batch.queue and processes messages in groups.
 * Handles analytics, reports, sensor data, low-priority events.
 * Collects 10 messages then processes them together — efficiency is priority.
 */

const BATCH_SIZE    = 10     // process 10 messages at once
const BATCH_TIMEOUT = 5000   // or process after 5 seconds even if batch not full

async function processBatch(messages: any[]): Promise<void> {
  const startTime = Date.now()

  console.log(`\n📦 [BATCH] Processing batch of ${messages.length} messages...`)

  // Group by type for efficient processing
  const byType: Record<string, any[]> = {}
  messages.forEach(msg => {
    if (!byType[msg.type]) byType[msg.type] = []
    byType[msg.type].push(msg)
  })

  // Process each group
  for (const [type, group] of Object.entries(byType)) {
    console.log(`   📂 Type '${type}': ${group.length} messages`)

    if (type === 'analytics') {
      console.log(`      📊 Action: Aggregating analytics data...`)
      await new Promise(r => setTimeout(r, 200))
      console.log(`      ✅ Analytics batch written to data warehouse`)

    } else if (type === 'report') {
      console.log(`      📄 Action: Generating reports...`)
      await new Promise(r => setTimeout(r, 150))
      console.log(`      ✅ Reports generated and stored`)

    } else if (type === 'sensor') {
      console.log(`      🌡️  Action: Processing sensor readings...`)
      await new Promise(r => setTimeout(r, 100))
      console.log(`      ✅ Sensor data stored in time-series DB`)

    } else {
      console.log(`      ⚙️  Action: Processing batch...`)
      await new Promise(r => setTimeout(r, 100))
      console.log(`      ✅ Batch processed`)
    }
  }

  const processingTime = Date.now() - startTime

  // Update all messages in MongoDB as processed
  const messageIds = messages.map(m => m.id)
  await RoutingHistoryModel.updateMany(
    { messageId: { $in: messageIds } },
    {
      $set: {
        processedAt:    new Date().toISOString(),
        processedBy:    'batch-consumer',
        processingTime: processingTime,
        status:         'processed',
      }
    }
  )

  console.log(`   ⏱️  Batch processing time: ${processingTime}ms`)
  console.log(`   ✅ ${messages.length} messages processed and acknowledged`)
}

export async function startBatchConsumer(): Promise<void> {
  await connectMongo()

  console.log('🚀 Starting Batch Consumer...')

  const connection = await amqplib.connect(config.RABBITMQ_URL)
  const channel    = await (connection as any).createChannel()

  // Use shared config — guarantees same args as orchestrator
  await channel.assertQueue(
    QUEUE_CONFIG.batch.name,
    QUEUE_CONFIG.batch.options,
  )

  // prefetch(10) = pull up to 10 messages at once for batch processing
  channel.prefetch(BATCH_SIZE)

  console.log('✅ Batch Consumer ready — listening on batch.queue')
  console.log(`   Batch size: ${BATCH_SIZE} messages`)
  console.log(`   Batch timeout: ${BATCH_TIMEOUT / 1000} seconds`)
  console.log('   Processing: analytics, reports, sensor data, low-priority events\n')

  let pendingMessages: any[]  = []
  let pendingRawMsgs:  any[]  = []
  let totalProcessed          = 0
  let batchTimer:      any    = null

  // Process the current batch
  const flushBatch = async () => {
    if (pendingMessages.length === 0) return

    const toProcess    = [...pendingMessages]
    const toAck        = [...pendingRawMsgs]
    pendingMessages    = []
    pendingRawMsgs     = []

    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }

    try {
      await processBatch(toProcess)

      // Acknowledge all messages in this batch
      toAck.forEach(msg => channel.ack(msg))
      totalProcessed += toProcess.length
      console.log(`   📊 Total processed by batch-consumer: ${totalProcessed}`)

    } catch (error: any) {
      console.error(`   ❌ Batch processing failed: ${error.message}`)
      // Nack all — send to DLQ
      toAck.forEach(msg => channel.nack(msg, false, false))
    }
  }

  channel.consume(QUEUE_CONFIG.batch.name, async (msg: any) => {
    if (!msg) return

    const message = JSON.parse(msg.content.toString())
    pendingMessages.push(message)
    pendingRawMsgs.push(msg)

    console.log(`   ➕ Queued message ${message.id} (batch: ${pendingMessages.length}/${BATCH_SIZE})`)

    // If batch is full — process immediately
    if (pendingMessages.length >= BATCH_SIZE) {
      await flushBatch()
    } else {
      // Otherwise start/reset timer — process after 5 seconds
      if (batchTimer) clearTimeout(batchTimer)
      batchTimer = setTimeout(flushBatch, BATCH_TIMEOUT)
    }
  })

  process.on('SIGINT', async () => {
    console.log('\n⚠️  Batch Consumer shutting down...')
    await flushBatch() // process remaining messages before exit
    await channel.close()
    await connection.close()
    process.exit(0)
  })
}

// ✅ NO self-invocation here — consumerManager.ts is the entry point