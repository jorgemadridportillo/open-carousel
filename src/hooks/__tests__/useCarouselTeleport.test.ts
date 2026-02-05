import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCarouselTeleport } from '../useCarouselTeleport'
import { LAYOUT_CONFIG } from '../../config'
import type { UseCarouselCoordinatorReturn } from '../useCarouselCoordinator'
import type { CarouselLoggerInstance } from '../../logger'

// Create a mock coordinator that tracks state internally
const createMockCoordinator = () => {
    type Phase = 'UNINITIALIZED' | 'IDLE' | 'SCROLLING' | 'BOUNCING' | 'PRE_TELEPORTING' | 'TELEPORTING' | 'DRAGGING'
    const context: {
        phase: Phase
        pendingTarget: number | null
        scrollDirection: -1 | 1 | null
        teleportOffset: number | null
        isTeleporting: boolean
        isPreTeleporting: boolean
        lastActiveItemKey: string | null
        snapTimeoutId: ReturnType<typeof setTimeout> | null
        scrollIdleTimeoutId: ReturnType<typeof setTimeout> | null
        bounceTimeoutId: ReturnType<typeof setTimeout> | null
        hasScrollEndListener: boolean
    } = {
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
    }
    const contextRef = { current: context }

    return {
        getContext: () => context,
        getPhase: () => context.phase,
        contextRef,
        transition: vi.fn((action: { type: string; value?: boolean }) => {
            if (action.type === 'SET_TELEPORTING') {
                context.isTeleporting = action.value ?? false
            } else if (action.type === 'SET_PRE_TELEPORTING') {
                context.isPreTeleporting = action.value ?? false
            } else if (action.type === 'ARROW_CLICK') {
                context.phase = 'SCROLLING' as const
            } else if (action.type === 'SCROLL_COMPLETE' || action.type === 'END_TELEPORT') {
                context.phase = 'IDLE' as const
            }
            return context
        }),
        isBusy: () => context.phase !== 'IDLE',
        isBlocking: () => context.phase === 'BOUNCING' || context.phase === 'TELEPORTING',
        // Helper to set pendingTarget for tests
        _setPendingTarget: (target: number | null) => { context.pendingTarget = target },
        _setPreTeleporting: (value: boolean) => { context.isPreTeleporting = value },
    }
}

// Mock refs and callbacks
const createMockOptions = (overrides = {}) => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'scrollLeft', {
        value: 5000,
        writable: true,
        configurable: true
    })
    Object.defineProperty(container, 'scrollTo', {
        value: vi.fn((options: { left: number; behavior: string }) => {
            container.scrollLeft = options.left
        }),
        writable: true
    })

    const coordinator = createMockCoordinator()

    return {
        containerRef: { current: container },
        infinite: true,
        itemsCount: 24,
        cardWidth: 150,
        gap: 24,
        bufferBeforeCount: 24,
        applyVisuals: vi.fn(),
        adjustScroll: vi.fn(),
        preTeleportClearDelayMs: 50,
        coordinator,
        // Expose coordinator helpers for test manipulation
        _coordinator: coordinator,
        ...overrides
    }
}

describe('useCarouselTeleport', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('Initialization', () => {
        it('should return isTouchInteraction ref', () => {
            const options = createMockOptions()
            const { result } = renderHook(() => useCarouselTeleport(options))

            expect(result.current.isTouchInteraction).toBeDefined()
            expect(result.current.isTouchInteraction.current).toBe(false)
        })

        it('should attach scroll listeners when infinite', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')

            renderHook(() => useCarouselTeleport(options))

            expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
            expect(addEventListenerSpy).toHaveBeenCalledWith('scrollend', expect.any(Function))
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { passive: true })
        })

        it('should not attach listeners when not infinite', () => {
            const options = createMockOptions({ infinite: false })
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')

            renderHook(() => useCarouselTeleport(options))

            expect(addEventListenerSpy).not.toHaveBeenCalled()
        })
    })

    describe('Cleanup', () => {
        it('should remove listeners on unmount', () => {
            const options = createMockOptions()
            const removeEventListenerSpy = vi.spyOn(options.containerRef.current!, 'removeEventListener')

            const { unmount } = renderHook(() => useCarouselTeleport(options))
            unmount()

            expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
            expect(removeEventListenerSpy).toHaveBeenCalledWith('scrollend', expect.any(Function))
            expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function))
        })
    })

    describe('Pre-teleport flag', () => {
        it('should skip teleport when isPreTeleportingRef is true', () => {
            const options = createMockOptions({
                isPreTeleportingRef: { current: true }
            })

            renderHook(() => useCarouselTeleport(options))

            // Trigger scroll event
            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)

            // applyVisuals should still be called for visual updates
            // but teleport should be skipped (no adjustScroll call)
            vi.runAllTimers()

            expect(options.adjustScroll).not.toHaveBeenCalled()
        })
    })

    describe('Pending target check', () => {
        it('should skip scroll-based teleport when pendingScrollTarget exists', () => {
            const options = createMockOptions({
                pendingScrollTargetRef: { current: 6000 }
            })

            renderHook(() => useCarouselTeleport(options))

            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)

            vi.runAllTimers()

            // adjustScroll should not be called because there's a pending target
            expect(options.adjustScroll).not.toHaveBeenCalled()
        })
    })

    describe('Reactive teleport (scroll event → adjustScroll)', () => {
        it('should call adjustScroll when scroll position exceeds right threshold', () => {
            const options = createMockOptions()
            // stride = 174, bufferBeforeWidth = 4176, originalSetWidth = 4176
            // Right threshold = 4176 + 4176 = 8352
            // Set scrollLeft beyond right threshold to trigger backward teleport
            options.containerRef.current!.scrollLeft = 9000

            renderHook(() => useCarouselTeleport(options))

            // Trigger scroll event
            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)

            vi.runAllTimers()

            // CRITICAL: adjustScroll should be called with negative offset (backward teleport)
            expect(options.adjustScroll).toHaveBeenCalled()
            expect(options.adjustScroll).toHaveBeenCalledWith(-4176) // -originalSetWidth
        })

        it('should call adjustScroll when scroll position is below left threshold', () => {
            const options = createMockOptions()
            // Set scrollLeft below bufferBeforeWidth (4176) to trigger forward teleport
            options.containerRef.current!.scrollLeft = 2000

            renderHook(() => useCarouselTeleport(options))

            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)

            vi.runAllTimers()

            // CRITICAL: adjustScroll should be called with positive offset (forward teleport)
            expect(options.adjustScroll).toHaveBeenCalled()
            expect(options.adjustScroll).toHaveBeenCalledWith(4176) // +originalSetWidth
        })
    })

    describe('preTeleport (proactive pre-teleport)', () => {
        // stride = 150 + 24 = 174
        // bufferBeforeWidth = 24 * 174 = 4176
        // originalSetWidth = 24 * 174 = 4176
        // Safe zone: [4176, 8352)

        it('should return preTeleport function', () => {
            const options = createMockOptions()
            const { result } = renderHook(() => useCarouselTeleport(options))

            expect(result.current.preTeleport).toBeDefined()
            expect(typeof result.current.preTeleport).toBe('function')
        })

        it('should return unchanged target when in safe zone', () => {
            const options = createMockOptions()
            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target 5000 is in safe zone [4176, 8352)
            const adjustedTarget = result.current.preTeleport(5000)

            expect(adjustedTarget).toBe(5000)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(false)
        })

        it('should teleport LEFT when target < bufferBeforeWidth', () => {
            const options = createMockOptions()
            const initialScrollLeft = 200
            options.containerRef.current!.scrollLeft = initialScrollLeft

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target 2000 < bufferBeforeWidth (4176), should teleport LEFT by adding originalSetWidth
            const adjustedTarget = result.current.preTeleport(2000)

            // 2000 + 4176 (originalSetWidth) = 6176
            expect(adjustedTarget).toBe(6176)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)

            // CRITICAL: Verify DOM scrollLeft was actually changed
            // Original: 200, offset: +4176 (originalSetWidth) = 4376
            const expectedScrollLeft = initialScrollLeft + (24 * 174) // 24 items * 174 stride
            expect(options.containerRef.current!.scrollLeft).toBe(expectedScrollLeft)
        })

        it('should teleport RIGHT when target >= bufferBeforeWidth + originalSetWidth', () => {
            const options = createMockOptions()
            const initialScrollLeft = 9000
            options.containerRef.current!.scrollLeft = initialScrollLeft

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target 9000 >= 8352 (bufferBefore + original), should teleport RIGHT by subtracting
            const adjustedTarget = result.current.preTeleport(9000)

            // 9000 - 4176 (originalSetWidth) = 4824
            expect(adjustedTarget).toBe(4824)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)

            // CRITICAL: Verify DOM scrollLeft was actually changed
            // Original: 9000, offset: -4176 (originalSetWidth) = 4824
            const expectedScrollLeft = initialScrollLeft - (24 * 174) // subtract 24 items * 174 stride
            expect(options.containerRef.current!.scrollLeft).toBe(expectedScrollLeft)
        })

        it('should set isPreTeleportingRef and clear it after delay', () => {
            const options = createMockOptions()
            options.containerRef.current!.scrollLeft = 200

            const { result } = renderHook(() => useCarouselTeleport(options))

            result.current.preTeleport(2000) // Triggers left teleport

            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)

            // Advance timers past the clear delay
            vi.advanceTimersByTime(100)

            expect(options._coordinator.getContext().isPreTeleporting).toBe(false)
        })

        it('should not teleport when not infinite', () => {
            const options = createMockOptions({ infinite: false })
            const { result } = renderHook(() => useCarouselTeleport(options))

            const adjustedTarget = result.current.preTeleport(2000)

            // Should return unchanged target because not infinite
            expect(adjustedTarget).toBe(2000)
        })

        it('should call applyVisuals after teleport with new scrollLeft', () => {
            const options = createMockOptions()
            const initialScrollLeft = 200
            options.containerRef.current!.scrollLeft = initialScrollLeft

            const { result } = renderHook(() => useCarouselTeleport(options))

            result.current.preTeleport(2000) // Triggers left teleport

            // Run RAF callback where applyVisuals is called
            vi.runAllTimers()

            // CRITICAL: Verify applyVisuals was called with container and new scrollLeft
            expect(options.applyVisuals).toHaveBeenCalled()
            // Check it was called with the container element
            expect(options.applyVisuals).toHaveBeenCalledWith(
                options.containerRef.current,
                expect.any(Number)
            )
        })

        it('should use DOM-measured stride instead of calculated stride when they differ (regression test)', () => {
            // This test prevents regression of the bug where preTeleport used
            // calculated stride (cardWidth + gap) instead of measured DOM stride,
            // causing cards to land off-center after teleport.
            const options = createMockOptions({
                cardWidth: 220,
                gap: 12,
                itemsCount: 10,
                bufferBeforeCount: 50,
            })

            // CRITICAL: Mock DOM children with stride that differs from calculated
            // Calculated stride = 220 + 12 = 232
            // DOM stride = 236 (4px difference per item = 40px drift per 10-item cycle)
            const mockChildren = [
                { offsetLeft: 54 },   // paddingOffset
                { offsetLeft: 290 },  // 54 + 236 = 290
            ]
            Object.defineProperty(options.containerRef.current, 'children', {
                value: mockChildren,
                configurable: true
            })

            options.containerRef.current!.scrollLeft = 13924

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target calculation:
            // With DOM stride (236): 
            //   bufferBeforeWidth = 50 * 236 = 11800
            //   originalSetWidth = 10 * 236 = 2360
            //   rightThreshold = 11800 + 2360 = 14160
            // Target 14160 is AT threshold, should teleport RIGHT
            // Adjusted target = 14160 - 2360 = 11800
            //
            // With WRONG calculated stride (232):
            //   bufferBeforeWidth = 50 * 232 = 11600
            //   originalSetWidth = 10 * 232 = 2320
            //   rightThreshold = 11600 + 2320 = 13920
            // Target 14160 > 13920, would teleport
            // Adjusted target = 14160 - 2320 = 11840 (WRONG!)

            const adjustedTarget = result.current.preTeleport(14160)

            // CRITICAL: Should be 11800 (using DOM stride 236), NOT 11840 (calculated stride 232)
            expect(adjustedTarget).toBe(11800)
        })
    })

    describe('Boundary conditions', () => {
        it('should handle itemsCount = 0 gracefully (no crash)', () => {
            const options = createMockOptions({ itemsCount: 0 })

            // Should not throw
            const { result } = renderHook(() => useCarouselTeleport(options))

            // preTeleport should return target unchanged (no teleport possible)
            const adjustedTarget = result.current.preTeleport(1000)
            expect(adjustedTarget).toBe(1000)
        })

        it('should handle itemsCount = 1 gracefully', () => {
            const options = createMockOptions({ itemsCount: 1, bufferBeforeCount: 1 })

            const { result } = renderHook(() => useCarouselTeleport(options))

            // With 1 item, stride = 174, buffer = 174, original = 174
            // Safe zone: [174, 348) - very narrow
            const adjustedTarget = result.current.preTeleport(100)
            // Should teleport left: 100 + 174 = 274
            expect(adjustedTarget).toBe(274)
        })

        it('should handle cardWidth = 0 gracefully (no division by zero crash)', () => {
            const options = createMockOptions({ cardWidth: 0, gap: 0 })

            // Should not throw
            const { result } = renderHook(() => useCarouselTeleport(options))
            expect(result.current.preTeleport).toBeDefined()
        })

        it('should handle scroll at EXACTLY the left threshold boundary', () => {
            const options = createMockOptions()
            // stride = 174, bufferBeforeWidth = 24 * 174 = 4176
            // Exactly AT the boundary (scrollLeft = 4176)
            options.containerRef.current!.scrollLeft = 4176

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target exactly at boundary should NOT trigger teleport (in safe zone)
            const adjustedTarget = result.current.preTeleport(4176)
            expect(adjustedTarget).toBe(4176)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(false)
        })

        it('should handle scroll at EXACTLY the right threshold boundary', () => {
            const options = createMockOptions()
            // stride = 174, right threshold = 4176 + 4176 = 8352
            // Exactly AT the boundary (scrollLeft = 8352)
            options.containerRef.current!.scrollLeft = 8352

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Target exactly at right boundary SHOULD trigger teleport (>= threshold)
            const adjustedTarget = result.current.preTeleport(8352)
            // 8352 - 4176 = 4176
            expect(adjustedTarget).toBe(4176)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)
        })

        it('should handle scroll 1px BELOW left threshold', () => {
            const options = createMockOptions()
            options.containerRef.current!.scrollLeft = 4175 // 1px below 4176

            const { result } = renderHook(() => useCarouselTeleport(options))

            // 4175 < 4176, should trigger LEFT teleport
            const adjustedTarget = result.current.preTeleport(4175)
            // 4175 + 4176 = 8351
            expect(adjustedTarget).toBe(8351)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)
        })
    })

    describe('Rapid state transitions', () => {
        it('should handle preTeleport called while isPreTeleportingRef = true (double teleport)', () => {
            const options = createMockOptions()
            options.containerRef.current!.scrollLeft = 200

            const { result } = renderHook(() => useCarouselTeleport(options))

            // First preTeleport - triggers left teleport
            const first = result.current.preTeleport(2000)
            expect(first).toBe(6176) // 2000 + 4176
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)

            // Second preTeleport called immediately (before setTimeout clears flag)
            // This simulates rapid double-click scenario
            const initialScrollAfterFirst = options.containerRef.current!.scrollLeft
            const second = result.current.preTeleport(2000)

            // Expected behavior: second call should STILL work correctly
            // because the target is evaluated, not the flag blocking preTeleport
            // The flag only blocks REACTIVE teleport, not PROACTIVE preTeleport
            expect(second).toBe(6176) // Same calculation
        })

        it('should handle scroll event during active setTimeout clear delay', () => {
            const options = createMockOptions()
            options.containerRef.current!.scrollLeft = 200

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Trigger preTeleport - sets isPreTeleportingRef = true
            result.current.preTeleport(2000)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)

            // Advance time partially (before flag clears)
            vi.advanceTimersByTime(25) // Half of 50ms delay
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true) // Still true

            // Trigger scroll event while flag is still set
            options.containerRef.current!.scrollLeft = 9000 // Would trigger teleport normally
            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)
            vi.runAllTimers()

            // CRITICAL: adjustScroll should NOT be called because isPreTeleportingRef was true
            // This prevents double-teleport from arrow click + reactive scroll
            expect(options.adjustScroll).not.toHaveBeenCalled()
        })

        it('should handle multiple rapid arrow clicks correctly (pendingScrollTarget scenario)', () => {
            const options = createMockOptions()
            options.containerRef.current!.scrollLeft = 5000

            const { result } = renderHook(() => useCarouselTeleport(options))

            // First click - sets pending target
            options._coordinator.getContext().pendingTarget = 5174 // stride = 174

            // Second rapid click while first is pending
            const adjustedTarget = result.current.preTeleport(5348) // 2 strides

            // Target 5348 is in safe zone [4176, 8352), should NOT teleport
            expect(adjustedTarget).toBe(5348)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(false)

            // Now test when second click would go outside safe zone
            options._coordinator.getContext().pendingTarget = 8300 // Near right edge
            const thirdClick = result.current.preTeleport(8500) // Beyond threshold

            // 8500 >= 8352, should teleport RIGHT
            // 8500 - 4176 = 4324
            expect(thirdClick).toBe(4324)
            expect(options._coordinator.getContext().isPreTeleporting).toBe(true)
        })
    })

    describe('Mobile/Touch edge cases', () => {
        it('should switch isTouchInteraction on touch → mouse transition', () => {
            const options = createMockOptions()
            // Start in safe zone so pointerdown won't trigger teleport
            options.containerRef.current!.scrollLeft = 5000

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Initially false (default)
            expect(result.current.isTouchInteraction.current).toBe(false)

            // Simulate touch pointerdown
            const touchEvent = new PointerEvent('pointerdown', { pointerType: 'touch' })
            options.containerRef.current!.dispatchEvent(touchEvent)
            expect(result.current.isTouchInteraction.current).toBe(true)

            // Simulate mouse pointerdown (user plugged in mouse mid-session)
            const mouseEvent = new PointerEvent('pointerdown', { pointerType: 'mouse' })
            options.containerRef.current!.dispatchEvent(mouseEvent)
            expect(result.current.isTouchInteraction.current).toBe(false)
        })

        it('should handle scrollend event for mobile touch (isTouchInteraction = true)', () => {
            const options = createMockOptions()
            // Start in safe zone for pointerdown setup
            options.containerRef.current!.scrollLeft = 5000

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Set touch interaction mode (while in safe zone - no teleport triggered)
            const touchEvent = new PointerEvent('pointerdown', { pointerType: 'touch' })
            options.containerRef.current!.dispatchEvent(touchEvent)
            expect(result.current.isTouchInteraction.current).toBe(true)

            // Clear any calls and move to position that needs teleport
            options.adjustScroll.mockClear()
            // CRITICAL: Must Align with Stride (174) for Snap Skew Check to pass
            // 9048 = 52 * 174. 9048 > 8352 (threshold)
            options.containerRef.current!.scrollLeft = 9048 // Beyond threshold

            // Trigger scrollend (simulates momentum scroll ending)
            const scrollEndEvent = new Event('scrollend')
            options.containerRef.current!.dispatchEvent(scrollEndEvent)

            // CRITICAL: scrollend should trigger teleport when in touch mode
            expect(options.adjustScroll).toHaveBeenCalledWith(-4176)
        })

        it('should perform teleport on pointerdown during momentum scroll (catch-and-reset)', () => {
            const options = createMockOptions()
            // Scroll is beyond threshold (would need teleport)
            options.containerRef.current!.scrollLeft = 9000

            renderHook(() => useCarouselTeleport(options))

            // Simulate user "catching" the momentum scroll with finger
            const touchEvent = new PointerEvent('pointerdown', { pointerType: 'touch' })
            options.containerRef.current!.dispatchEvent(touchEvent)

            // CRITICAL: pointerdown should trigger teleport immediately
            // This is the "catch and reset" logic
            expect(options.adjustScroll).toHaveBeenCalledWith(-4176)
        })

        it('should skip scroll-based teleport when in touch mode', () => {
            const options = createMockOptions()
            // Start in safe zone for setup
            options.containerRef.current!.scrollLeft = 5000

            const { result } = renderHook(() => useCarouselTeleport(options))

            // Set touch interaction mode (in safe zone - no teleport)
            const touchEvent = new PointerEvent('pointerdown', { pointerType: 'touch' })
            options.containerRef.current!.dispatchEvent(touchEvent)
            expect(result.current.isTouchInteraction.current).toBe(true)

            // Clear and move to teleport-needed position
            options.adjustScroll.mockClear()
            options.containerRef.current!.scrollLeft = 9000

            // Trigger scroll event
            const scrollEvent = new Event('scroll')
            options.containerRef.current!.dispatchEvent(scrollEvent)
            vi.runAllTimers()

            // CRITICAL: scroll-based teleport should be SKIPPED in touch mode
            // (touch mode uses scrollend/pointerdown instead)
            expect(options.adjustScroll).not.toHaveBeenCalled()
        })
    })

    describe('Effect stability (Appendix A regression)', () => {
        // These tests verify that the effect doesn't re-run when only function references change
        // This was identified as a performance issue in Appendix A of the migration plan

        it('does NOT re-initialize handlers when coordinator reference changes', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')
            const removeEventListenerSpy = vi.spyOn(options.containerRef.current!, 'removeEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            const initialAddCalls = addEventListenerSpy.mock.calls.length
            const initialRemoveCalls = removeEventListenerSpy.mock.calls.length

            // Initial mount should have added 3 listeners
            expect(initialAddCalls).toBe(3)
            expect(initialRemoveCalls).toBe(0)

            // Simulate what happens on arrow click: coordinator object gets new reference
            const newCoordinator = createMockCoordinator()
            rerender({ ...options, coordinator: newCoordinator, _coordinator: newCoordinator })

            // After fix: Should NOT have re-attached listeners
            // Before fix: Would have 6 adds and 3 removes
            expect(addEventListenerSpy.mock.calls.length).toBe(3)
            expect(removeEventListenerSpy.mock.calls.length).toBe(0)
        })

        it('does NOT re-initialize handlers when applyVisuals reference changes', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            const initialAddCalls = addEventListenerSpy.mock.calls.length

            // New applyVisuals function reference (simulates parent re-render)
            rerender({ ...options, applyVisuals: vi.fn() })

            // Should NOT have re-attached listeners
            expect(addEventListenerSpy.mock.calls.length).toBe(initialAddCalls)
        })

        it('does NOT re-initialize handlers when adjustScroll reference changes', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            const initialAddCalls = addEventListenerSpy.mock.calls.length

            // New adjustScroll function reference
            rerender({ ...options, adjustScroll: vi.fn() })

            // Should NOT have re-attached listeners
            expect(addEventListenerSpy.mock.calls.length).toBe(initialAddCalls)
        })

        it('DOES re-initialize handlers when layout changes (cardWidth)', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')
            const removeEventListenerSpy = vi.spyOn(options.containerRef.current!, 'removeEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            // Layout change (e.g., window resize) - SHOULD trigger re-init
            rerender({ ...options, cardWidth: 300 })

            // Should have removed old listeners and added new ones
            expect(removeEventListenerSpy).toHaveBeenCalled()
            expect(addEventListenerSpy.mock.calls.length).toBeGreaterThan(3)
        })

        it('DOES re-initialize handlers when gap changes', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')
            const removeEventListenerSpy = vi.spyOn(options.containerRef.current!, 'removeEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            // Gap change - SHOULD trigger re-init
            rerender({ ...options, gap: 32 })

            expect(removeEventListenerSpy).toHaveBeenCalled()
            expect(addEventListenerSpy.mock.calls.length).toBeGreaterThan(3)
        })

        it('DOES re-initialize handlers when itemsCount changes', () => {
            const options = createMockOptions()
            const addEventListenerSpy = vi.spyOn(options.containerRef.current!, 'addEventListener')
            const removeEventListenerSpy = vi.spyOn(options.containerRef.current!, 'removeEventListener')

            const { rerender } = renderHook(
                (props) => useCarouselTeleport(props),
                { initialProps: options }
            )

            // Items count change - SHOULD trigger re-init (buffer zones change)
            rerender({ ...options, itemsCount: 48 })

            expect(removeEventListenerSpy).toHaveBeenCalled()
            expect(addEventListenerSpy.mock.calls.length).toBeGreaterThan(3)
        })
    })
})




