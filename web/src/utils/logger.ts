type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isDev = import.meta.env.DEV

function format(level: LogLevel, tag: string, ...args: unknown[]): string {
  const ts = new Date().toISOString().slice(11, 23)
  return `[${ts}] [${level.toUpperCase()}] [${tag}]`
}

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (isDev) console.debug(format('debug', tag), ...args)
  },
  info: (tag: string, ...args: unknown[]) => {
    if (isDev) console.info(format('info', tag), ...args)
  },
  warn: (tag: string, ...args: unknown[]) => {
    console.warn(format('warn', tag), ...args)
  },
  error: (tag: string, ...args: unknown[]) => {
    console.error(format('error', tag), ...args)
  },
}

export default logger
