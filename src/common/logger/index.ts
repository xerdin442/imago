import { createLogger, format, Logger, transports } from 'winston';
import { Secrets } from '../secrets';

const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, timestamp, label }) => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${timestamp} ${label} ${level} ${message}`;
});

const newLogger = (env: string): Logger => {
  return createLogger({
    level: 'debug',
    format: combine(
      format.colorize(),
      label({ label: env }),
      timestamp(),
      myFormat,
    ),
    transports: [
      new transports.File({
        filename: 'error.log',
        level: 'error',
        dirname: './logs',
      }),
      new transports.File({ filename: 'combined.log', dirname: './logs' }),
      new transports.Console(),
    ],
  });
};

let logger: Logger = newLogger('DEFAULT');
switch (Secrets.NODE_ENV) {
  case 'production':
    logger = newLogger('PROD');
    break;
  case 'development':
    logger = newLogger('DEV');
    break;
  case 'test':
    logger = newLogger('TEST');
    break;

  default:
    break;
}

export default logger;
