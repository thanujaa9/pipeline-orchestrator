import { startUrgentConsumer } from './urgentConsumer'
import { startBatchConsumer }  from './batchConsumer'

/**
 * Consumer Manager
 * Starts both urgent and batch consumers together.
 * This is the ONLY entry point — consumer files do NOT self-invoke.
 *
 * To run: npx ts-node src/consumers/consumerManager.ts
 */

let isStarted = false  // guard against accidental double-invocation

async function startAllConsumers(): Promise<void> {
  if (isStarted) {
    console.warn('⚠️  Consumer Manager already started — skipping duplicate call')
    return
  }
  isStarted = true

  console.log('╔════════════════════════════════════════╗')
  console.log('║        CONSUMER MANAGER STARTING       ║')
  console.log('╚════════════════════════════════════════╝')
  console.log('')
  console.log('Starting 2 consumers:')
  console.log('  🚨 Urgent Consumer → urgent.queue')
  console.log('  📦 Batch Consumer  → batch.queue')
  console.log('')

  try {
    // Start both consumers simultaneously
    await Promise.all([
      startUrgentConsumer(),
      startBatchConsumer(),
    ])
  } catch (err) {
    console.error('❌ Consumer Manager failed to start:', err)
    process.exit(1)
  }
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT — shutting down consumers...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM — shutting down consumers...')
  process.exit(0)
})

startAllConsumers().catch((err) => {
  console.error('❌ Unhandled error in Consumer Manager:', err)
  process.exit(1)
})