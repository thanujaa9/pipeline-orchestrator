import { createClient } from 'redis'
import { config } from '../config/index'

/**
 * Redis client instance used by the Rule Engine to cache
 * routing rules for sub-millisecond evaluation at high throughput.
 *
 * Stores a single key: 'routing_rules' containing the full
 * rules array serialised as JSON. Expires every RULES_CACHE_TTL
 * seconds and is refreshed automatically from MongoDB on expiry.
 */
export const redisClient = createClient({
  url: config.REDIS_URL,
})

/**
 * Establishes the Redis connection.
 * Must be called before any cache read or write operations.
 *
 * FIX: Checks isOpen before connecting — prevents 'Socket already
 * opened' error when multiple services call connectRedis() in the
 * same process (e.g. consumerManager starting both consumers).
 */
export async function connectRedis(): Promise<void> {
  try {
    // If already connected, skip — avoids 'Socket already opened' error
    if (redisClient.isOpen) {
      console.log('✅ Redis already connected')
      return
    }
    await redisClient.connect()
    console.log('✅ Redis connected successfully')
  } catch (error) {
    console.error('❌ Redis connection failed:', error)
    throw error
  }
}