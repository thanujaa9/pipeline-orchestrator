import { Rule } from '../models/rule.model'
import { Message } from '../models/message.model'
import { RuleModel } from '../db/mongo'
import { redisClient } from '../db/redis'
import { config } from '../config/index'

/**
 * RuleEngine — core decision-making component of the Orchestrator.
 * Loads routing rules from Redis cache (or MongoDB on cache miss),
 * evaluates each incoming message against rules in priority order,
 * and returns a target queue of either 'urgent' or 'batch'.
 */
export class RuleEngine {
  private rules: Rule[] = []

  /**
   * Loads routing rules into memory.
   * Checks Redis first — falls back to MongoDB on cache miss.
   * Caches MongoDB result in Redis with TTL from config.
   */
  async loadRules(): Promise<void> {
    const cached = await redisClient.get('routing_rules')

    if (cached) {
      this.rules = JSON.parse(cached)
      console.log(`✅ Rules loaded from Redis cache (${this.rules.length} rules)`)
      return
    }

    // Cache miss — load from MongoDB and cache result
    const dbRules = await RuleModel.find().sort({ priority: 1 })
    this.rules = dbRules.map(r => r.toObject()) as Rule[]

    await redisClient.set(
      'routing_rules',
      JSON.stringify(this.rules),
      { EX: config.RULES_CACHE_TTL }
    )

    console.log(`✅ Rules loaded from MongoDB, cached in Redis (${this.rules.length} rules)`)
  }

  /**
   * Evaluates a message against all rules in priority order.
   * Returns the targetQueue of the first matching rule.
   * Defaults to 'batch' if no rule matches.
   */
  evaluate(message: Message): 'urgent' | 'batch' {
    for (const rule of this.rules) {
      const fieldValue = (message as any)[rule.field]

      if (this.check(fieldValue, rule.operator, rule.value)) {
        console.log(`✅ Rule matched — ${rule.field} ${rule.operator} ${rule.value} → ${rule.targetQueue}`)
        return rule.targetQueue
      }
    }

    console.log('⚠️  No rule matched — defaulting to batch')
    return 'batch'
  }

  /**
   * Applies a single rule operator against a message field value.
   * Handles equals, contains, greaterThan, lessThan as per spec.
   */
  private check(
    fieldValue: any,
    operator: string,
    ruleValue: string | number
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === ruleValue

      case 'contains':
        return String(fieldValue).includes(String(ruleValue))

      case 'greaterThan':
        return Number(fieldValue) > Number(ruleValue)

      case 'lessThan':
        return Number(fieldValue) < Number(ruleValue)

      default:
        return false
    }
  }

  /**
   * Invalidates the Redis rules cache and reloads fresh rules
   * from MongoDB. Called by the REST API when a rule is added
   * or deleted via the dashboard.
   */
  async invalidateCache(): Promise<void> {
    await redisClient.del('routing_rules')
    console.log('🗑️  Rules cache invalidated')
    await this.loadRules()
  }
}