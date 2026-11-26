const mongoose = require('mongoose');
const logger = require('./logger');

const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60000;

let retryAttempt = 0;
let retryTimer = null;
let inFlightConnect = null;
let onConnectedCallback = null;

/**
 * Computes bounded exponential backoff with ±20% jitter.
 */
const computeBackoffDelayMs = (attempt) => {
  const exponential = Math.min(BASE_RETRY_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(exponential * jitterFactor);
};

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const scheduleInitialRetry = () => {
  if (retryTimer || inFlightConnect || mongoose.connection.readyState === 1) {
    return;
  }
  const delayMs = computeBackoffDelayMs(retryAttempt);
  const currentAttempt = retryAttempt + 1;
  retryAttempt += 1;

  logger.warn(`Scheduling MongoDB initial connection retry #${currentAttempt} in ${delayMs}ms...`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectDB({ onConnected: onConnectedCallback });
  }, delayMs);
  if (typeof retryTimer.unref === 'function') {
    retryTimer.unref();
  }
};

const connectDB = async ({ onConnected } = {}) => {
  if (typeof onConnected === 'function') {
    onConnectedCallback = onConnected;
  }

  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    logger.error('-------------------------------------------------------------------');
    logger.error('FATAL ERROR: MONGODB_URI environment variable is not set.');
    logger.error('The application cannot start without a database connection string.');
    logger.error('Please add the MONGODB_URI to your environment variables in the Azure App Service configuration.');
    logger.error('The server will start, but will not be functional until this is resolved.');
    logger.error('-------------------------------------------------------------------');
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    retryAttempt = 0;
    clearRetryTimer();
    return true;
  }

  if (inFlightConnect) {
    return inFlightConnect;
  }

  clearRetryTimer();

  let connected = false;
  let attemptPromise;
  attemptPromise = (async () => {
    try {
      await mongoose.connect(mongoURI);
      connected = true;
      retryAttempt = 0;
      clearRetryTimer();
      logger.info('MongoDB connected successfully.');
      if (typeof onConnectedCallback === 'function') {
        try {
          await onConnectedCallback();
        } catch (cbErr) {
          logger.error('Post-connect initialization callback failed:', cbErr);
        }
      }
      return true;
    } catch (error) {
      logger.error('-------------------------------------------------------------------');
      logger.error('FATAL ERROR: MongoDB connection failed.');
      logger.error('The MONGODB_URI might be incorrect or the database might be down.');
      logger.error('Error details:', { message: error.message });
      logger.error('The server will stay alive and retry with exponential backoff.');
      logger.error('-------------------------------------------------------------------');
      return false;
    } finally {
      if (inFlightConnect === attemptPromise) {
        inFlightConnect = null;
      }
      if (!connected && mongoose.connection.readyState !== 1) {
        scheduleInitialRetry();
      }
    }
  })();

  inFlightConnect = attemptPromise;
  return inFlightConnect;
};

const resetDBRetryState = () => {
  clearRetryTimer();
  retryAttempt = 0;
  inFlightConnect = null;
  onConnectedCallback = null;
};

mongoose.connection.on('connected', () => {
  retryAttempt = 0;
  clearRetryTimer();
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Waiting for reconnection...');
});

mongoose.connection.on('reconnected', () => {
  retryAttempt = 0;
  clearRetryTimer();
  logger.info('MongoDB reconnected successfully.');
});

module.exports = connectDB;
module.exports.computeBackoffDelayMs = computeBackoffDelayMs;
module.exports.resetDBRetryState = resetDBRetryState;
