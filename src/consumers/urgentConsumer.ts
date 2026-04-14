import amqplib from 'amqplib'
import { connectMongo, RoutingHistoryModel } from '../db/mongo'
import { config } from '../config/index'

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

  // Simulate processing based on message type
  if (message.type === 'fraud') {
    console.log(`   🔍 Action: Running fraud detection algorithm...`)
    await new Promise(r => setTimeout(r, 100)) // simulate fraud check
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

  // Update routing history in MongoDB — mark as processed
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

  // Connect to RabbitMQ
  const connection = await amqplib.connect(config.RABBITMQ_URL)
  const channel    = await (connection as any).createChannel()

  // Assert queue — safe even if already exists
  await channel.assertQueue('urgent.queue', {
    durable: true,
    arguments: {
      'x-max-priority':            10,
      'x-dead-letter-exchange':    '',
      'x-dead-letter-routing-key': 'dead.letter.queue',
      'x-message-ttl':             30000,
    },
  })

  // prefetch(1) = process ONE message at a time
  // Don't take next message until current one is acknowledged
  channel.prefetch(1)

  console.log('✅ Urgent Consumer ready — listening on urgent.queue')
  console.log('   Processing: payments, fraud alerts, high-risk transactions\n')

  let processedCount = 0

  channel.consume('urgent.queue', async (msg: any) => {
    if (!msg) return

    try {
      const message = JSON.parse(msg.content.toString())
      await processUrgentMessage(message)

      // Acknowledge — tell RabbitMQ this message is done
      channel.ack(msg)
      processedCount++
      console.log(`   📊 Total processed by urgent-consumer: ${processedCount}`)

    } catch (error: any) {
      console.error(`   ❌ Failed to process message: ${error.message}`)
      // Negative acknowledge — put message back in queue
      channel.nack(msg, false, false) // false = don't requeue → goes to DLQ
    }
  })

  // Handle connection close
  process.on('SIGINT', async () => {
    console.log('\n⚠️  Urgent Consumer shutting down...')
    await channel.close()
    await connection.close()
    process.exit(0)
  })
}

// Run if called directly
startUrgentConsumer().catch(console.error)