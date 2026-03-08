export interface Message {
  id: string
  timestamp: string
  type: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  amount?: number
  riskScore?: number
  kafkaTimestamp?: number
  payload: Record<string, any>
}