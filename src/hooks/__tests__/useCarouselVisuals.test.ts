import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCarouselVisuals } from '../useCarouselVisuals'
import { VISUAL_CONFIG } from '../../config'
import type { CarouselLoggerInstance } from '../../logger'

// Mock DOM container with children
const createMockContainer = (childCount = 10, childWidth = 150) => {
    const container = document.createElement('div')

    Object.defineProperty(container, 'scrollLeft', {
        value: 0,
        writable: true,
        configurable: true
    })

    Object.defineProperty(container, 'clientWidth', {
        value: 800,
        writable: true,
        configurable: true
    })

    // Create mock children
    const children: HTMLElement[] = []
    for (let i = 0; i < childCount; i++) {
        const child = document.createElement('div')
        Object.defineProperty(child, 'offsetLeft', {
            value: i * (childWidth + 16), // width + gap
            configurable: true
        })
        Object.defineProperty(child, 'offsetWidth', {
            value: childWidth,
            configurable: true
        })
        child.style.transform = ''
        child.style.opacity = ''
        child.style.zIndex = ''
        child.style.boxShadow = ''
        children.push(child)
        container.appendChild(child)
    }

    return { container, children }
}

const createDefaultOptions = (overrides = {}) => ({
    layout: { cardWidth: 150, gap: 16 },
    itemsCount: 10,
    bufferBeforeCount: 10,
    disableOpacityEffect: false,
    disableScaleEffect: false,
    ...overrides
})

describe('useCarouselVisuals', () => {
    beforeEach(() => {
        // Mock window.innerWidth
        Object.defineProperty(window, 'innerWidth', {
            value: 1024,
            writable: true,
            configurable: true
        })
    })

    describe('Initialization', () => {
        it('should return all expected refs and functions', () => {
            const options = createDefaultOptions()
            const { result } = renderHook(() => useCarouselVisuals(options))

            expect(result.current.childrenPositions).toBeDefined()
            expect(result.current.isCacheDirty).toBeDefined()
            expect(result.current.containerWidthRef).toBeDefined()
            expect(result.current.isContainerWidthDirty).toBeDefined()
            expect(result.current.updateCache).toBeDefined()
            expect(result.current.applyVisuals).toBeDefined()
        })

        it('should start with dirty cache', () => {
            const options = createDefaultOptions()
            const { result } = renderHook(() => useCarouselVisuals(options))

            expect(result.current.isCacheDirty.current).toBe(true)
            expect(result.current.isContainerWidthDirty.current).toBe(true)
        })
    })

    describe('updateCache', () => {
        it('should populate childrenPositions from DOM', () => {
            const { container } = createMockContainer(5, 150)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
            })

            expect(result.current.childrenPositions.current).toHaveLength(5)
            expect(result.current.childrenPositions.current[0]).toEqual({
                left: 0,
                width: 150
            })
            expect(result.current.childrenPositions.current[1]).toEqual({
                left: 166, // 150 + 16 gap
                width: 150
            })
        })
    })

    describe('applyVisuals', () => {
        it('should skip if cache is empty', () => {
            const { container, children } = createMockContainer(3)
            const options = createDefaultOptions()
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Don't call updateCache, so cache is empty
            act(() => {
                result.current.applyVisuals(container)
            })

            // Children should not have styles applied
            expect(children[0].style.transform).toBe('')
        })

        it('should apply scale and opacity to visible items with correct VALUES', () => {
            // Container: scrollLeft=0, clientWidth=800, so containerCenter=400
            // Children: 150px wide + 16px gap = 166 stride
            // Child 0: left=0, center=75, distance=|400-75|=325
            // Child 1: left=166, center=241, distance=|400-241|=159
            // Child 2: left=332, center=407, distance=|400-407|=7 (closest to center)

            const { container, children } = createMockContainer(5, 150)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Desktop config: maxDist=500, baseScale=0.85
            // Child 2 (closest to center): dist=7, normDist=7/500=0.014
            // factor = 1 - 0.014 = 0.986
            // easeFactor = 1 - (1 - 0.986)^3 ≈ 0.9999
            // scale = 0.85 + (0.15 * 0.9999) ≈ 0.9999 (nearly 1)
            // opacity = 0.5 + (0.5 * 0.9999) ≈ 0.9999 (nearly 1)

            // Child 0 (furthest): dist=325, normDist=325/500=0.65
            // factor = 1 - 0.65 = 0.35
            // easeFactor = 1 - (1 - 0.35)^3 = 1 - 0.65^3 ≈ 0.725
            // scale = 0.85 + (0.15 * 0.725) ≈ 0.959
            // opacity = 0.5 + (0.5 * 0.725) ≈ 0.86

            // CRITICAL: Verify child 2 (center) has highest values
            const child2Scale = parseFloat(children[2].style.transform.replace('scale(', '').replace(')', ''))
            expect(child2Scale).toBeGreaterThan(0.99) // Nearly 1 (center)

            // Verify child 0 (edge) has lower values
            const child0Scale = parseFloat(children[0].style.transform.replace('scale(', '').replace(')', ''))
            expect(child0Scale).toBeLessThan(child2Scale)
            expect(child0Scale).toBeGreaterThan(0.85) // Above baseScale
            expect(child0Scale).toBeLessThan(1) // Below max

            // Verify opacity values
            const child2Opacity = parseFloat(children[2].style.opacity)
            expect(child2Opacity).toBeGreaterThan(0.99) // Nearly 1 (or exactly 1 due to threshold)

            const child0Opacity = parseFloat(children[0].style.opacity)
            expect(child0Opacity).toBeLessThan(child2Opacity)
            expect(child0Opacity).toBeGreaterThan(0.5) // Above min
        })

        it('should skip scale effect when disabled', () => {
            const { container, children } = createMockContainer(3)
            const options = createDefaultOptions({
                itemsCount: 3,
                disableScaleEffect: true
            })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Transform should remain empty when scale is disabled
            expect(children[0].style.transform).toBe('')
            // But opacity should still be applied
            expect(children[0].style.opacity).not.toBe('')
        })

        it('should skip opacity effect when disabled', () => {
            const { container, children } = createMockContainer(3)
            const options = createDefaultOptions({
                itemsCount: 3,
                disableOpacityEffect: true
            })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Opacity should remain empty when disabled
            expect(children[0].style.opacity).toBe('')
            // But scale should still be applied
            expect(children[0].style.transform).not.toBe('')
        })

        it('should use override scroll value INSTEAD of DOM scrollLeft', () => {
            // This test verifies the override parameter is actually used
            // by setting DOM scrollLeft to a value that would make item 9 centered,
            // but providing an override of 0 which should center item 0-2
            const { container, children } = createMockContainer(10, 150)
            const options = createDefaultOptions({ itemsCount: 10 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Set DOM scrollLeft far to the right (item 9 would be centered)
            container.scrollLeft = 1566 // Item 9 left position

            act(() => {
                result.current.updateCache(container)
                // Pass override scroll value of 0 - should use this, not the DOM value
                result.current.applyVisuals(container, 0)
            })

            // If override is used (scrollLeft=0), items 0-5 are visible
            // If DOM is used (scrollLeft=1566), items 9 would be visible

            // CRITICAL: Item 0 should be visible (styled) because override=0
            expect(children[0].style.transform).not.toBe('')

            // CRITICAL: Item 9 should NOT be visible (outside viewport when scrollLeft=0)
            // Item 9: left=1566, with scrollLeft=0 this is outside viewEnd (1000)
            expect(children[9].style.transform).toBe('')
        })

        it('should NOT apply styles to items outside viewport (culling)', () => {
            // Create many children so some are definitely outside viewport
            // Container: clientWidth=800, VIEW_BUFFER=200
            // Viewport bounds when scrollLeft=0: [-200, 1000]
            // Each child is 166 stride apart
            // Child 6: left=6*166=996, inside viewport when scrollLeft=0 (just barely, viewEnd=1000)
            // Child 7: left=7*166=1162, outside viewport when scrollLeft=0
            const { container, children } = createMockContainer(10, 150)
            const options = createDefaultOptions({ itemsCount: 10 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container, 0) // scrollLeft=0
            })

            // CRITICAL: Items 0-6 should be styled (within viewport + buffer)
            expect(children[0].style.transform).not.toBe('') // left=0, in view
            expect(children[6].style.transform).not.toBe('') // left=996, in view

            // CRITICAL: Items 7+ should NOT be styled (outside viewport)
            // Child 7: left=1162 > viewEnd (800 + 200 = 1000)
            expect(children[7].style.transform).toBe('') // left=1162, outside
            expect(children[9].style.transform).toBe('') // left=1494, outside
        })
    })

    describe('Cache invalidation', () => {
        it('should mark cache dirty when itemsCount changes', () => {
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result, rerender } = renderHook(
                (props) => useCarouselVisuals(props),
                { initialProps: options }
            )

            // Clear dirty flag
            result.current.isCacheDirty.current = false

            // Change itemsCount
            rerender({ ...options, itemsCount: 10 })

            expect(result.current.isCacheDirty.current).toBe(true)
        })
    })

    describe('Container width caching', () => {
        it('should cache container width and mark dirty on init', () => {
            const options = createDefaultOptions()
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Initially dirty and zero
            expect(result.current.isContainerWidthDirty.current).toBe(true)
            expect(result.current.containerWidthRef.current).toBe(0)
        })

        it('should update containerWidthRef and clear dirty flag on applyVisuals', () => {
            const { container } = createMockContainer(5)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // After applyVisuals, container width should be cached and dirty cleared
            expect(result.current.containerWidthRef.current).toBe(800) // from mock
            expect(result.current.isContainerWidthDirty.current).toBe(false)
        })
    })

    describe('Responsive breakpoints', () => {
        it('should use mobile config when window.innerWidth < 640', () => {
            // Mock mobile width
            Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })

            const { container, children } = createMockContainer(5, 150)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Mobile uses baseScale=0.80 (lower than desktop 0.85)
            // Edge items should have lower scale values
            const child0Scale = parseFloat(children[0].style.transform.replace('scale(', '').replace(')', ''))
            // Mobile baseScale is 0.80, edge items at max distance may equal baseScale
            expect(child0Scale).toBeGreaterThanOrEqual(0.80)
            expect(child0Scale).toBeLessThan(1)
        })

        it('should use desktop config when window.innerWidth >= 1024', () => {
            // Mock desktop width
            Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })

            const { container, children } = createMockContainer(5, 150)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Desktop uses baseScale=0.85
            const child0Scale = parseFloat(children[0].style.transform.replace('scale(', '').replace(')', ''))
            expect(child0Scale).toBeGreaterThan(0.85)
            expect(child0Scale).toBeLessThan(1)
        })
    })

    describe('Boundary conditions', () => {
        it('should handle itemsCount = 0 gracefully (no crash)', () => {
            const { container } = createMockContainer(0)
            const options = createDefaultOptions({ itemsCount: 0 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Should not throw
            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Should complete without error
            expect(result.current.childrenPositions.current).toHaveLength(0)
        })

        it('should handle itemsCount = 1 gracefully', () => {
            const { container, children } = createMockContainer(1, 150)
            const options = createDefaultOptions({ itemsCount: 1, bufferBeforeCount: 1 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Single item should be styled
            expect(children[0].style.transform).not.toBe('')
        })

        it('should handle layout with cardWidth = 0 gracefully', () => {
            const { container } = createMockContainer(5, 0)
            const options = createDefaultOptions({
                itemsCount: 5,
                layout: { cardWidth: 0, gap: 0 }
            })
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Should not throw
            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // Should complete without crashing
            expect(result.current.childrenPositions.current).toHaveLength(5)
        })

        it('should handle both effects disabled (early return path)', () => {
            const { container, children } = createMockContainer(5, 150)
            const options = createDefaultOptions({
                itemsCount: 5,
                disableOpacityEffect: true,
                disableScaleEffect: true
            })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            // No styles should be applied when both effects disabled
            expect(children[0].style.transform).toBe('')
            expect(children[0].style.opacity).toBe('')
            // zIndex is also not set in early return
            expect(children[0].style.zIndex).toBe('')
        })
    })

    describe('Visual edge cases', () => {
        it('should handle container width change mid-scroll (dirty flag behavior)', () => {
            const { container, children } = createMockContainer(5, 150)
            const options = createDefaultOptions({ itemsCount: 5 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            // Initial setup
            act(() => {
                result.current.updateCache(container)
                result.current.applyVisuals(container)
            })

            expect(result.current.containerWidthRef.current).toBe(800)
            expect(result.current.isContainerWidthDirty.current).toBe(false)

            // Simulate container resize (window resize scenario)
            Object.defineProperty(container, 'clientWidth', {
                value: 1200,
                writable: true,
                configurable: true
            })

            // Mark dirty (as resize observer would)
            result.current.isContainerWidthDirty.current = true

            // Apply visuals again - should pick up new width
            act(() => {
                result.current.applyVisuals(container)
            })

            // CRITICAL: Container width should be updated
            expect(result.current.containerWidthRef.current).toBe(1200)
            expect(result.current.isContainerWidthDirty.current).toBe(false)
        })

        it('should handle all items outside viewport (empty iteration)', () => {
            const { container, children } = createMockContainer(10, 150)
            const options = createDefaultOptions({ itemsCount: 10 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
            })

            // Scroll far right so all items are to the left of viewport
            // Container is 800px, items are at 0, 174, 348, ... 1566
            // scrollLeft of 5000 puts viewport at [5000, 5800] - all items are outside
            Object.defineProperty(container, 'scrollLeft', {
                value: 5000,
                writable: true,
                configurable: true
            })

            act(() => {
                result.current.applyVisuals(container)
            })

            // CRITICAL: No items should have styles applied (all culled)
            children.forEach((child, i) => {
                expect(child.style.transform).toBe('')
                expect(child.style.opacity).toBe('')
            })
        })

        it('should re-apply styles when items re-enter viewport', () => {
            const { container, children } = createMockContainer(10, 150)
            const options = createDefaultOptions({ itemsCount: 10 })
            const { result } = renderHook(() => useCarouselVisuals(options))

            act(() => {
                result.current.updateCache(container)
            })

            // First: scroll so items are visible
            act(() => {
                result.current.applyVisuals(container, 0)
            })
            expect(children[0].style.transform).not.toBe('')

            // Scroll away (items exit viewport)
            act(() => {
                result.current.applyVisuals(container, 5000)
            })
            // Note: styles may still be set from before, or cleared depending on impl

            // Scroll back (items re-enter viewport)
            act(() => {
                result.current.applyVisuals(container, 0)
            })

            // CRITICAL: Items should have styles re-applied
            expect(children[0].style.transform).not.toBe('')
            expect(children[2].style.transform).not.toBe('')
        })
    })
})



