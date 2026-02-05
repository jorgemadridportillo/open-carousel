import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCarouselNavigation } from '../useCarouselNavigation'
import { LAYOUT_CONFIG, TIMING_CONFIG } from '../../config'
import type { UseCarouselCoordinatorReturn, CarouselContext, CarouselPhase, CarouselAction } from '../useCarouselCoordinator'
import type { CarouselLoggerInstance } from '../../logger'

// Mock scrollTo
const mockScrollTo = vi.fn()

// Create a mock coordinator that tracks state internally
function createMockCoordinator(): UseCarouselCoordinatorReturn {
    const context: CarouselContext = {
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
        transition: vi.fn((action: CarouselAction) => {
            // Simulate some basic state transitions for testing
            switch (action.type) {
                case 'ARROW_CLICK':
                    contextRef.current.phase = 'SCROLLING'
                    contextRef.current.pendingTarget = action.targetScroll
                    contextRef.current.scrollDirection = action.direction
                    break
                case 'SCROLL_COMPLETE':
                    contextRef.current.phase = 'IDLE'
                    contextRef.current.pendingTarget = null
                    contextRef.current.scrollDirection = null
                    break
                case 'START_BOUNCE':
                    contextRef.current.phase = 'BOUNCING'
                    contextRef.current.bounceTimeoutId = action.timeoutId
                    break
                case 'END_BOUNCE':
                    contextRef.current.phase = 'IDLE'
                    contextRef.current.bounceTimeoutId = null
                    break
            }
            return contextRef.current
        }),
        getPhase: vi.fn(() => contextRef.current.phase),
        getContext: vi.fn(() => contextRef.current),
        contextRef,
        isBusy: vi.fn(() => contextRef.current.phase !== 'IDLE'),
        isBlocking: vi.fn(() => contextRef.current.phase === 'BOUNCING' || contextRef.current.phase === 'TELEPORTING'),
    }
}

// Create a mock container element
function createMockContainer(options: {
    scrollLeft?: number
    scrollWidth?: number
    clientWidth?: number
} = {}) {
    const el = document.createElement('div')

    // Define properties with configurable: true for redefinition
    Object.defineProperty(el, 'scrollLeft', {
        value: options.scrollLeft ?? 0,
        writable: true,
        configurable: true
    })
    Object.defineProperty(el, 'scrollWidth', {
        value: options.scrollWidth ?? 2000,
        configurable: true
    })
    Object.defineProperty(el, 'clientWidth', {
        value: options.clientWidth ?? 800,
        configurable: true
    })

    el.scrollTo = mockScrollTo
    el.addEventListener = vi.fn()
    el.removeEventListener = vi.fn()

    return el
}

describe('useCarouselNavigation', () => {
    const defaultLayout = { cardWidth: 200, gap: 24 }
    const stride = defaultLayout.cardWidth + defaultLayout.gap // 224

    beforeEach(() => {
        vi.useFakeTimers()
        mockScrollTo.mockClear()
        // Mock scrollend support
        vi.stubGlobal('onscrollend', undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    describe('Initialization', () => {
        it('should return all expected functions', () => {
            const containerRef = { current: null }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            expect(result.current.scrollLeft).toBeInstanceOf(Function)
            expect(result.current.scrollRight).toBeInstanceOf(Function)
            expect(result.current.handleScrollNav).toBeInstanceOf(Function)
        })
    })

    describe('Basic navigation', () => {
        it('should do nothing when container is null', () => {
            const containerRef = { current: null }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(cancelMomentum).not.toHaveBeenCalled()
        })

        it('should cancel momentum when navigating', () => {
            const container = createMockContainer({ scrollLeft: 448 }) // Index 2
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(cancelMomentum).toHaveBeenCalled()
        })

        it('should call coordinator transition with ARROW_CLICK', () => {
            const container = createMockContainer({ scrollLeft: 448 }) // Index 2
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            // Current index = Math.round(448 / 224) = 2
            // Target = (2 + 1) * 224 = 672
            expect(coordinator.transition).toHaveBeenCalledWith({
                type: 'ARROW_CLICK',
                direction: 1,
                targetScroll: 672
            })
        })

        it('should call onNavigate callback with target', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const onNavigate = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    onNavigate,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(onNavigate).toHaveBeenCalledWith(672)
        })
    })

    describe('Rapid-click "Catch-Up & Advance" strategy', () => {
        it('should advance from pending target when mid-animation', () => {
            const container = createMockContainer({ scrollLeft: 200 }) // Hasn't reached target yet
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            // First click - sets pending target via coordinator
            act(() => {
                result.current.scrollRight()
            })

            // pendingTarget should be set in coordinator (index 1 + 1 = 2 → 448)
            expect(coordinator.contextRef.current.pendingTarget).toBe(448)

            // Simulate mid-animation: scrollLeft hasn't reached target yet
            // Second rapid click
            act(() => {
                result.current.scrollRight()
            })

            // Should advance from previous target (448) + stride (224) = 672
            expect(coordinator.contextRef.current.pendingTarget).toBe(672)
        })

        it('should catch up instantly before advancing', () => {
            const container = createMockContainer({ scrollLeft: 200 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            // First click
            act(() => {
                result.current.scrollRight()
            })

            mockScrollTo.mockClear()

            // Second rapid click
            act(() => {
                result.current.scrollRight()
            })

            // Should have called scrollTo with behavior: 'auto' first (catch-up)
            expect(mockScrollTo).toHaveBeenCalledWith({ left: 448, behavior: 'auto' })
        })

        it('should handle direction change during rapid clicks', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            // First click RIGHT
            act(() => {
                result.current.scrollRight()
            })

            expect(coordinator.contextRef.current.pendingTarget).toBe(672)

            // Second click LEFT (direction change)
            act(() => {
                result.current.scrollLeft()
            })

            // Should advance from 672 in left direction: 672 - 224 = 448
            expect(coordinator.contextRef.current.pendingTarget).toBe(448)
        })
    })

    describe('Bounce animation (finite carousel)', () => {
        it('should trigger bounce at left edge via coordinator', () => {
            const container = createMockContainer({
                scrollLeft: 5, // Within EDGE_TOLERANCE_START
                scrollWidth: 2000,
                clientWidth: 800
            })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollLeft()
            })

            // Should have called START_BOUNCE
            expect(coordinator.transition).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'START_BOUNCE' })
            )
            expect(container.style.transform).toContain('translateX')

            // Advance through bounce phases
            act(() => {
                vi.advanceTimersByTime(TIMING_CONFIG.BOUNCE_PHASE2_MS)
            })

            // Should have called END_BOUNCE
            expect(coordinator.transition).toHaveBeenCalledWith({ type: 'END_BOUNCE' })
        })

        it('should trigger bounce at right edge', () => {
            const container = createMockContainer({
                scrollLeft: 1197, // At right edge
                scrollWidth: 2000,
                clientWidth: 800
            })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(coordinator.transition).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'START_BOUNCE' })
            )
        })

        it('should ignore clicks while bouncing', () => {
            const container = createMockContainer({ scrollLeft: 5 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()
            // Set phase to BOUNCING
            coordinator.contextRef.current.phase = 'BOUNCING'

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            // Try to click while bouncing
            act(() => {
                result.current.scrollRight()
            })

            // cancelMomentum should NOT be called (click was blocked)
            expect(cancelMomentum).not.toHaveBeenCalled()
        })

        it('should NOT bounce for infinite carousels', () => {
            const container = createMockContainer({ scrollLeft: 5 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: true, // Infinite carousel
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollLeft()
            })

            // Should NOT have called START_BOUNCE
            expect(coordinator.transition).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'START_BOUNCE' })
            )
            // Should have called ARROW_CLICK instead
            expect(coordinator.transition).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ARROW_CLICK' })
            )
        })
    })

    describe('Pre-teleport integration (infinite carousel)', () => {
        it('should call preTeleport for infinite carousels', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const preTeleport = vi.fn((target) => target + 1000) // Simulates teleport adjustment
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: true,
                    layout: defaultLayout,
                    cancelMomentum,
                    preTeleport,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(preTeleport).toHaveBeenCalled()
            // Target should be adjusted by preTeleport (672 + 1000 = 1672)
            expect(coordinator.transition).toHaveBeenCalledWith({
                type: 'ARROW_CLICK',
                direction: 1,
                targetScroll: 1672
            })
        })

        it('should NOT call preTeleport for finite carousels', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const preTeleport = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    preTeleport,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(preTeleport).not.toHaveBeenCalled()
        })

        it('should disable scroll-snap for infinite carousels during navigation', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: true,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(container.style.scrollSnapType).toBe('none')
        })
    })

    describe('Scroll completion detection', () => {
        it('should register scrollend listener when supported', () => {
            // Mock scrollend support
            Object.defineProperty(window, 'onscrollend', { value: vi.fn(), configurable: true })

            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(container.addEventListener).toHaveBeenCalledWith(
                'scrollend',
                expect.any(Function),
                { once: true }
            )
        })

        it('should use scroll debounce fallback when scrollend not supported', () => {
            // Ensure scrollend is NOT supported
            delete (window as any).onscrollend

            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            expect(container.addEventListener).toHaveBeenCalledWith(
                'scroll',
                expect.any(Function),
                { passive: true }
            )
        })
    })

    describe('Edge cases', () => {
        it('should handle layout with cardWidth = 0 gracefully', () => {
            const container = createMockContainer({ scrollLeft: 0 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: false,
                    layout: { cardWidth: 0, gap: 24 },
                    cancelMomentum,
                    coordinator,
                })
            )

            // Should not throw
            act(() => {
                result.current.scrollRight()
            })

            // Stride = 24, so target = (0 + 1) * 24 = 24
            expect(coordinator.transition).toHaveBeenCalledWith({
                type: 'ARROW_CLICK',
                direction: 1,
                targetScroll: 24
            })
        })

        it('should handle very large scroll positions', () => {
            const container = createMockContainer({
                scrollLeft: 100000,
                scrollWidth: 200000,
                clientWidth: 800
            })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result } = renderHook(() =>
                useCarouselNavigation({
                    containerRef,
                    infinite: true,
                    layout: defaultLayout,
                    cancelMomentum,
                    coordinator,
                })
            )

            act(() => {
                result.current.scrollRight()
            })

            // Index = Math.round(100000 / 224) = 446
            // Target = (446 + 1) * 224 = 100128
            expect(coordinator.transition).toHaveBeenCalledWith({
                type: 'ARROW_CLICK',
                direction: 1,
                targetScroll: 100128
            })
        })

        it('should handle layout changes between navigations', () => {
            const container = createMockContainer({ scrollLeft: 448 })
            const containerRef = { current: container }
            const cancelMomentum = vi.fn()
            const coordinator = createMockCoordinator()

            const { result, rerender } = renderHook(
                ({ layout }) =>
                    useCarouselNavigation({
                        containerRef,
                        infinite: false,
                        layout,
                        cancelMomentum,
                        coordinator,
                    }),
                { initialProps: { layout: defaultLayout } }
            )

            act(() => {
                result.current.scrollRight()
            })

            // Change layout
            rerender({ layout: { cardWidth: 300, gap: 20 } })

            // Navigate again with new layout
            act(() => {
                result.current.scrollRight()
            })

            // The last transition call should use the new stride
            // Previous target was 672, now advance by 320 = 992
            const calls = (coordinator.transition as any).mock.calls
            const lastCall = calls[calls.length - 1][0]
            expect(lastCall.targetScroll).toBe(992)
        })
    })

    it('should correctly calculate index when start padding (paddingOffset) is present (Regression Fix)', () => {
        // Scenario that caused the bug:
        // Stride = 336 (320 + 16)
        // Start Padding = 540
        // Current Scroll = 20160 (Exactly Index 60: 60 * 336)
        //
        // If we subtract padding from scroll before dividing:
        // (20160 - 540) / 336 = 58.39 -> Index 58
        // Next Index = 59
        // Target Node (59) OffsetLeft = 540 + 59*336 = 20364
        // Target Scroll = 20364 - 540 = 19824
        // Result: 19824 < 20160 (Moves BACKWARD on Right Arrow!)
        //
        // Correct Logic (dividing absolute scroll):
        // 20160 / 336 = 60 -> Index 60
        // Next Index = 61
        // Target Node (61) OffsetLeft = 540 + 61*336 = 21036
        // Target Scroll = 21036 - 540 = 20496 (Moves FORWARD)

        const stride = 336
        const paddingOffset = 540
        const currentScroll = 20160
        const layout = { cardWidth: 320, gap: 16 }

        const container = createMockContainer({ scrollLeft: currentScroll })

        // Mock children for DOM-based target calculation
        // We need at least up to index 62
        for (let i = 0; i < 65; i++) {
            const child = document.createElement('div')
            Object.defineProperty(child, 'offsetLeft', {
                value: paddingOffset + (i * stride),
                configurable: true
            })
            container.appendChild(child)
        }

        const containerRef = { current: container }
        const cancelMomentum = vi.fn()
        const coordinator = createMockCoordinator()

        const { result } = renderHook(() =>
            useCarouselNavigation({
                containerRef,
                infinite: true,
                layout,
                cancelMomentum,
                coordinator,
            })
        )

        act(() => {
            result.current.scrollRight()
        })

        // Expectation: Target should be Index 61
        // Target Scroll = (Index 61 * Stride) = 20496
        expect(coordinator.transition).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ARROW_CLICK',
                direction: 1,
                targetScroll: 20496
            })
        )
    })
})
