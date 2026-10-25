/**
 * Winston logger — used across core and modules.
 */

import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ticket-bot' },
  // node --test sets NODE_TEST_CONTEXT in test processes; keep test output readable.
  silent: Boolean(process.env.NODE_TEST_CONTEXT),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
