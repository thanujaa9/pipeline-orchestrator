import { useState, useEffect, useCallback } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

// ── Types ──────────────────────────────────────────────────────
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

const COLORS = {
  urgent: "#EF4444",
  batch:  "#3B82F6",
  dlq:    "#F59E0B",
  teal:   "#0D9488",
  green:  "#10B981",
}

// ── Fetch helper ───────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ══════════════════════════════════════════════════════════════
// COMPONENT 1 — LIVE QUEUE DEPTH CHART
// ══════════════════════════════════════════════════════════════
function QueueDepthChart() {
  const [history, setHistory] = useState<{ time: string; urgent: number; batch: number; dlq: number }[]>([])
  const [current, setCurrent] = useState<QueueStats>({ urgentCount: 0, batchCount: 0, dlqCount: 0, totalProcessed: 0 })

  const fetchQueues = useCallback(async () => {
    try {
      const data: QueueStats = await apiFetch("/queues")
      setCurrent(data)
      const now = new Date().toLocaleTimeString()
      setHistory(prev => [...prev.slice(-19), {
        time:   now,
        urgent: data.urgentCount,
        batch:  data.batchCount,
        dlq:    data.dlqCount,
      }])
    } catch (e) {
      console.error("Queue fetch failed:", e)
    }
  }, [])

  useEffect(() => {
    fetchQueues()
    const interval = setInterval(fetchQueues, 2000)
    return () => clearInterval(interval)
  }, [fetchQueues])

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">📊 Live Queue Depth</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Refreshes every 2s</span>
      </div>

      {/* Current counts */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "urgent.queue",       value: current.urgentCount,    color: "red"    },
          { label: "batch.queue",        value: current.batchCount,     color: "blue"   },
          { label: "dead.letter.queue",  value: current.dlqCount,       color: "yellow" },
        ].map(q => (
          <div key={q.label} className={`rounded-lg p-3 text-center bg-${q.color}-50 border border-${q.color}-200`}>
            <div className={`text-2xl font-bold text-${q.color}-600`}>{q.value.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{q.label}</div>
          </div>
        ))}
      </div>

      {/* Line chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="urgent" stroke={COLORS.urgent} strokeWidth={2} dot={false} name="urgent" />
          <Line type="monotone" dataKey="batch"  stroke={COLORS.batch}  strokeWidth={2} dot={false} name="batch" />
          <Line type="monotone" dataKey="dlq"    stroke={COLORS.dlq}    strokeWidth={2} dot={false} name="dlq" />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 text-sm text-gray-500 text-center">
        Total processed: <span className="font-bold text-gray-700">{current.totalProcessed.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENT 2 — ROUTING HISTORY TABLE
// ══════════════════════════════════════════════════════════════
function RoutingHistoryTable() {
  const [records, setRecords]   = useState<RoutingHistory[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter,  setFilter]    = useState<"all" | "urgent" | "batch">("all")

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch("/history?limit=50")
      setRecords(data)
    } catch (e) {
      console.error("History fetch failed:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
    const interval = setInterval(fetchHistory, 2000)
    return () => clearInterval(interval)
  }, [fetchHistory])

  const filtered = filter === "all" ? records
    : records.filter(r => r.targetQueue === `${filter}.queue`)

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">📋 Routing History</h2>
        <div className="flex gap-2">
          {(["all", "urgent", "batch"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium ${filter === f ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading...</div>
      ) : (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-left p-2">Message ID</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Queue</th>
                <th className="text-left p-2">Latency</th>
                <th className="text-left p-2">Critical</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs text-gray-500">{r.messageId}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.messageType}</span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.targetQueue === "urgent.queue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {r.targetQueue === "urgent.queue" ? "🔴 urgent" : "🔵 batch"}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{r.latencyMs}ms</td>
                  <td className="p-2 text-xs">{r.isCritical ? "✅" : "—"}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === "processed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.status || "routed"}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-gray-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center text-gray-400 py-4">No records found</div>}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENT 3 — RULES MANAGER
// ══════════════════════════════════════════════════════════════
function RulesManager() {
  const [rules, setRules]     = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<"all" | "urgent" | "batch">("all")
  const [msg, setMsg]         = useState("")

  const fetchRules = useCallback(async () => {
    try {
      const data = await apiFetch("/rules")
      setRules(data)
    } catch (e) {
      console.error("Rules fetch failed:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const deleteRule = async (id: string) => {
    try {
      await apiFetch(`/rules/${id}`, { method: "DELETE" })
      setMsg("✅ Rule deleted")
      fetchRules()
      setTimeout(() => setMsg(""), 2000)
    } catch {
      setMsg("❌ Delete failed")
    }
  }

  const filtered = filter === "all" ? rules : rules.filter(r => r.targetQueue === filter)

  const categoryColors: Record<string, string> = {
    fraud:     "bg-red-100 text-red-700",
    payment:   "bg-orange-100 text-orange-700",
    risk:      "bg-yellow-100 text-yellow-700",
    priority:  "bg-purple-100 text-purple-700",
    eventType: "bg-blue-100 text-blue-700",
    region:    "bg-green-100 text-green-700",
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">⚙️ Rules Manager ({rules.length} rules)</h2>
        <div className="flex gap-2">
          {(["all", "urgent", "batch"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium ${filter === f ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="mb-3 text-sm text-center text-teal-600 font-medium">{msg}</div>}

      {loading ? <div className="text-center text-gray-400 py-8">Loading...</div> : (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">Rule</th>
                <th className="text-left p-2">Queue</th>
                <th className="text-left p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._id} className="border-t hover:bg-gray-50">
                  <td className="p-2 text-xs text-gray-400">{r.priority}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[r.category] || "bg-gray-100 text-gray-600"}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="p-2 text-xs">
                    <span className="font-mono">{r.field}</span>
                    <span className="text-gray-400 mx-1">{r.operator}</span>
                    <span className="font-mono text-teal-600">'{r.value}'</span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.targetQueue === "urgent" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {r.targetQueue}
                    </span>
                  </td>
                  <td className="p-2">
                    <button onClick={() => deleteRule(r._id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// COMPONENT 4 — LATENCY METRICS CHART
// ══════════════════════════════════════════════════════════════
function LatencyMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [chartData, setChartData] = useState<any[]>([])

  const fetchMetrics = useCallback(async () => {
    try {
      const data: Metrics = await apiFetch("/metrics")
      setMetrics(data)
      setChartData([
        { name: "urgent", latency: data.avgLatency * 0.6,  count: data.urgentCount },
        { name: "batch",  latency: data.avgLatency * 1.4,  count: data.batchCount  },
      ])
    } catch (e) {
      console.error("Metrics fetch failed:", e)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 2000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const pieData = metrics ? [
    { name: "urgent", value: metrics.urgentCount, color: COLORS.urgent },
    { name: "batch",  value: metrics.batchCount,  color: COLORS.batch  },
  ] : []

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">⚡ Latency & Metrics</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Live</span>
      </div>

      {metrics ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { label: "Avg Latency",  value: `${metrics.avgLatency.toFixed(2)}ms`, color: "teal"   },
              { label: "Throughput",   value: `${metrics.throughput.toFixed(0)}/s`, color: "blue"   },
              { label: "Accuracy",     value: `${metrics.accuracy.toFixed(1)}%`,    color: "green"  },
              { label: "Total Msgs",   value: metrics.totalMessages.toLocaleString(), color: "purple"},
            ].map(k => (
              <div key={k.label} className={`rounded-lg p-3 bg-${k.color}-50 border border-${k.color}-200`}>
                <div className={`text-xl font-bold text-${k.color}-700`}>{k.value}</div>
                <div className="text-xs text-gray-500 mt-1">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v.toFixed(2)}ms`, "Avg Latency"]} />
                <Bar dataKey="latency" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Pie chart */}
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="text-center text-gray-400 py-12">Loading metrics...</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [tab, setTab] = useState<"overview" | "history" | "rules">("overview")

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🚀 Pipeline Orchestrator Dashboard</h1>
          <p className="text-gray-400 text-sm">Real-Time Content-Based Message Routing  ·  50 Rules  ·  SRM University AP</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span className="text-sm text-green-400">Live</span>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-6">
          {([
            { key: "overview", label: "📊 Overview"  },
            { key: "history",  label: "📋 History"   },
            { key: "rules",    label: "⚙️  Rules"    },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-teal-600 text-teal-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {tab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <QueueDepthChart />
            <LatencyMetrics />
          </div>
        )}
        {tab === "history" && <RoutingHistoryTable />}
        {tab === "rules"   && <RulesManager />}
      </div>
    </div>
  )
}