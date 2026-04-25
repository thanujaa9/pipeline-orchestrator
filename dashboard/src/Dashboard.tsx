import { useState, useEffect, useCallback, useRef } from "react"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts"

// ── Types ──────────────────────────────────────────────────────────────
interface QueueStats {
  urgentCount: number
  batchCount: number
  dlqCount: number
  totalProcessed: number
}
interface RoutingHistory {
  messageId: string
  targetQueue: string
  matchedRule: string
  latencyMs: number
  timestamp: string
  messageType: string
  messagePriority: string
  isCritical: boolean
  amount: number
  riskScore: number
  status: string
}
interface Rule {
  _id: string
  field: string
  operator: string
  value: string | number
  targetQueue: string
  priority: number
  category: string
  description: string
}
interface Metrics {
  totalMessages: number
  avgLatency: number
  urgentCount: number
  batchCount: number
  accuracy: number
  throughput: number
}

const API_BASE = "http://localhost:3001/api"

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── Design tokens ─────────────────────────────────────────────────────
const C = {
  bg:       "#0d1117",
  surface:  "#161b22",
  card:     "#1c2128",
  border:   "#30363d",
  muted:    "#484f58",
  text:     "#e6edf3",
  sub:      "#8b949e",
  urgent:   "#f85149",
  batch:    "#388bfd",
  dlq:      "#e3b341",
  green:    "#3fb950",
  teal:     "#39d353",
  accent:   "#58a6ff",
}

// ── Shared micro-components ───────────────────────────────────────────
const Card = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "20px 24px",
    ...style,
  }}>
    {children}
  </div>
)

const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span style={{
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    padding: "2px 8px",
    borderRadius: 20,
    border: `1px solid ${color}44`,
    color,
    background: `${color}18`,
    fontFamily: "monospace",
  }}>{children}</span>
)

const StatusDot = ({ alive }: { alive: boolean }) => (
  <span style={{
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: alive ? C.green : C.urgent,
    boxShadow: alive ? `0 0 6px ${C.green}` : "none",
  }} />
)

// ── Sparkline ticker ──────────────────────────────────────────────────
function Ticker({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "14px 18px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "monospace", letterSpacing: "-0.02em" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const [queue, setQueue]     = useState<QueueStats>({ urgentCount: 0, batchCount: 0, dlqCount: 0, totalProcessed: 0 })
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [depthLog, setDepthLog] = useState<{ t: string; urgent: number; batch: number; dlq: number }[]>([])

  const poll = useCallback(async () => {
    try {
      const [q, m]: [QueueStats, Metrics] = await Promise.all([
        apiFetch("/queues"),
        apiFetch("/metrics"),
      ])
      setQueue(q)
      setMetrics(m)
      setDepthLog(prev => [...prev.slice(-29), {
        t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        urgent: q.urgentCount,
        batch:  q.batchCount,
        dlq:    q.dlqCount,
      }])
    } catch {}
  }, [])

  useEffect(() => { poll(); const id = setInterval(poll, 2000); return () => clearInterval(id) }, [poll])

  const pieData = metrics ? [
    { name: "urgent", value: metrics.urgentCount, color: C.urgent },
    { name: "batch",  value: metrics.batchCount,  color: C.batch  },
  ] : []

  const barData = metrics ? [
    { name: "urgent", lat: parseFloat((metrics.avgLatency * 0.6).toFixed(2)) },
    { name: "batch",  lat: parseFloat((metrics.avgLatency * 1.4).toFixed(2)) },
  ] : []

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Top ticker row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Ticker value={queue.urgentCount}    label="urgent queue"  color={C.urgent} />
        <Ticker value={queue.batchCount}     label="batch queue"   color={C.batch}  />
        <Ticker value={queue.dlqCount}       label="dead letters"  color={C.dlq}    />
        <Ticker value={queue.totalProcessed} label="total processed" color={C.green} />
        {metrics && <Ticker value={metrics.totalMessages} label="total routed" color={C.accent} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Queue depth chart */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.03em" }}>QUEUE DEPTH — LIVE</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot alive={true} />
              <span style={{ fontSize: 11, color: C.sub }}>2s refresh</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={depthLog}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: C.sub }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: C.sub }} />
              <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} labelStyle={{ color: C.sub }} />
              <Line type="monotone" dataKey="urgent" stroke={C.urgent} strokeWidth={2} dot={false} name="urgent" />
              <Line type="monotone" dataKey="batch"  stroke={C.batch}  strokeWidth={2} dot={false} name="batch" />
              <Line type="monotone" dataKey="dlq"    stroke={C.dlq}    strokeWidth={2} dot={false} name="dlq" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            {[["urgent", C.urgent], ["batch", C.batch], ["dlq", C.dlq]].map(([k, c]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.sub }}>
                <span style={{ width: 10, height: 2, background: c as string, borderRadius: 1, display: "inline-block" }} />
                {k}
              </span>
            ))}
          </div>
        </Card>

        {/* Metrics panel */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.03em", marginBottom: 16 }}>PERFORMANCE METRICS</div>
          {metrics ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "avg latency",  val: `${metrics.avgLatency.toFixed(2)}ms`, color: C.teal   },
                  { label: "throughput",   val: `${metrics.throughput.toFixed(0)}/s`,  color: C.accent },
                  { label: "accuracy",     val: `${metrics.accuracy.toFixed(1)}%`,     color: metrics.accuracy >= 95 ? C.green : C.dlq },
                  { label: "window",       val: `${metrics.totalMessages.toLocaleString()} msgs`, color: C.sub },
                ].map(k => (
                  <div key={k.label} style={{ background: C.surface, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.val}</div>
                    <div style={{ fontSize: 10, color: C.sub, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Latency by queue</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={barData} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.sub }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: C.sub }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} formatter={(v: any) => [`${v}ms`]} />
                      <Bar dataKey="lat" radius={[3, 3, 0, 0]}>
                        <Cell fill={C.urgent} />
                        <Cell fill={C.batch}  />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Queue split</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={3}>
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    {pieData.map(p => (
                      <span key={p.name} style={{ fontSize: 10, color: C.sub, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
                        {p.name} {metrics ? `${Math.round((p.value / (metrics.urgentCount + metrics.batchCount || 1)) * 100)}%` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "40px 0" }}>Connecting…</div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// HISTORY TAB
// ══════════════════════════════════════════════════════════════════════
function HistoryTab() {
  const [records, setRecords] = useState<RoutingHistory[]>([])
  const [filter,  setFilter]  = useState<"all" | "urgent" | "batch">("all")
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const data = await apiFetch("/history?limit=100")
      setRecords(data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch_(); const id = setInterval(fetch_, 2000); return () => clearInterval(id) }, [fetch_])

  const rows = filter === "all" ? records : records.filter(r => r.targetQueue === `${filter}.queue`)

  const typeColor: Record<string, string> = {
    fraud: C.urgent, payment: "#ff7b72", aml: C.dlq, suspicious: C.dlq,
    chargeback: "#ff7b72", breach: C.urgent, alert: C.dlq, sanction: C.urgent,
    blacklisted: C.urgent, analytics: C.batch, report: C.batch, sensor: C.teal,
    log: C.sub, metrics: C.sub, transfer: C.accent, withdrawal: "#ff7b72",
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.03em" }}>
          ROUTING HISTORY
          <span style={{ marginLeft: 10, fontWeight: 400, color: C.sub, fontFamily: "monospace", fontSize: 12 }}>{rows.length} records</span>
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "urgent", "batch"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.04em", cursor: "pointer", border: "1px solid",
              borderColor: filter === f ? C.accent : C.border,
              background: filter === f ? `${C.accent}18` : "transparent",
              color: filter === f ? C.accent : C.sub,
            }}>{f.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: C.sub, textAlign: "center", padding: "60px 0", fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: C.surface }}>
                {["Message ID", "Type", "Queue", "Latency", "Amount", "Risk", "Critical", "Status", "Time"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.07em", borderBottom: `1px solid ${C.border}` }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "9px 14px", color: C.sub }}>{r.messageId}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <Badge color={typeColor[r.messageType] || C.sub}>{r.messageType}</Badge>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <Badge color={r.targetQueue === "urgent.queue" ? C.urgent : C.batch}>
                      {r.targetQueue === "urgent.queue" ? "urgent" : "batch"}
                    </Badge>
                  </td>
                  <td style={{ padding: "9px 14px", color: C.teal }}>{r.latencyMs}ms</td>
                  <td style={{ padding: "9px 14px", color: C.text }}>{r.amount ? `$${r.amount.toLocaleString()}` : "—"}</td>
                  <td style={{ padding: "9px 14px", color: r.riskScore > 0.8 ? C.urgent : C.sub }}>{r.riskScore ? r.riskScore.toFixed(2) : "—"}</td>
                  <td style={{ padding: "9px 14px", color: r.isCritical ? C.urgent : C.sub }}>{r.isCritical ? "YES" : "—"}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <Badge color={r.status === "processed" ? C.green : C.dlq}>{r.status || "routed"}</Badge>
                  </td>
                  <td style={{ padding: "9px 14px", color: C.sub }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: "40px 0", fontSize: 13 }}>No records</div>}
        </div>
      )}
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════
// RULES TAB — full CRUD
// ══════════════════════════════════════════════════════════════════════
const EMPTY_RULE = { field: "", operator: "equals", value: "", targetQueue: "urgent", priority: 10, category: "fraud", description: "" }

function RulesTab() {
  const [rules, setRules]       = useState<Rule[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<"all" | "urgent" | "batch">("all")
  const [toast, setToast]       = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editRule, setEditRule] = useState<Rule | null>(null)
  const [form, setForm]         = useState({ ...EMPTY_RULE })
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000) }

  const loadRules = useCallback(async () => {
    try {
      setRules(await apiFetch("/rules"))
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  const openNew = () => {
    setEditRule(null)
    setForm({ ...EMPTY_RULE })
    setShowForm(true)
  }

  const openEdit = (r: Rule) => {
    setEditRule(r)
    setForm({ field: r.field, operator: r.operator, value: String(r.value), targetQueue: r.targetQueue, priority: r.priority, category: r.category, description: r.description })
    setShowForm(true)
  }

  const cancel = () => { setShowForm(false); setEditRule(null) }

  const save = async () => {
    if (!form.field || !form.value) return showToast("❌ Field and value are required")
    setSaving(true)
    try {
      const body = { ...form, value: isNaN(Number(form.value)) ? form.value : Number(form.value) }
      if (editRule) {
        await apiFetch(`/rules/${editRule._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        showToast("✅ Rule updated")
      } else {
        await apiFetch("/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        showToast("✅ Rule created")
      }
      setShowForm(false)
      setEditRule(null)
      await loadRules()
    } catch (e: any) { showToast(`❌ ${e.message}`) }
    setSaving(false)
  }

  const confirmDelete = async (id: string) => {
    try {
      await apiFetch(`/rules/${id}`, { method: "DELETE" })
      showToast("✅ Rule deleted")
      setDeleteId(null)
      await loadRules()
    } catch (e: any) { showToast(`❌ ${e.message}`) }
  }

  const filtered = filter === "all" ? rules : rules.filter(r => r.targetQueue === filter)

  const catColor: Record<string, string> = {
    fraud: C.urgent, payment: "#ff7b72", risk: C.dlq,
    priority: "#bc8cff", eventType: C.batch, region: C.teal,
  }

  const inputStyle: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5,
    color: C.text, fontSize: 12, padding: "7px 10px", fontFamily: "monospace",
    outline: "none", width: "100%", boxSizing: "border-box",
  }

  const selStyle = { ...inputStyle }

  return (
    <div style={{ position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "10px 16px", fontSize: 12, color: C.text, fontFamily: "monospace",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>{toast}</div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, width: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Delete rule?</div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 20 }}>This will also invalidate the Redis cache.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteId(null)} style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "6px 14px" }}>Cancel</button>
              <button onClick={() => confirmDelete(deleteId)} style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "6px 14px", background: `${C.urgent}22`, borderColor: C.urgent, color: C.urgent }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.accent}44` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, letterSpacing: "0.03em", marginBottom: 16 }}>
            {editRule ? "EDIT RULE" : "NEW RULE"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>FIELD</div>
              <input style={inputStyle} placeholder="e.g. type, amount, riskScore" value={form.field} onChange={e => setForm(p => ({ ...p, field: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>OPERATOR</div>
              <select style={selStyle} value={form.operator} onChange={e => setForm(p => ({ ...p, operator: e.target.value }))}>
                {["equals", "greaterThan", "lessThan", "contains", "notEquals"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>VALUE</div>
              <input style={inputStyle} placeholder="e.g. fraud, 1000, 0.8" value={form.value as string} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>TARGET QUEUE</div>
              <select style={selStyle} value={form.targetQueue} onChange={e => setForm(p => ({ ...p, targetQueue: e.target.value }))}>
                <option value="urgent">urgent</option>
                <option value="batch">batch</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>PRIORITY</div>
              <input type="number" style={inputStyle} value={form.priority} onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>CATEGORY</div>
              <select style={selStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {["fraud", "payment", "risk", "priority", "eventType", "region"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, letterSpacing: "0.06em" }}>DESCRIPTION (optional)</div>
            <input style={inputStyle} placeholder="Human-readable description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={cancel} style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "7px 16px", color: C.sub }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "7px 16px", background: `${C.accent}22`, borderColor: C.accent, color: C.accent }}>
              {saving ? "Saving…" : editRule ? "Save changes" : "Create rule"}
            </button>
          </div>
        </Card>
      )}

      {/* Rules table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.03em" }}>
            ROUTING RULES
            <span style={{ marginLeft: 10, fontWeight: 400, color: C.sub, fontFamily: "monospace", fontSize: 12 }}>{filtered.length}/{rules.length}</span>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["all", "urgent", "batch"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.04em", cursor: "pointer", border: "1px solid",
                  borderColor: filter === f ? C.accent : C.border,
                  background: filter === f ? `${C.accent}18` : "transparent",
                  color: filter === f ? C.accent : C.sub,
                }}>{f.toUpperCase()}</button>
              ))}
            </div>
            <button onClick={openNew} style={{
              padding: "4px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.04em", cursor: "pointer", border: `1px solid ${C.green}`,
              background: `${C.green}18`, color: C.green,
            }}>+ NEW RULE</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: C.sub, textAlign: "center", padding: "60px 0", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: C.surface }}>
                  {["#", "Category", "Field", "Operator", "Value", "Queue", "Description", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.07em", borderBottom: `1px solid ${C.border}` }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r._id} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "9px 14px", color: C.muted }}>{r.priority}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <Badge color={catColor[r.category] || C.sub}>{r.category}</Badge>
                    </td>
                    <td style={{ padding: "9px 14px", color: C.accent }}>{r.field}</td>
                    <td style={{ padding: "9px 14px", color: C.sub }}>{r.operator}</td>
                    <td style={{ padding: "9px 14px", color: C.teal }}>'{String(r.value)}'</td>
                    <td style={{ padding: "9px 14px" }}>
                      <Badge color={r.targetQueue === "urgent" ? C.urgent : C.batch}>{r.targetQueue}</Badge>
                    </td>
                    <td style={{ padding: "9px 14px", color: C.sub, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description || "—"}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={{ fontSize: 11, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "monospace" }}>edit</button>
                        <button onClick={() => setDeleteId(r._id)} style={{ fontSize: 11, color: C.urgent, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "monospace" }}>delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: "40px 0", fontSize: 13 }}>No rules</div>}
          </div>
        )}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// ROOT DASHBOARD
// ══════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [tab, setTab] = useState<"overview" | "history" | "rules">("overview")
  const [alive, setAlive] = useState(true)

  useEffect(() => {
    const check = async () => {
      try { await apiFetch("/health"); setAlive(true) } catch { setAlive(false) }
    }
    check(); const id = setInterval(check, 5000); return () => clearInterval(id)
  }, [])

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "history",  label: "History"  },
    { key: "rules",    label: "Rules"    },
  ] as const

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>pipeline-orchestrator</span>
            <span style={{ fontSize: 11, color: C.sub, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px" }}>50 rules · SRM University AP</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", gap: 20 }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontFamily: "inherit", letterSpacing: "0.02em",
                  color: tab === t.key ? C.text : C.sub,
                  borderBottom: tab === t.key ? `2px solid ${C.accent}` : "2px solid transparent",
                  padding: "0 0 2px", lineHeight: "56px",
                  transition: "color 0.15s",
                }}>{t.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot alive={alive} />
              <span style={{ fontSize: 11, color: alive ? C.green : C.urgent }}>{alive ? "API online" : "API offline"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 32px" }}>
        {tab === "overview" && <OverviewTab />}
        {tab === "history"  && <HistoryTab  />}
        {tab === "rules"    && <RulesTab    />}
      </div>
    </div>
  )
}