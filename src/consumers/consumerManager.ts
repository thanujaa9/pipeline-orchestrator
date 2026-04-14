import { startUrgentConsumer } from './urgentConsumer'
import { startBatchConsumer }  from './batchConsumer'

/**
 * Consumer Manager
 * Starts both urgent and batch consumers together.
 * Run this single file to process all queues simultaneously.
 *
 * To run: npx ts-node src/consumers/consumerManager.ts
 */

async function startAllConsumers(): Promise<void> {
  console.log('╔════════════════════════════════════════╗')
  console.log('║        CONSUMER MANAGER STARTING       ║')
  console.log('╚════════════════════════════════════════╝')
  console.log('')
  console.log('Starting 2 consumers:')
  console.log('  🚨 Urgent Consumer → urgent.queue')
  console.log('  📦 Batch Consumer  → batch.queue')
  console.log('')

  // Start both consumers simultaneously
  await Promise.all([
    startUrgentConsumer(),
    startBatchConsumer(),
  ])
}

startAllConsumers().catch(console.error)