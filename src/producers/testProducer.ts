import { Kafka } from 'kafkajs'
import { config } from '../config/index'

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: config.KAFKA_BROKERS,
})

const producer = kafka.producer()

async function sendTestMessage() {
  await producer.connect()
  console.log('Producer connected to Kafka')

  const message = {
    id: 'msg-001',
    timestamp: new Date().toISOString(),
    type: 'payment',
    priority: 'critical',
    amount: 75000,
    payload: { description: 'Test payment message' },
  }

  await producer.send({
    topic: config.KAFKA_TOPIC,
    messages: [{ value: JSON.stringify(message) }],
  })

  console.log('Message sent:', message)
  await producer.disconnect()
}

sendTestMessage().catch(console.error)