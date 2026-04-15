import { RuleEngine } from './ruleEngine'

/**
 * ruleEngine.test.ts
 * 9 unit tests for the Rule Engine
 * Tests all 4 operators and edge cases
 * No database needed — injects mock rules directly
 *
 * Run: npm test
 */

describe('RuleEngine', () => {
  let engine: RuleEngine

  // Fresh engine before every test — injected with mock rules
  beforeEach(() => {
    engine = new RuleEngine()
    engine['rules'] = [
      { field: 'type',      operator: 'equals',      value: 'fraud',    targetQueue: 'urgent', priority: 1 },
      { field: 'amount',    operator: 'greaterThan', value: 100000,     targetQueue: 'urgent', priority: 2 },
      { field: 'amount',    operator: 'greaterThan', value: 10000,      targetQueue: 'urgent', priority: 3 },
      { field: 'riskScore', operator: 'greaterThan', value: 0.8,        targetQueue: 'urgent', priority: 4 },
      { field: 'riskScore', operator: 'greaterThan', value: 0.5,        targetQueue: 'urgent', priority: 5 },
      { field: 'priority',  operator: 'equals',      value: 'critical', targetQueue: 'urgent', priority: 6 },
      { field: 'type',      operator: 'equals',      value: 'analytics',targetQueue: 'batch',  priority: 7 },
      { field: 'priority',  operator: 'equals',      value: 'low',      targetQueue: 'batch',  priority: 8 },
      { field: 'amount',    operator: 'lessThan',    value: 100,        targetQueue: 'batch',  priority: 9 },
      { field: 'type',      operator: 'contains',    value: 'report',   targetQueue: 'batch',  priority: 10 },
    ]
  })

  // ── Test 1: Fraud type → urgent ───────────────────────────────
  it('routes fraud type to urgent queue', async () => {
    const msg = { id: 't1', timestamp: '', type: 'fraud', priority: 'medium', amount: 500, riskScore: 0.3, region: 'EU', currency: 'USD', userId: 'u1', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('urgent')
  })

  // ── Test 2: High amount → urgent ─────────────────────────────
  it('routes high amount to urgent queue', async () => {
    const msg = { id: 't2', timestamp: '', type: 'payment', priority: 'low', amount: 150000, riskScore: 0.1, region: 'EU', currency: 'USD', userId: 'u2', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('urgent')
  })

  // ── Test 3: High riskScore → urgent ──────────────────────────
  it('routes high riskScore to urgent queue', async () => {
    const msg = { id: 't3', timestamp: '', type: 'payment', priority: 'low', amount: 500, riskScore: 0.92, region: 'EU', currency: 'USD', userId: 'u3', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('urgent')
  })

  // ── Test 4: Critical priority → urgent ───────────────────────
  it('routes critical priority to urgent queue', async () => {
    const msg = { id: 't4', timestamp: '', type: 'payment', priority: 'critical', amount: 500, riskScore: 0.1, region: 'EU', currency: 'USD', userId: 'u4', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('urgent')
  })

  // ── Test 5: Analytics type → batch ───────────────────────────
  it('routes analytics type to batch queue', async () => {
    const msg = { id: 't5', timestamp: '', type: 'analytics', priority: 'low', amount: 50, riskScore: 0.1, region: 'EU', currency: 'USD', userId: 'u5', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('batch')
  })

  // ── Test 6: Low priority → batch ─────────────────────────────
  it('routes low priority to batch queue', async () => {
    const msg = { id: 't6', timestamp: '', type: 'payment', priority: 'low', amount: 200, riskScore: 0.1, region: 'EU', currency: 'USD', userId: 'u6', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('batch')
  })

  // ── Test 7: Small amount → batch ─────────────────────────────
  it('routes small amount to batch queue using lessThan operator', async () => {
    const msg = { id: 't7', timestamp: '', type: 'payment', priority: 'medium', amount: 49, riskScore: 0.1, region: 'EU', currency: 'USD', userId: 'u7', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('batch')
  })

  // ── Test 8: No rule matches → default batch ───────────────────
  it('defaults to batch when no rule matches', async () => {
    const msg = { id: 't8', timestamp: '', type: 'unknown', priority: 'medium', amount: 500, riskScore: 0.3, region: 'EU', currency: 'USD', userId: 'u8', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('batch')
  })

  // ── Test 9: Contains operator works ──────────────────────────
  it('routes message type containing report to batch using contains operator', async () => {
    const msg = { id: 't9', timestamp: '', type: 'monthly-report', priority: 'medium', amount: 500, riskScore: 0.3, region: 'EU', currency: 'USD', userId: 'u9', source: 'web' }
    const result = await engine.evaluate(msg)
    expect(result).toBe('batch')
  })
})