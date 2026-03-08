import { Kafka } from 'kafkajs'
import { config } from '../config/index'

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: config.KAFKA_BROKERS,
})

const producer = kafka.producer()

async function sendTestMessages() {
  await producer.connect()
  console.log('Producer connected to Kafka')

  // 5 test messages from technical specification
  const messages = [
    { id: 'msg-001', type: 'payment',  priority: 'critical', amount: 75000, riskScore: 0.5, payload: {} },
    { id: 'msg-002', type: 'analytics',priority: 'low',      amount: 0,     riskScore: 0.1, payload: {} },
    { id: 'msg-003', type: 'payment',  priority: 'high',     amount: 500,   riskScore: 0.2, payload: {} },
    { id: 'msg-004', type: 'payment',  priority: 'critical', amount: 15000, riskScore: 0.4, payload: {} },
    { id: 'msg-005', type: 'report',   priority: 'low',      amount: 0,     riskScore: 0.95,payload: {} },
  ]

  for (const msg of messages) {
    await producer.send({
      topic: config.KAFKA_TOPIC,
      messages: [{ value: JSON.stringify({ ...msg, timestamp: new Date().toISOString() }) }],
    })
    console.log(`✅ Sent ${msg.id} — type: ${msg.type}, priority: ${msg.priority}`)
  }

  await producer.disconnect()
  console.log('All 5 messages sent!')
}

sendTestMessages().catch(console.error)