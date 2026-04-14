import mongoose from 'mongoose'
import { connectMongo, RuleModel } from '../db/mongo'

/**
 * seedRules.ts
 * 50 routing rules across 6 categories using priority-ordered
 * deterministic evaluation. First match wins — evaluation stops
 * immediately when a rule matches, making the system O(n) with
 * early exit. This is the same strategy used by Apache Kafka
 * Stream Processors and Drools Rule Engine internally.
 *
 * Rule Hierarchy (which category is evaluated first):
 *   1. Fraud/Security rules   (safety critical — must route first)
 *   2. Payment amount rules   (financial risk classification)
 *   3. Risk score rules       (fraud probability score)
 *   4. Priority field rules   (explicit urgency marker)
 *   5. Event type rules       (message classification)
 *   6. Region/Geography rules (geographic risk)
 *
 * Run: npx ts-node src/db/seedRules.ts
 */

const rules = [

  // ════════════════════════════════════════════════════════════
  // CATEGORY 1 — FRAUD & SECURITY RULES (Priority 1–8)
  // Highest priority — security events always evaluated first
  // Exact match rules — deterministic, zero overlap
  // ════════════════════════════════════════════════════════════

  {
    field: 'type', operator: 'equals', value: 'fraud',
    targetQueue: 'urgent', priority: 1,
    description: 'Confirmed fraud event — immediate action required',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'breach',
    targetQueue: 'urgent', priority: 2,
    description: 'Security breach detected — escalate immediately',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'chargeback',
    targetQueue: 'urgent', priority: 3,
    description: 'Chargeback initiated — high financial risk',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'alert',
    targetQueue: 'urgent', priority: 4,
    description: 'System alert — requires immediate processing',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'suspicious',
    targetQueue: 'urgent', priority: 5,
    description: 'Suspicious activity flagged for review',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'blacklisted',
    targetQueue: 'urgent', priority: 6,
    description: 'Blacklisted entity detected — block immediately',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'aml',
    targetQueue: 'urgent', priority: 7,
    description: 'Anti-money laundering flag — regulatory requirement',
    category: 'fraud',
  },
  {
    field: 'type', operator: 'equals', value: 'sanction',
    targetQueue: 'urgent', priority: 8,
    description: 'Sanctioned entity — legal compliance required',
    category: 'fraud',
  },

  // ════════════════════════════════════════════════════════════
  // CATEGORY 2 — PAYMENT AMOUNT RULES (Priority 9–18)
  // Range-based classification using priority-ordered evaluation.
  // First-match wins eliminates overlap:
  //   amount=120000 → matches Rule 9 → STOPS (Rules 10-12 skipped)
  //   amount=75000  → skips Rule 9 → matches Rule 10 → STOPS
  //   amount=25000  → skips 9,10 → matches Rule 11 → STOPS
  // This is "Priority-Ordered Deterministic Rule Evaluation"
  // ════════════════════════════════════════════════════════════

  {
    field: 'amount', operator: 'greaterThan', value: 100000,
    targetQueue: 'urgent', priority: 9,
    description: 'CRITICAL tier: amount > $100,000 — senior approval required',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'greaterThan', value: 50000,
    targetQueue: 'urgent', priority: 10,
    description: 'HIGH tier: $50,000–$100,000 — compliance review required',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'greaterThan', value: 10000,
    targetQueue: 'urgent', priority: 11,
    description: 'MEDIUM tier: $10,000–$50,000 — flagged for review',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'greaterThan', value: 5000,
    targetQueue: 'urgent', priority: 12,
    description: 'LOW-URGENT tier: $5,000–$10,000 — monitored transaction',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'greaterThan', value: 1000,
    targetQueue: 'urgent', priority: 13,
    description: 'STANDARD-URGENT tier: $1,000–$5,000 — standard payment alert',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'lessThan', value: 10,
    targetQueue: 'batch', priority: 14,
    description: 'MICRO tier: < $10 — micro-transaction, batch processing',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'lessThan', value: 50,
    targetQueue: 'batch', priority: 15,
    description: 'SMALL tier: $10–$50 — small transaction, low risk',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'lessThan', value: 100,
    targetQueue: 'batch', priority: 16,
    description: 'LOW tier: $50–$100 — routine low-value transaction',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'lessThan', value: 500,
    targetQueue: 'batch', priority: 17,
    description: 'ROUTINE tier: $100–$500 — standard batch transaction',
    category: 'payment',
  },
  {
    field: 'amount', operator: 'lessThan', value: 1000,
    targetQueue: 'batch', priority: 18,
    description: 'STANDARD-BATCH tier: $500–$1,000 — deferred processing',
    category: 'payment',
  },

  // ════════════════════════════════════════════════════════════
  // CATEGORY 3 — RISK SCORE RULES (Priority 19–28)
  // Fraud probability score 0.0–1.0
  // Same first-match-wins strategy as payment rules:
  //   riskScore=0.97 → matches Rule 19 → STOPS
  //   riskScore=0.92 → skips 19 → matches Rule 20 → STOPS
  // ════════════════════════════════════════════════════════════

  {
    field: 'riskScore', operator: 'greaterThan', value: 0.95,
    targetQueue: 'urgent', priority: 19,
    description: 'CRITICAL risk: 0.95–1.0 — block transaction immediately',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'greaterThan', value: 0.90,
    targetQueue: 'urgent', priority: 20,
    description: 'VERY HIGH risk: 0.90–0.95 — manual review required',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'greaterThan', value: 0.85,
    targetQueue: 'urgent', priority: 21,
    description: 'HIGH risk: 0.85–0.90 — fraud team notification',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'greaterThan', value: 0.80,
    targetQueue: 'urgent', priority: 22,
    description: 'ELEVATED risk: 0.80–0.85 — additional verification needed',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'greaterThan', value: 0.70,
    targetQueue: 'urgent', priority: 23,
    description: 'MODERATE-HIGH risk: 0.70–0.80 — monitor closely',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'lessThan', value: 0.10,
    targetQueue: 'batch', priority: 24,
    description: 'SAFE: 0.0–0.10 — very low risk, standard processing',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'lessThan', value: 0.20,
    targetQueue: 'batch', priority: 25,
    description: 'LOW risk: 0.10–0.20 — routine transaction',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'lessThan', value: 0.30,
    targetQueue: 'batch', priority: 26,
    description: 'MODERATE-LOW risk: 0.20–0.30 — standard batch',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'lessThan', value: 0.40,
    targetQueue: 'batch', priority: 27,
    description: 'ACCEPTABLE risk: 0.30–0.40 — deferred review',
    category: 'risk',
  },
  {
    field: 'riskScore', operator: 'lessThan', value: 0.50,
    targetQueue: 'batch', priority: 28,
    description: 'BELOW-AVERAGE risk: 0.40–0.50 — batch with logging',
    category: 'risk',
  },

  // ════════════════════════════════════════════════════════════
  // CATEGORY 4 — PRIORITY FIELD RULES (Priority 29–38)
  // Explicit urgency marker on the message itself
  // Exact match — no overlap possible
  // ════════════════════════════════════════════════════════════

  {
    field: 'priority', operator: 'equals', value: 'critical',
    targetQueue: 'urgent', priority: 29,
    description: 'Explicit critical priority — always urgent',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'emergency',
    targetQueue: 'urgent', priority: 30,
    description: 'Emergency level — highest urgency',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'high',
    targetQueue: 'urgent', priority: 31,
    description: 'High priority — fast-track processing',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'urgent',
    targetQueue: 'urgent', priority: 32,
    description: 'Explicitly marked urgent',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'immediate',
    targetQueue: 'urgent', priority: 33,
    description: 'Immediate processing required',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'low',
    targetQueue: 'batch', priority: 34,
    description: 'Low priority — deferred processing acceptable',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'minimal',
    targetQueue: 'batch', priority: 35,
    description: 'Minimal priority — lowest urgency',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'routine',
    targetQueue: 'batch', priority: 36,
    description: 'Routine processing — no time constraint',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'scheduled',
    targetQueue: 'batch', priority: 37,
    description: 'Scheduled task — process in next batch window',
    category: 'priority',
  },
  {
    field: 'priority', operator: 'equals', value: 'deferred',
    targetQueue: 'batch', priority: 38,
    description: 'Explicitly deferred — batch only',
    category: 'priority',
  },

  // ════════════════════════════════════════════════════════════
  // CATEGORY 5 — EVENT TYPE RULES (Priority 39–46)
  // Message classification by business event type
  // Exact match — no overlap
  // ════════════════════════════════════════════════════════════

  {
    field: 'type', operator: 'equals', value: 'payment',
    targetQueue: 'urgent', priority: 39,
    description: 'Payment event — financial transaction requiring tracking',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'transfer',
    targetQueue: 'urgent', priority: 40,
    description: 'Fund transfer — requires immediate confirmation',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'withdrawal',
    targetQueue: 'urgent', priority: 41,
    description: 'Withdrawal event — account debit requires fast processing',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'analytics',
    targetQueue: 'batch', priority: 42,
    description: 'Analytics event — aggregated in batch for reporting',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'report',
    targetQueue: 'batch', priority: 43,
    description: 'Report generation — scheduled batch task',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'sensor',
    targetQueue: 'batch', priority: 44,
    description: 'IoT sensor data — high volume, low urgency',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'log',
    targetQueue: 'batch', priority: 45,
    description: 'System log — archival processing',
    category: 'eventType',
  },
  {
    field: 'type', operator: 'equals', value: 'metrics',
    targetQueue: 'batch', priority: 46,
    description: 'Performance metrics — periodic batch aggregation',
    category: 'eventType',
  },

  // ════════════════════════════════════════════════════════════
  // CATEGORY 6 — GEOGRAPHIC / REGION RULES (Priority 47–50)
  // Geographic risk classification
  // Exact match — no overlap
  // ════════════════════════════════════════════════════════════

  {
    field: 'region', operator: 'equals', value: 'HIGH-RISK',
    targetQueue: 'urgent', priority: 47,
    description: 'High-risk geographic zone — enhanced monitoring',
    category: 'region',
  },
  {
    field: 'region', operator: 'equals', value: 'SANCTIONED',
    targetQueue: 'urgent', priority: 48,
    description: 'Sanctioned region — legal compliance required',
    category: 'region',
  },
  {
    field: 'region', operator: 'equals', value: 'DOMESTIC',
    targetQueue: 'batch', priority: 49,
    description: 'Domestic region — standard processing',
    category: 'region',
  },
  {
    field: 'region', operator: 'equals', value: 'APAC',
    targetQueue: 'batch', priority: 50,
    description: 'Asia-Pacific region — batch processing window',
    category: 'region',
  },
]

async function seed() {
  await connectMongo()

  await RuleModel.deleteMany({})
  console.log('🗑️  Old rules cleared')

  await RuleModel.insertMany(rules)
  console.log(`\n✅ ${rules.length} rules seeded successfully`)
  console.log(`\n📋 Rule breakdown by category:`)

  const categories: Record<string, any[]> = {}
  rules.forEach(r => {
    if (!categories[r.category]) categories[r.category] = []
    categories[r.category].push(r)
  })

  Object.entries(categories).forEach(([cat, catRules]) => {
    const urgent = catRules.filter(r => r.targetQueue === 'urgent').length
    const batch  = catRules.filter(r => r.targetQueue === 'batch').length
    console.log(`   ${cat.padEnd(12)} → ${catRules.length} rules  (${urgent} urgent, ${batch} batch)`)
  })

  console.log(`\n   Total urgent rules: ${rules.filter(r => r.targetQueue === 'urgent').length}`)
  console.log(`   Total batch rules:  ${rules.filter(r => r.targetQueue === 'batch').length}`)
  console.log(`\n📌 Evaluation strategy: Priority-ordered deterministic (first-match wins)`)
  console.log(`   Rule 1 evaluated first → if matched → STOP → no further evaluation`)
  console.log(`   This ensures O(n) early exit — same as Drools + Kafka Stream Processors`)

  await mongoose.disconnect()
  console.log('\n✅ Done')
}

seed().catch(console.error)