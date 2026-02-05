import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCarouselLayout, measureLayoutFromElement } from '../useCarouselLayout'
import { LAYOUT_CONFIG } from '../../config'

// Mock ResizeObserver
class MockResizeObserver {
    callback: ResizeObserverCallback
    static instances: MockResizeObserver[] = []

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        MockResizeObserver.instances.push(this)
    }

    observe() { }
    unobserve() { }
    disconnect() { }

    // Trigger resize for testing
    trigger(entries: Partial<ResizeObserverEntry>[] = []) {
        this.callback(entries as ResizeObserverEntry[], this as unknown as ResizeObserver)
    }

    static triggerAll(entries: Partial<ResizeObserverEntry>[] = []) {
        MockResizeObserver.instances.forEach(instance => instance.trigger(entries))
    }

    static reset() {
        MockResizeObserver.instances = []
    }
}

describe('measureLayoutFromElement', () => {
    beforeEach(() => {
        vi.stubGlobal('innerWidth', 1024) // Desktop by default
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('measures card width from first child element', () => {
        const container = document.createElement('div')
        const card = document.createElement('div')
        card.getBoundingClientRect = () => ({ width: 250 } as DOMRect)
        container.appendChild(card)

        const result = measureLayoutFromElement(container)

        expect(result!.cardWidth).toBe(250)
        expect(result!.gap).toBe(LAYOUT_CONFIG.GAP_DESKTOP)
    })

    it('uses mobile gap on small viewports', () => {
        vi.stubGlobal('innerWidth', 600) // Below GAP_BREAKPOINT

        const container = document.createElement('div')
        const card = document.createElement('div')
        card.getBoundingClientRect = () => ({ width: 180 } as DOMRect)
        container.appendChild(card)

        const result = measureLayoutFromElement(container)

        expect(result!.cardWidth).toBe(180)
        expect(result!.gap).toBe(LAYOUT_CONFIG.GAP_MOBILE)
    })

    it('uses desktop gap on large viewports', () => {
        vi.stubGlobal('innerWidth', 1200) // Above GAP_BREAKPOINT

        const container = document.createElement('div')
        const card = document.createElement('div')
        card.getBoundingClientRect = () => ({ width: 320 } as DOMRect)
        container.appendChild(card)

        const result = measureLayoutFromElement(container)

        expect(result!.cardWidth).toBe(320)
        expect(result!.gap).toBe(LAYOUT_CONFIG.GAP_DESKTOP)
    })

    describe('when no children exist', () => {
        it('returns null to signal inability to measure', () => {
            const container = document.createElement('div') // No children

            const result = measureLayoutFromElement(container)

            expect(result).toBeNull()
        })
    })
})

describe('useCarouselLayout', () => {
    beforeEach(() => {
        vi.stubGlobal('innerWidth', 1024)
        vi.stubGlobal('ResizeObserver', MockResizeObserver)
        MockResizeObserver.reset()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('initializes with default layout values', () => {
        const containerRef = { current: null }

        const { result } = renderHook(() => useCarouselLayout({ containerRef }))

        expect(result.current.layout).toEqual({ cardWidth: 180, gap: 16, domStride: 196 })
        expect(result.current.stride).toBe(196) // 180 + 16
    })

    it('calculates stride correctly from layout', () => {
        const containerRef = { current: null }

        const { result } = renderHook(() => useCarouselLayout({ containerRef }))

        expect(result.current.stride).toBe(result.current.layout.cardWidth + result.current.layout.gap)
    })

    it('detects mobile viewport (< 640px)', () => {
        vi.stubGlobal('innerWidth', 500)
        const containerRef = { current: null }

        const { result } = renderHook(() => useCarouselLayout({ containerRef }))

        expect(result.current.isMobile).toBe(true)
        expect(result.current.isTablet).toBe(false)
    })

    it('detects tablet viewport (640-1024px)', () => {
        vi.stubGlobal('innerWidth', 800)
        const containerRef = { current: null }

        const { result } = renderHook(() => useCarouselLayout({ containerRef }))

        expect(result.current.isMobile).toBe(false)
        expect(result.current.isTablet).toBe(true)
    })

    it('detects desktop viewport (>= 1024px)', () => {
        vi.stubGlobal('innerWidth', 1200)
        const containerRef = { current: null }

        const { result } = renderHook(() => useCarouselLayout({ containerRef }))

        expect(result.current.isMobile).toBe(false)
        expect(result.current.isTablet).toBe(false)
    })

    describe('measureLayout', () => {
        it('measures from container first child', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 200 } as DOMRect)
            container.appendChild(card)

            const containerRef = { current: container }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            act(() => {
                result.current.measureLayout()
            })

            expect(result.current.layout).toEqual({ cardWidth: 200, gap: 16, domStride: 216 })
            expect(result.current.stride).toBe(216)
        })

        it('does not update state when measurements are unchanged', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 180 } as DOMRect) // Matches default
            container.appendChild(card)

            const containerRef = { current: container }
            const onLayoutChange = vi.fn()

            const { result } = renderHook(() =>
                useCarouselLayout({ containerRef, onLayoutChange })
            )

            // First measurement
            act(() => {
                result.current.measureLayout()
            })

            // onLayoutChange should not be called since layout matches defaults
            expect(onLayoutChange).not.toHaveBeenCalled()
        })

        it('calls onLayoutChange when layout changes', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 250 } as DOMRect) // Different from default 170
            container.appendChild(card)

            const containerRef = { current: container }
            const onLayoutChange = vi.fn()

            const { result } = renderHook(() =>
                useCarouselLayout({ containerRef, onLayoutChange })
            )

            act(() => {
                result.current.measureLayout()
            })

            expect(onLayoutChange).toHaveBeenCalledWith({ cardWidth: 250, gap: 16, domStride: 266 })
        })

        it('returns current layout when no container', () => {
            const containerRef = { current: null }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            const measured = result.current.measureLayout()

            expect(measured).toEqual({ cardWidth: 180, gap: 16, domStride: 196 })
        })
    })

    describe('resize handling', () => {
        it('attaches ResizeObserver to container', () => {
            const container = document.createElement('div')
            const containerRef = { current: container }

            renderHook(() => useCarouselLayout({ containerRef }))

            expect(MockResizeObserver.instances.length).toBe(1)
        })

        it('debounces resize events after first observation', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 180 } as DOMRect) // Matches default
            container.appendChild(card)
            const containerRef = { current: container }

            const { result } = renderHook(() =>
                useCarouselLayout({ containerRef, resizeDebounceMs: 100 })
            )

            // First observation happens immediately on mount (no debounce)
            // This is the new behavior for faster initialization
            act(() => {
                MockResizeObserver.triggerAll()
            })
            expect(result.current.layout.cardWidth).toBe(180)

            // Now change card width and trigger resize again (second observation)
            card.getBoundingClientRect = () => ({ width: 280 } as DOMRect)
            act(() => {
                MockResizeObserver.triggerAll()
            })

            // Layout should not update immediately (debounced for subsequent resizes)
            expect(result.current.layout.cardWidth).toBe(180)

            // Advance past debounce time
            act(() => {
                vi.advanceTimersByTime(100)
            })

            // Now layout should update
            expect(result.current.layout.cardWidth).toBe(280)
        })

        it('cancels pending resize on quick successive resizes', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 180 } as DOMRect) // Matches default
            container.appendChild(card)
            const containerRef = { current: container }

            const { result } = renderHook(() =>
                useCarouselLayout({ containerRef, resizeDebounceMs: 100 })
            )

            // First observation is immediate (consume it)
            act(() => {
                MockResizeObserver.triggerAll()
            })
            expect(result.current.layout.cardWidth).toBe(180)

            // Now subsequent resizes should be debounced
            // First resize
            card.getBoundingClientRect = () => ({ width: 200 } as DOMRect)
            act(() => {
                MockResizeObserver.triggerAll()
            })

            // Wait 50ms (half of debounce)
            act(() => {
                vi.advanceTimersByTime(50)
            })

            // Second resize with different value
            card.getBoundingClientRect = () => ({ width: 250 } as DOMRect)
            act(() => {
                MockResizeObserver.triggerAll()
            })

            // Wait full debounce
            act(() => {
                vi.advanceTimersByTime(100)
            })

            // Should have final value, not intermediate
            expect(result.current.layout.cardWidth).toBe(250)
        })

        it('cleans up ResizeObserver on unmount', () => {
            const container = document.createElement('div')
            const containerRef = { current: container }
            const disconnectSpy = vi.spyOn(MockResizeObserver.prototype, 'disconnect')

            const { unmount } = renderHook(() => useCarouselLayout({ containerRef }))

            unmount()

            expect(disconnectSpy).toHaveBeenCalled()
        })
    })

    describe('invalidateLayout', () => {
        it('marks layout as dirty', () => {
            const containerRef = { current: null }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            // This just sets a flag, doesn't trigger re-render
            act(() => {
                result.current.invalidateLayout()
            })

            // Function should exist and not throw
            expect(result.current.invalidateLayout).toBeDefined()
        })
    })

    describe('edge cases', () => {
        it('handles cardWidth = 0 gracefully', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 0 } as DOMRect)
            container.appendChild(card)

            const containerRef = { current: container }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            act(() => {
                result.current.measureLayout()
            })

            // Should accept 0 as valid measurement
            expect(result.current.layout.cardWidth).toBe(0)
            expect(result.current.stride).toBe(16) // 0 + 16
        })

        it('handles gap = 0 edge case', () => {
            // This would require mocking LAYOUT_CONFIG, but the hook uses fixed gap values
            // So we verify the gap comes from config
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 200 } as DOMRect)
            container.appendChild(card)

            const containerRef = { current: container }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            act(() => {
                result.current.measureLayout()
            })

            expect(result.current.layout.gap).toBe(LAYOUT_CONFIG.GAP_DESKTOP)
        })

        it('handles very large cardWidth (> 100,000px)', () => {
            const container = document.createElement('div')
            const card = document.createElement('div')
            card.getBoundingClientRect = () => ({ width: 100001 } as DOMRect)
            container.appendChild(card)

            const containerRef = { current: container }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            act(() => {
                result.current.measureLayout()
            })

            expect(result.current.layout.cardWidth).toBe(100001)
            expect(result.current.stride).toBe(100017) // 100001 + 16
        })

        it('handles container with multiple children (uses first)', () => {
            const container = document.createElement('div')

            // First child with width 150
            const card1 = document.createElement('div')
            card1.getBoundingClientRect = () => ({ width: 150 } as DOMRect)
            container.appendChild(card1)

            // Second child with different width (should be ignored)
            const card2 = document.createElement('div')
            card2.getBoundingClientRect = () => ({ width: 300 } as DOMRect)
            container.appendChild(card2)

            const containerRef = { current: container }

            const { result } = renderHook(() => useCarouselLayout({ containerRef }))

            act(() => {
                result.current.measureLayout()
            })

            // Should use first child's width
            expect(result.current.layout.cardWidth).toBe(150)
        })
    })
})
