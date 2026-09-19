import {
  createLogger,
  format,
  Logger as WinstonLogger,
  transports,
} from 'winston';
import { utilities as nestWinstonUtilities } from 'nest-winston';

const { combine, timestamp, label, json } = format;

const fileFormat = (context: string) =>
  combine(label({ label: context }), timestamp(), json());

const consoleFormat = (context: string) =>
  combine(
    timestamp(),
    nestWinstonUtilities.format.nestLike(context, {
      colors: true,
      prettyPrint: true,
    }),
  );

export const Logger = (context: string): WinstonLogger => {
  return createLogger({
    level: 'debug',
    transports: [
      new transports.File({
        filename: 'error.log',
        level: 'error',
        dirname: './logs',
        format: fileFormat(context),
      }),
      new transports.File({
        filename: 'combined.log',
        dirname: './logs',
        format: fileFormat(context),
      }),
      new transports.Console({
        format: consoleFormat(context),
      }),
    ],
  });
};
