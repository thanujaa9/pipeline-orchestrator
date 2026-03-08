export const config = {
  KAFKA_BROKERS: ['localhost:9092'],
  KAFKA_TOPIC: 'events',
  KAFKA_GROUP_ID: 'orchestrator-group',
  RABBITMQ_URL: 'amqp://admin:password@localhost:5672',
  MONGO_URI: 'mongodb://localhost:27017/orchestrator',
  REDIS_URL: 'redis://localhost:6379',
  API_PORT: 3001,
  RULES_CACHE_TTL: 3600,
  MAX_RETRY_ATTEMPTS: 5,
}