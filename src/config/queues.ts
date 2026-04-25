export const QUEUE_CONFIG = {
  urgent: {
    name: 'urgent.queue',
    options: {
      durable: true,
      arguments: {
        'x-max-priority':            10,
        'x-dead-letter-exchange':    '',                // ← empty string = default exchange
        'x-dead-letter-routing-key': 'dead.letter.queue',
      },
    },
  },
  batch: {
    name: 'batch.queue',
    options: {
      durable: true,
      arguments: {
        'x-max-priority':            1,
        'x-dead-letter-exchange':    '',                // ← empty string
        'x-dead-letter-routing-key': 'dead.letter.queue',
      },
    },
  },
  deadLetter: {
    name: 'dead.letter.queue',
    options: { durable: true },
  },
} as const