const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => {
        // Always display in IST (UTC+5:30) with 12-hour AM/PM format regardless of server timezone
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        const year = ist.getUTCFullYear();
        const month = pad(ist.getUTCMonth() + 1);
        const day = pad(ist.getUTCDate());
        const rawHours = ist.getUTCHours();
        const ampm = rawHours >= 12 ? 'PM' : 'AM';
        const hours12 = pad(rawHours % 12 || 12);
        const minutes = pad(ist.getUTCMinutes());
        const seconds = pad(ist.getUTCSeconds());
        return `${year}-${month}-${day} ${hours12}:${minutes}:${seconds} ${ampm} IST`;
      }
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pulse-chat' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({
      filename: 'pulse-activity.log',
      level: 'info',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
      tailable: true
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;
