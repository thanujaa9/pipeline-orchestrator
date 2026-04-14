/**
 * Message model — defines the shape of every event message
 * flowing through the pipeline.
 *
 * Designed to cover all 6 rule categories:
 *   - type       → fraud/security rules + event type rules
 *   - amount     → payment amount rules
 *   - riskScore  → risk score rules
 *   - priority   → priority field rules
 *   - region     → geographic rules
 *
 * Additional fields added for:
 *   - source     → future rule dimension (scalability)
 *   - currency   → financial compliance
 *   - userId     → audit trail + user-level rules
 *   - benchmarkId → links messages to benchmark test runs
 */
export interface Message {
  // ── Core fields (required) ──────────────────────────────────
  id:        string    // Unique message ID e.g. 'msg-00001'
  timestamp: string    // ISO 8601 e.g. '2026-04-13T10:00:00Z'
  type:      string    // fraud | breach | chargeback | alert | suspicious |
                       // blacklisted | aml | sanction | payment | transfer |
                       // withdrawal | analytics | report | sensor | log | metrics

  // ── Rule evaluation fields ───────────────────────────────────
  priority:   string   // critical | emergency | high | urgent | immediate |
                       // low | minimal | routine | scheduled | deferred
  amount:     number   // Transaction amount in USD (0 – 200,000)
  riskScore:  number   // Fraud probability score (0.0 – 1.0)
  region:     string   // HIGH-RISK | SANCTIONED | DOMESTIC | APAC |
                       // EU | LATAM | AFRICA | MONITORED

  // ── Financial fields ─────────────────────────────────────────
  currency:   string   // USD | EUR | GBP | JPY | INR | AUD | CAD

  // ── User/source fields ───────────────────────────────────────
  userId:     string   // e.g. 'user-0001' to 'user-9999'
  source:     string   // mobile | web | api | atm | pos
                       // Adds future rule dimension — scalability

  // ── System fields (set by Orchestrator) ─────────────────────
  kafkaTimestamp?:  number   // Set when message is received from Kafka
  kafkaIngestTime?: number   // Epoch ms — Kafka ingestion time (for latency)

  // ── Benchmarking fields (set by benchmark runner) ────────────
  benchmarkId?:  string   // Links message to a specific benchmark test run
  testLoad?:     number   // Messages per second in this test run (100/500/1000)
  isCritical?:   boolean  // True if this message should go to urgent queue
                          // Used to calculate priority handling accuracy

  // ── Optional payload ─────────────────────────────────────────
  payload?: Record<string, any>
}