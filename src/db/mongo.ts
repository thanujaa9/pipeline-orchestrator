import mongoose from 'mongoose'
import { config } from '../config/index'

/**
 * Mongoose schema for routing rules stored in the MongoDB
 * 'rules' collection. Each rule defines a single condition
 * that the Rule Engine evaluates against incoming message
 * payloads to determine the target queue.
 *
 * Rules are evaluated in ascending priority order.
 * The first matching rule wins — remaining rules are skipped.
 */
const RuleSchema = new mongoose.Schema({
  field:       { type: String, required: true },
  operator:    { type: String, required: true, enum: ['equals', 'contains', 'greaterThan', 'lessThan'] },
  value:       { type: mongoose.Schema.Types.Mixed, required: true },
  targetQueue: { type: String, required: true, enum: ['urgent', 'batch'] },
  priority:    { type: Number, required: true },
})

/**
 * Mongoose schema for the routing history collection.
 * Every routing decision made by the Orchestrator is persisted
 * here for audit, debugging, and dashboard display purposes.
 *
 * latencyMs is calculated from kafkaTimestamp to the moment
 * the routing decision is made — used for performance analysis.
 */
const RoutingHistorySchema = new mongoose.Schema({
  messageId:   { type: String, required: true },
  timestamp:   { type: String, required: true },
  matchedRule: { type: String, required: true },
  targetQueue: { type: String, required: true },
  latencyMs:   { type: Number, required: true },
})

// Exported models — used by the Rule Engine, Orchestrator, and REST API
export const RuleModel = mongoose.model('Rule', RuleSchema)
export const RoutingHistoryModel = mongoose.model('RoutingHistory', RoutingHistorySchema)

/**
 * Establishes the MongoDB connection using the URI defined
 * in the central config module. Called once during service
 * startup before any database operations are attempted.
 * Throws on failure so the calling service halts cleanly.
 */
export async function connectMongo(): Promise<void> {
  try {
    await mongoose.connect(config.MONGO_URI)
    console.log('✅ MongoDB connected successfully')
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error)
    throw error
  }
}