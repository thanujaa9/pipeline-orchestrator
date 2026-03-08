import mongoose from 'mongoose'
import { connectMongo, RuleModel } from './mongo'

/**
 * Five sample routing rules as defined in the technical specification.
 * Evaluated in ascending priority order — lowest number runs first.
 */
const sampleRules = [
  { field: 'priority',  operator: 'equals',      value: 'critical',  targetQueue: 'urgent', priority: 1 },
  { field: 'amount',    operator: 'greaterThan',  value: 10000,       targetQueue: 'urgent', priority: 2 },
  { field: 'riskScore', operator: 'greaterThan',  value: 0.8,         targetQueue: 'urgent', priority: 3 },
  { field: 'type',      operator: 'equals',       value: 'analytics', targetQueue: 'batch',  priority: 4 },
  { field: 'priority',  operator: 'equals',       value: 'low',       targetQueue: 'batch',  priority: 5 },
]

async function seedRules(): Promise<void> {
  await connectMongo()

  // Clear existing rules before inserting fresh seed data
  await RuleModel.deleteMany({})
  console.log('🗑️  Existing rules cleared')

  const inserted = await RuleModel.insertMany(sampleRules)
  console.log(`✅ ${inserted.length} routing rules seeded successfully`)

  // Disconnect cleanly after write is confirmed
  await mongoose.disconnect()
  console.log('🔌 MongoDB disconnected cleanly')
}

seedRules().catch((error) => {
  console.error('❌ Seeding failed:', error)
  mongoose.disconnect()
  process.exit(1)
})