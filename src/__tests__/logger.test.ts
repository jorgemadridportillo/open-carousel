import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the config BEFORE importing the logger
vi.mock('../config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../config')>()
    return {
        ...actual,
        DEBUG_CONFIG: {
            ...actual.DEBUG_CONFIG,
            ENABLED: true, // Force enabled for tests
            CHANNELS: {
                ALL: false,
                COORDINATOR: false,
                LAYOUT: false,
                TELEPORT: false,
                VISUALS: false,
                NAV: true, // Enable NAV channel for testing
                INIT: false,
                CACHE: false,
                INTERACT: false,
            }
        }
    }
})

import { createLogger, CarouselLoggerInstance } from '../logger'

describe('carousel.logger', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('createLogger factory', () => {
        it('creates a logger instance with the given id', () => {
            const logger = createLogger('hero')
            expect(logger).toBeInstanceOf(CarouselLoggerInstance)
            expect(logger.id).toBe('hero')
        })

        it('creates distinct instances for different ids', () => {
            const logger1 = createLogger('hero')
            const logger2 = createLogger('related')
            expect(logger1).not.toBe(logger2)
            expect(logger1.id).toBe('hero')
            expect(logger2.id).toBe('related')
        })

        it('accepts custom buffer size config', () => {
            const logger = createLogger('test', { bufferSize: 50 })
            expect(logger.id).toBe('test')
        })
    })

    describe('logging behavior', () => {
        it('stores logs in local history buffer when channel is enabled', () => {
            const logger = createLogger('test-store')

            // NAV channel is enabled in our mock
            logger.log('NAV', 'Arrow click')
            logger.log('NAV', 'Forward')

            const result = logger.dump()
            expect(result).toContain('2 logs')
        })

        it('stores logs when using channel override', () => {
            const logger = createLogger('test-override', {
                channels: { TELEPORT: true }
            })

            logger.log('TELEPORT', 'Teleport forward')

            const result = logger.dump()
            expect(result).toContain('1 logs')
        })

        it('stores all logs when channels is ALL', () => {
            const logger = createLogger('test-all', {
                channels: 'ALL'
            })

            logger.log('NAV', 'Nav log')
            logger.log('TELEPORT', 'Teleport log')
            logger.log('INIT', 'Init log')

            const result = logger.dump()
            expect(result).toContain('3 logs')
        })

        it('respects buffer size limit', () => {
            const logger = createLogger('test-buffer', {
                bufferSize: 3,
                channels: 'ALL'
            })

            // Log more than buffer size
            logger.log('NAV', 'Message 1')
            logger.log('NAV', 'Message 2')
            logger.log('NAV', 'Message 3')
            logger.log('NAV', 'Message 4')
            logger.log('NAV', 'Message 5')

            // Should only keep last 3
            const result = logger.dump()
            expect(result).toContain('3 logs')
        })

        it('clears local history on clear()', () => {
            const logger = createLogger('test-clear', { channels: 'ALL' })
            logger.log('NAV', 'Will be cleared')
            logger.clear()

            const result = logger.dump()
            expect(result).toBe('No logs found')
        })
    })

    describe('timer utility', () => {
        it('createTimer returns timer with elapsed() and reset()', () => {
            const logger = createLogger('test-timer')
            const timer = logger.createTimer()

            expect(typeof timer.elapsed).toBe('function')
            expect(typeof timer.reset).toBe('function')
            expect(typeof timer.elapsed()).toBe('number')
            expect(timer.elapsed()).toBeGreaterThanOrEqual(0)
        })

        it('timer.reset() restarts the timer', () => {
            const logger = createLogger('test-timer-reset')
            const timer = logger.createTimer()

            // Wait a tiny bit then reset
            timer.reset()
            const afterReset = timer.elapsed()

            // After reset, elapsed should be very small
            expect(afterReset).toBeLessThanOrEqual(5)
        })
    })

    describe('channel configuration', () => {
        it('accepts partial channel overrides', () => {
            const logger = createLogger('test-channels', {
                channels: { NAV: true, TELEPORT: false }
            })
            expect(logger.id).toBe('test-channels')
        })

        it('accepts ALL wildcard for channels', () => {
            const logger = createLogger('test-all', {
                channels: 'ALL'
            })
            expect(logger.id).toBe('test-all')
        })

        it('accepts undefined channels (uses global config)', () => {
            const logger = createLogger('test-default', {})
            expect(logger.id).toBe('test-default')
        })
    })
})
