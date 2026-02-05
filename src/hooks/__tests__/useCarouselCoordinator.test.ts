import { describe, it, expect } from 'vitest'
import { reduce, type CarouselContext, type CarouselAction } from '../useCarouselCoordinator'
import { TIMING_CONFIG } from '../../config'
import type { CarouselLoggerInstance } from '../../logger'

/**
 * Unit tests for the carousel coordinator reducer.
 * Tests pure state transitions without React hook machinery.
 */

// Helper to create a base context for testing
const createTestContext = (overrides: Partial<CarouselContext> = {}): CarouselContext => ({
    phase: 'IDLE',
    pendingTarget: null,
    scrollDirection: null,
    teleportOffset: null,
    isTeleporting: false,
    isPreTeleporting: false,
    lastActiveItemKey: null,
    snapTimeoutId: null,
    scrollIdleTimeoutId: null,
    bounceTimeoutId: null,
    hasScrollEndListener: false,
    ...overrides,
})

describe('useCarouselCoordinator reducer', () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZE
    // ═══════════════════════════════════════════════════════════════════════════
    describe('INITIALIZE', () => {
        it('transitions from UNINITIALIZED to IDLE', () => {
            const context = createTestContext({ phase: 'UNINITIALIZED' })
            const action: CarouselAction = { type: 'INITIALIZE' }

            const next = reduce(context, action)

            expect(next.phase).toBe('IDLE')
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // ARROW_CLICK
    // ═══════════════════════════════════════════════════════════════════════════
    describe('ARROW_CLICK', () => {
        it('IDLE → SCROLLING: sets pendingTarget and scrollDirection', () => {
            const context = createTestContext({ phase: 'IDLE' })
            const action: CarouselAction = { type: 'ARROW_CLICK', direction: 1, targetScroll: 500 }

            const next = reduce(context, action)

            expect(next.phase).toBe('SCROLLING')
            expect(next.pendingTarget).toBe(500)
            expect(next.scrollDirection).toBe(1)
        })

        it('SCROLLING → SCROLLING: updates target for rapid clicks', () => {
            const context = createTestContext({
                phase: 'SCROLLING',
                pendingTarget: 500,
                scrollDirection: 1,
            })
            const action: CarouselAction = { type: 'ARROW_CLICK', direction: 1, targetScroll: 750 }

            const next = reduce(context, action)

            expect(next.phase).toBe('SCROLLING')
            expect(next.pendingTarget).toBe(750)
            expect(next.scrollDirection).toBe(1)
        })

        it('blocks ARROW_CLICK when in PRE_TELEPORTING phase', () => {
            const context = createTestContext({
                phase: 'PRE_TELEPORTING',
                pendingTarget: 500,
            })
            const action: CarouselAction = { type: 'ARROW_CLICK', direction: 1, targetScroll: 750 }

            const next = reduce(context, action)

            // Should be blocked - state unchanged
            expect(next.phase).toBe('PRE_TELEPORTING')
            expect(next.pendingTarget).toBe(500) // Still old value
        })

        it('blocks ARROW_CLICK when in BOUNCING phase', () => {
            const context = createTestContext({ phase: 'BOUNCING' })
            const action: CarouselAction = { type: 'ARROW_CLICK', direction: 1, targetScroll: 500 }

            const next = reduce(context, action)

            expect(next.phase).toBe('BOUNCING')
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // SCROLL_COMPLETE
    // ═══════════════════════════════════════════════════════════════════════════
    describe('SCROLL_COMPLETE', () => {
        it('SCROLLING → IDLE: clears pendingTarget', () => {
            const context = createTestContext({
                phase: 'SCROLLING',
                pendingTarget: 500,
                scrollDirection: 1,
            })
            const action: CarouselAction = { type: 'SCROLL_COMPLETE' }

            const next = reduce(context, action)

            expect(next.phase).toBe('IDLE')
            expect(next.pendingTarget).toBeNull()
            expect(next.scrollDirection).toBeNull()
        })

        it('ignored when not in SCROLLING phase', () => {
            const context = createTestContext({ phase: 'IDLE' })
            const action: CarouselAction = { type: 'SCROLL_COMPLETE' }

            const next = reduce(context, action)

            expect(next.phase).toBe('IDLE')
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // USER_INTERRUPT
    // ═══════════════════════════════════════════════════════════════════════════
    describe('USER_INTERRUPT', () => {
        it('SCROLLING → IDLE: clears scroll state when user takes control', () => {
            const context = createTestContext({
                phase: 'SCROLLING',
                pendingTarget: 500,
                scrollDirection: 1,
            })
            const action: CarouselAction = { type: 'USER_INTERRUPT' }

            const next = reduce(context, action)

            expect(next.phase).toBe('IDLE')
            expect(next.pendingTarget).toBeNull()
            expect(next.scrollDirection).toBeNull()
        })

        it('no-op when already IDLE', () => {
            const context = createTestContext({ phase: 'IDLE' })
            const action: CarouselAction = { type: 'USER_INTERRUPT' }

            const next = reduce(context, action)

            expect(next.phase).toBe('IDLE')
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // BOUNCE SEQUENCE
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Bounce sequence', () => {
        it('IDLE → BOUNCING → IDLE: complete bounce cycle', () => {
            // Start bounce
            const context1 = createTestContext({ phase: 'IDLE' })
            const timeoutId = setTimeout(() => { }, 0)
            const action1: CarouselAction = { type: 'START_BOUNCE', timeoutId }

            const next1 = reduce(context1, action1)
            expect(next1.phase).toBe('BOUNCING')
            expect(next1.bounceTimeoutId).toBe(timeoutId)

            // End bounce
            const action2: CarouselAction = { type: 'END_BOUNCE' }
            const next2 = reduce(next1, action2)

            expect(next2.phase).toBe('IDLE')
            expect(next2.bounceTimeoutId).toBeNull()

            clearTimeout(timeoutId)
        })

        it('blocks START_BOUNCE when not IDLE', () => {
            const context = createTestContext({ phase: 'SCROLLING' })
            const timeoutId = setTimeout(() => { }, 0)
            const action: CarouselAction = { type: 'START_BOUNCE', timeoutId }

            const next = reduce(context, action)

            expect(next.phase).toBe('SCROLLING')

            clearTimeout(timeoutId)
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-TELEPORT SEQUENCE (Bug fix test cases)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Pre-teleport sequence', () => {
        it('SCROLLING → PRE_TELEPORTING via START_PRE_TELEPORT', () => {
            const context = createTestContext({
                phase: 'SCROLLING',
                pendingTarget: 15000,
            })
            const action: CarouselAction = { type: 'START_PRE_TELEPORT' }

            const next = reduce(context, action)

            expect(next.phase).toBe('PRE_TELEPORTING')
        })

        it('SET_PENDING_TARGET updates target unconditionally (even in PRE_TELEPORTING)', () => {
            // This is the critical fix for the "stuck carousel" bug
            const context = createTestContext({
                phase: 'PRE_TELEPORTING',
                pendingTarget: 15000, // Old target before teleport
            })
            const action: CarouselAction = { type: 'SET_PENDING_TARGET', target: 7672 }

            const next = reduce(context, action)

            // Target should be updated even though we're in PRE_TELEPORTING
            expect(next.pendingTarget).toBe(7672)
            expect(next.phase).toBe('PRE_TELEPORTING') // Phase unchanged
        })

        it('SET_PRE_TELEPORTING=false transitions to SCROLLING when pendingTarget exists', () => {
            // This is the critical fix - phase must return to SCROLLING, not stay stuck
            const context = createTestContext({
                phase: 'PRE_TELEPORTING',
                pendingTarget: 7672,
                isPreTeleporting: true,
            })
            const action: CarouselAction = { type: 'SET_PRE_TELEPORTING', value: false }

            const next = reduce(context, action)

            expect(next.isPreTeleporting).toBe(false)
            expect(next.phase).toBe('SCROLLING') // Critical: must return to SCROLLING
        })

        it('SET_PRE_TELEPORTING=false transitions to IDLE when no pendingTarget', () => {
            const context = createTestContext({
                phase: 'PRE_TELEPORTING',
                pendingTarget: null, // No pending scroll
                isPreTeleporting: true,
            })
            const action: CarouselAction = { type: 'SET_PRE_TELEPORTING', value: false }

            const next = reduce(context, action)

            expect(next.isPreTeleporting).toBe(false)
            expect(next.phase).toBe('IDLE')
        })

        it('complete pre-teleport flow: SCROLLING → PRE_TELEPORTING → SCROLLING', () => {
            // Step 1: Arrow click starts scroll
            let context = createTestContext({ phase: 'IDLE' })
            context = reduce(context, { type: 'ARROW_CLICK', direction: 1, targetScroll: 15000 })
            expect(context.phase).toBe('SCROLLING')
            expect(context.pendingTarget).toBe(15000)

            // Step 2: Pre-teleport starts (near boundary)
            context = reduce(context, { type: 'START_PRE_TELEPORT' })
            expect(context.phase).toBe('PRE_TELEPORTING')

            // Step 3: Set adjusted target (after teleport calculation)
            context = reduce(context, { type: 'SET_PENDING_TARGET', target: 7672 })
            expect(context.pendingTarget).toBe(7672)

            // Step 4: Pre-teleport ends → should return to SCROLLING
            context = reduce(context, { type: 'SET_PRE_TELEPORTING', value: false })
            expect(context.phase).toBe('SCROLLING')
            expect(context.pendingTarget).toBe(7672)

            // Step 5: Next arrow click should work (not blocked)
            context = reduce(context, { type: 'ARROW_CLICK', direction: 1, targetScroll: 7946 })
            expect(context.phase).toBe('SCROLLING')
            expect(context.pendingTarget).toBe(7946)
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // TELEPORTING FLAGS
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Teleporting flags', () => {
        it('SET_TELEPORTING updates isTeleporting', () => {
            const context = createTestContext({ isTeleporting: false })

            const next1 = reduce(context, { type: 'SET_TELEPORTING', value: true })
            expect(next1.isTeleporting).toBe(true)

            const next2 = reduce(next1, { type: 'SET_TELEPORTING', value: false })
            expect(next2.isTeleporting).toBe(false)
        })

        it('SET_PRE_TELEPORTING=true just sets the flag', () => {
            const context = createTestContext({
                phase: 'SCROLLING',
                isPreTeleporting: false,
            })
            const action: CarouselAction = { type: 'SET_PRE_TELEPORTING', value: true }

            const next = reduce(context, action)

            expect(next.isPreTeleporting).toBe(true)
            expect(next.phase).toBe('SCROLLING') // Phase not changed when setting to true
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // ITEM_CLICK
    // ═══════════════════════════════════════════════════════════════════════════
    describe('ITEM_CLICK', () => {
        it('IDLE → SCROLLING: sets target without direction', () => {
            const context = createTestContext({ phase: 'IDLE' })
            const action: CarouselAction = { type: 'ITEM_CLICK', targetScroll: 1000 }

            const next = reduce(context, action)

            expect(next.phase).toBe('SCROLLING')
            expect(next.pendingTarget).toBe(1000)
            expect(next.scrollDirection).toBeNull() // No direction for item clicks
        })

        it('blocked when in PRE_TELEPORTING', () => {
            const context = createTestContext({ phase: 'PRE_TELEPORTING' })
            const action: CarouselAction = { type: 'ITEM_CLICK', targetScroll: 1000 }

            const next = reduce(context, action)

            expect(next.phase).toBe('PRE_TELEPORTING')
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    describe('Utility actions', () => {
        it('SET_SNAP_TIMEOUT and CLEAR_SNAP_TIMEOUT', () => {
            const context = createTestContext()
            const timeoutId = setTimeout(() => { }, 0)

            const next1 = reduce(context, { type: 'SET_SNAP_TIMEOUT', timeoutId })
            expect(next1.snapTimeoutId).toBe(timeoutId)

            const next2 = reduce(next1, { type: 'CLEAR_SNAP_TIMEOUT' })
            expect(next2.snapTimeoutId).toBeNull()

            clearTimeout(timeoutId)
        })

        it('SET_ACTIVE_ITEM_KEY', () => {
            const context = createTestContext()

            const next = reduce(context, { type: 'SET_ACTIVE_ITEM_KEY', key: 'item-5' })

            expect(next.lastActiveItemKey).toBe('item-5')
        })

        it('SET_SCROLL_END_LISTENER', () => {
            const context = createTestContext({ hasScrollEndListener: false })

            const next = reduce(context, { type: 'SET_SCROLL_END_LISTENER', hasListener: true })

            expect(next.hasScrollEndListener).toBe(true)
        })
    })
})
