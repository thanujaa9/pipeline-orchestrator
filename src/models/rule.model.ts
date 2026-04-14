/**
 * Rule model — defines the shape of a routing rule.
 *
 * Evaluation strategy: Priority-ordered deterministic (first-match wins)
 * Rules are sorted by priority (ascending) before evaluation.
 * The first rule that matches the message wins — no further rules checked.
 * This is O(n) with early exit — same strategy used by Apache Kafka
 * Stream Processors and Drools Rule Engine internally.
 *
 * Rule Hierarchy (by category priority):
 *   1. fraud      — security events, always evaluated first
 *   2. payment    — financial risk by amount range
 *   3. risk       — fraud probability score range
 *   4. priority   — explicit urgency field on message
 *   5. eventType  — business event classification
 *   6. region     — geographic risk classification
 */
export interface Rule {
  field:       string
  operator:    'equals' | 'contains' | 'greaterThan' | 'lessThan'
  value:       string | number
  targetQueue: 'urgent' | 'batch'
  priority:    number      // Lower number = evaluated first (1 = highest priority)
  category?:   string      // fraud | payment | risk | priority | eventType | region
  description?: string     // Human-readable explanation of the rule
}