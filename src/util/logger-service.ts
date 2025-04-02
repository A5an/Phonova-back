import winston from 'winston'
const { combine, errors, colorize, timestamp, printf } = winston.format;

export const loggerparent = winston.createLogger({
    exitOnError: false,
    transports: [new winston.transports.Console({
        level: "debug",
        handleExceptions: true,
        //@ts-ignore
        humanReadableUnhandledException:true,
        json: false,
        defaultMeta: {
            defaultService: 'socket-service',
        },
        format: combine(
            colorize({all: true}),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            printf(({ message, timestamp, level, ...meta }) => {
               return `${timestamp} (${meta.service}) [${level}] - ${message}`;
            }),
            errors({ stack: true })
         ),
    })]
})