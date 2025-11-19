import { ns } from '#cth/module/lib/config';

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error' | 'none';

/**
 * Simple logger with prefix and level control.
 * Usage:
 *   import { logger as logger } from './lib/logger.js';
 *   logger.setPrefix('[pf1-ke]');
 *   logger.log('Hello (log)');
 *   logger.info('Hello (info)');
 *   const sub = logger.child('Actor');
 *   sub.debug('Loaded', actor.id);
 */
export class Logger {
    _prefix: string;
    _enabled: boolean;
    _levels: Record<LogLevel, number> = { debug: 10, log: 15, info: 20, warn: 30, error: 40, none: 1000 };
    _level: LogLevel;

    constructor({ prefix = '', level = 'info', enabled = true }: { prefix?: string; level?: LogLevel; enabled?: boolean } = {}) {
        this._prefix = prefix || `[${ns}]`;
        this._enabled = enabled;
        this._level = level;
    }

    setPrefix(prefix: string) {
        this._prefix = prefix || '';
        return this;
    }

    get prefix() {
        return this._prefix;
    }

    setLevel(level: LogLevel) {
        if (this._levels[level] === undefined) return this;
        this._level = level;
        return this;
    }

    get level(): LogLevel {
        return this._level;
    }

    enable() {
        this._enabled = true;
        return this;
    }

    disable() {
        this._enabled = false;
        return this;
    }

    child(suffix: string) {
        const join = this._prefix && suffix ? `${this._prefix}:${suffix}` : suffix || this._prefix;
        return new Logger({ prefix: join, level: this._level, enabled: this._enabled });
    }

    _shouldLog(level: LogLevel) {
        return this._enabled && this._levels[level] >= this._levels[this._level];
    }

    _fmt(args: any[]) {
        if (!this._prefix) return args;
        // Prepend a consistent prefix token; colorize a bit in consoles that support %c
        const prefixToken = this._prefix;
        return [`${prefixToken}`, ...args];
    }

    debug(...args: any[]) {
        if (!this._shouldLog('debug')) return;
        console.debug(...this._fmt(args));
    }

    log(...args: any[]) {
        if (!this._shouldLog('log')) return;
        console.log(...this._fmt(args));
    }

    info(...args: any[]) {
        if (!this._shouldLog('info')) return;
        console.info(...this._fmt(args));
    }

    warn(...args: any[]) {
        if (!this._shouldLog('warn')) return;
        console.warn(...this._fmt(args));
    }

    error(...args: any[]) {
        if (!this._shouldLog('error')) return;
        console.error(...this._fmt(args));
    }
}

export const modLogger = new Logger({ prefix: `${ns} |`, level: 'log', enabled: true });
