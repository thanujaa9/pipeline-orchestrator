export interface Rule {
  field: string
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan'
  value: string | number
  targetQueue: 'urgent' | 'batch'
  priority: number
}