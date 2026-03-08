import { Kafka } from 'kafkajs'
import { config } from '../config/index'

const kafka = new Kafka({
  clientId: 'test-consumer',
  brokers: config.KAFKA_BROKERS,
})

const consumer = kafka.consumer({ groupId: 'test-group' })

async function startConsumer() {
  await consumer.connect()
  console.log('Consumer connected to Kafka')

  await consumer.subscribe({ topic: config.KAFKA_TOPIC, fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString()
      if (value) {
        const parsed = JSON.parse(value)
        console.log('Message received:', parsed)
      }
    },
  })
}

startConsumer().catch(console.error)