import { DEBUG_CONFIG } from './config'

export type DebugChannel = keyof typeof DEBUG_CONFIG.CHANNELS

export type ChannelConfig = Partial<Record<DebugChannel, boolean>> | 'ALL'

interface LogEntry {
    id: number
    timestamp: number
    carouselId: string
    channel: DebugChannel
    message: string
    data?: unknown
}

export interface LoggerConfig {
    /** Override channel activation for this instance (or 'ALL' for everything) */
    channels?: ChannelConfig
    /** Max entries in local buffer (default: 100) */
    bufferSize?: number
}

// Color map for different channels to make traces readable
const CHANNEL_COLORS: Record<DebugChannel, string> = {
    ALL: '#ffffff',         // White (not typically logged directly)
    COORDINATOR: '#ff9800', // Orange
    LAYOUT: '#2196f3',      // Blue
    TELEPORT: '#e91e63',    // Pink
    VISUALS: '#9c27b0',     // Purple
    NAV: '#4caf50',         // Green
    INIT: '#f44336',        // Red
    CACHE: '#795548',       // Brown
    INTERACT: '#607d8b',    // Blue Grey
    PERF: '#ff5722',        // Deep Orange
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL REGISTRY - Shared across all logger instances
// ═══════════════════════════════════════════════════════════════════════════

class LoggerRegistry {
    private static instance: LoggerRegistry
    private globalHistory: LogEntry[] = []
    private counter: number = 0
    private maxGlobalHistory: number = 500

    private constructor() {
        if (typeof window !== 'undefined') {
            // Expose dump function to window for easy debugging
            // Usage: window.__DUMP_CAROUSEL_LOGS() or window.__DUMP_CAROUSEL_LOGS('hero')
            ; (window as any).__DUMP_CAROUSEL_LOGS = this.dump.bind(this)
        }
    }

    static getInstance(): LoggerRegistry {
        if (!LoggerRegistry.instance) {
            LoggerRegistry.instance = new LoggerRegistry()
        }
        return LoggerRegistry.instance
    }

    /** Get next unique ID for log entries */
    getNextId(): number {
        return ++this.counter
    }

    /** Add entry to global history */
    addToGlobal(entry: LogEntry): void {
        this.globalHistory.push(entry)
        if (this.globalHistory.length > this.maxGlobalHistory) {
            this.globalHistory.shift()
        }
    }

    /**
     * Dump history to console as a table.
     * @param filterId - Optional: filter to only show logs from a specific carousel ID
     */
    dump(filterId?: string): string {
        let entries = this.globalHistory
        if (filterId) {
            entries = entries.filter(e => e.carouselId === filterId)
        }

        if (entries.length === 0) {
            console.warn(`[CarouselLogger] No logs found${filterId ? ` for "${filterId}"` : ''}`)
            return 'No logs found'
        }

        console.group(`📸 Carousel Debug Snapshot${filterId ? ` [${filterId}]` : ' (all)'}`)
        console.table(
            entries.map(entry => ({
                Time: new Date(entry.timestamp).toISOString().split('T')[1],
                ID: entry.carouselId,
                Channel: entry.channel,
                Message: entry.message,
                Data: entry.data ? JSON.stringify(entry.data) : ''
            }))
        )
        console.groupEnd()
        return `Dumped ${entries.length} logs.`
    }

    /** Clear all global history */
    clear(): void {
        this.globalHistory = []
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGER INSTANCE - One per carousel
// ═══════════════════════════════════════════════════════════════════════════

export class CarouselLoggerInstance {
    readonly id: string
    private localHistory: LogEntry[] = []
    private maxLocalHistory: number
    private channelOverrides: ChannelConfig | undefined
    private registry: LoggerRegistry

    constructor(id: string, config?: LoggerConfig) {
        this.id = id
        this.maxLocalHistory = config?.bufferSize ?? 100
        this.channelOverrides = config?.channels
        this.registry = LoggerRegistry.getInstance()
    }

    /**
     * Check if a channel should log to console.
     * Resolution order: instance override → global config
     */
    private shouldLog(channel: DebugChannel): boolean {
        // Force enable if overrides are present for this instance
        const forceEnable = this.channelOverrides !== undefined

        if (!DEBUG_CONFIG.ENABLED && !forceEnable) return false

        // Instance override takes priority
        if (this.channelOverrides !== undefined) {
            if (this.channelOverrides === 'ALL') return true
            if (this.channelOverrides[channel] !== undefined) {
                return this.channelOverrides[channel]!
            }
        }

        // Fall back to global config
        if (DEBUG_CONFIG.CHANNELS.ALL) return true
        return DEBUG_CONFIG.CHANNELS[channel] ?? false
    }

    /**
     * Log a message to history buffers and optionally to console.
     */
    log(channel: DebugChannel, message: string, data?: unknown): void {
        const forceEnable = this.channelOverrides !== undefined
        if (!DEBUG_CONFIG.ENABLED && !forceEnable) return

        // 1. Create entry
        const entry: LogEntry = {
            id: this.registry.getNextId(),
            timestamp: Date.now(),
            carouselId: this.id,
            channel,
            message,
            data
        }

        // 2. Add to both local and global history (Dual Write)
        this.localHistory.push(entry)
        if (this.localHistory.length > this.maxLocalHistory) {
            this.localHistory.shift()
        }
        this.registry.addToGlobal(entry)

        // 3. Trace to console if channel is enabled
        // 🛡️ PRODUCTION SAFETY: Strictly block console output in production UNLESS explicitly overridden
        if (this.shouldLog(channel) && (process.env.NODE_ENV !== 'production' || forceEnable)) {
            const color = CHANNEL_COLORS[channel] || '#888'
            console.log(
                `%c[${this.id}]%c[${channel}]%c ${message}`,
                'color: #888; font-weight: bold',
                `color: ${color}; font-weight: bold`,
                'color: inherit',
                data ?? ''
            )
        }
    }

    /**
     * Dump this instance's local history to console.
     */
    dump(): string {
        if (this.localHistory.length === 0) {
            console.warn(`[CarouselLogger:${this.id}] Local buffer is empty`)
            return 'No logs found'
        }

        console.group(`📸 Carousel Debug Snapshot [${this.id}]`)
        console.table(
            this.localHistory.map(entry => ({
                Time: new Date(entry.timestamp).toISOString().split('T')[1],
                Channel: entry.channel,
                Message: entry.message,
                Data: entry.data ? JSON.stringify(entry.data) : ''
            }))
        )
        console.groupEnd()
        return `Dumped ${this.localHistory.length} logs.`
    }

    /** Clear local history */
    clear(): void {
        this.localHistory = []
    }

    /**
     * Create a performance timer for tracking elapsed time.
     * Usage: 
     *   const timer = logger.createTimer()
     *   // ... do work ...
     *   logger.log('INIT', 'Completed', { elapsedMs: timer.elapsed() })
     */
    createTimer(): { elapsed: () => number; reset: () => void } {
        let startTime = performance.now()
        return {
            elapsed: () => Math.round(performance.now() - startTime),
            reset: () => { startTime = performance.now() }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new logger instance for a carousel.
 * 
 * @param id - Unique identifier for this carousel (e.g., 'hero', 'related-products')
 * @param config - Optional configuration for channel overrides and buffer size
 * 
 * @example
 * ```tsx
 * // In BaseCarousel
 * const logger = createLogger(debugId, { channels: { NAV: true } })
 * 
 * // Pass to hooks
 * const navigation = useCarouselNavigation({ ..., logger })
 * ```
 */
export function createLogger(id: string, config?: LoggerConfig): CarouselLoggerInstance {
    return new CarouselLoggerInstance(id, config)
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARDS COMPATIBILITY - Default singleton export
// ═══════════════════════════════════════════════════════════════════════════

// Legacy singleton for existing code that doesn't pass debugId
export const carouselLogger = createLogger('default')
