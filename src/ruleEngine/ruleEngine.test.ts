import { RuleEngine } from './ruleEngine'
import { Message } from '../models/message.model'

/**
 * Unit tests for the Rule Engine.
 * Tests run against hardcoded rules injected directly —
 * no MongoDB or Redis connection required.
 */

// Sample rules matching the 5 seeded rules in the technical spec
const mockRules = [
  { field: 'priority',  operator: 'equals',     value: 'critical',  targetQueue: 'urgent' as const, priority: 1 },
  { field: 'amount',    operator: 'greaterThan', value: 10000,       targetQueue: 'urgent' as const, priority: 2 },
  { field: 'riskScore', operator: 'greaterThan', value: 0.8,         targetQueue: 'urgent' as const, priority: 3 },
  { field: 'type',      operator: 'equals',      value: 'analytics', targetQueue: 'batch'  as const, priority: 4 },
  { field: 'priority',  operator: 'equals',      value: 'low',       targetQueue: 'batch'  as const, priority: 5 },
]

// Helper — builds a complete valid Message with overrides
function makeMessage(overrides: Partial<Message>): Message {
  return {
    id:        'test-001',
    timestamp: new Date().toISOString(),
    type:      'payment',
    priority:  'medium',
    payload:   {},
    ...overrides,
  }
}

// Inject mock rules directly — bypasses Redis and MongoDB
function makeEngine(): RuleEngine {
  const engine = new RuleEngine()
  ;(engine as any).rules = mockRules
  return engine
}

describe('RuleEngine', () => {

  test('routes critical priority message to urgent', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ priority: 'critical' }))
    expect(result).toBe('urgent')
  })

  test('routes message with amount > 10000 to urgent', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ amount: 75000 }))
    expect(result).toBe('urgent')
  })

  test('routes message with riskScore > 0.8 to urgent', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ riskScore: 0.95 }))
    expect(result).toBe('urgent')
  })

  test('routes analytics type message to batch', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ type: 'analytics', priority: 'medium' }))
    expect(result).toBe('batch')
  })

  test('routes low priority message to batch', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ priority: 'low' }))
    expect(result).toBe('batch')
  })

  test('defaults to batch when no rule matches', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeMessage({ priority: 'medium', type: 'report', amount: 100 }))
    expect(result).toBe('batch')
  })

  test('contains operator works correctly for substring matching', () => {
    const engine = new RuleEngine()
    ;(engine as any).rules = [
      { field: 'type', operator: 'contains', value: 'pay', targetQueue: 'urgent', priority: 1 }
    ]
    const result = engine.evaluate(makeMessage({ type: 'payment' }))
    expect(result).toBe('urgent')
  })

  test('rules evaluated in priority order — first match wins', () => {
    const engine = makeEngine()
    // critical priority matches rule 1 (priority=1) before amount rule (priority=2)
    const result = engine.evaluate(makeMessage({ priority: 'critical', amount: 75000 }))
    expect(result).toBe('urgent')
  })

  test('handles missing optional fields without throwing errors', () => {
    const engine = makeEngine()
    // amount and riskScore are undefined — should not throw
    const result = engine.evaluate(makeMessage({ priority: 'medium', type: 'report' }))
    expect(result).toBe('batch')
  })

})