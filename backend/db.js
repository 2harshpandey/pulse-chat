const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    logger.error('-------------------------------------------------------------------');
    logger.error('FATAL ERROR: MONGODB_URI environment variable is not set.');
    logger.error('The application cannot start without a database connection string.');
    logger.error('Please add the MONGODB_URI to your environment variables in the Azure App Service configuration.');
    logger.error('The server will start, but will not be functional until this is resolved.');
    logger.error('-------------------------------------------------------------------');
    return; // Return without connecting, but DO NOT exit the process.
  }

  try {
    await mongoose.connect(mongoURI);
    logger.info('MongoDB connected successfully.');
  } catch (error) {
    logger.error('-------------------------------------------------------------------');
    logger.error('FATAL ERROR: MongoDB connection failed.');
    logger.error('The MONGODB_URI might be incorrect or the database might be down.');
    logger.error('Error details:', { message: error.message });
    logger.error('The server will start, but will not be functional until this is resolved.');
    logger.error('-------------------------------------------------------------------');
    // DO NOT exit the process. Let the server run in a broken state for diagnostics.
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Waiting for reconnection...');
});
mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully.');
});

module.exports = connectDB;
