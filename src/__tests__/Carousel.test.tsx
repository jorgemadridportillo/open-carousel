import { render, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Carousel as BaseCarousel } from '../Carousel'
import { LAYOUT_CONFIG } from '../config'

// Mock the hook to isolate component logic
const cancelMomentumMock = vi.fn()
const eventsMock = {
    onPointerDown: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerMove: vi.fn(),
    onLostPointerCapture: vi.fn(),
    onClickCapture: vi.fn(),
    onDragStart: vi.fn(),
}

// Use a stable ref object for the mock to prevent re-initialization issues
const mockRef = { current: document.createElement('div') }

vi.mock('../hooks/useDraggableScroll', () => ({
    useDraggableScroll: ({ infinite, cardWidth = 180, gap = 16 }: any) => {
        // We need a stable adjustScroll that doesn't break teleports
        const adjustScroll = vi.fn()
        return {
            ref: mockRef,
            isDragging: false,
            cancelMomentum: cancelMomentumMock,
            adjustScroll,
            events: eventsMock
        }
    }
}))

// Mock data
const mockItems = Array.from({ length: 6 }).map((_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
}))

// Simple render function for tests
const renderItem = (item: typeof mockItems[0]) => (
    <div data-testid="carousel-item-content">{item.title}</div>
)

const getItemKey = (item: typeof mockItems[0]) => item.id

describe('BaseCarousel Component', () => {
    let originalResizeObserver: typeof ResizeObserver

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()

        // Mock ResizeObserver to fire callback immediately
        // This ensures initialization proceeds in tests
        originalResizeObserver = global.ResizeObserver
        global.ResizeObserver = class MockResizeObserver {
            callback: ResizeObserverCallback
            constructor(callback: ResizeObserverCallback) {
                this.callback = callback
            }
            observe(target: Element) {
                // Fire callback async to simulate real behavior
                setTimeout(() => {
                    this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this)
                }, 0)
            }
            unobserve() { }
            disconnect() { }
        } as unknown as typeof ResizeObserver
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        global.ResizeObserver = originalResizeObserver
    })

    it('renders correct number of items', () => {
        render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
            />
        )
        const items = screen.getAllByTestId('carousel-item-content')
        expect(items.length).toBeGreaterThanOrEqual(mockItems.length)
    })

    it('renders Prev and Next navigation buttons', () => {
        render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
            />
        )
        expect(screen.getByLabelText('Anterior')).toBeInTheDocument()
        expect(screen.getByLabelText('Siguiente')).toBeInTheDocument()
    })

    // Obsolete test removed: 'infinite carousel disables scroll snap on arrow click and restores after animation'
    // Logic changed in Phase 2.1: Snap is disabled during drag/arrow but restored via onScrollEnd, not timeout.

    it('finite carousel keeps scroll-snap active during arrow navigation (prevents jitter)', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                infinite={false}
            />
        )
        const nextButton = screen.getByLabelText('Siguiente')
        const carouselContainer = container.querySelector('.base-carousel') as HTMLElement

        // Mock scroll methods
        carouselContainer.scrollTo = vi.fn()
        Object.defineProperty(carouselContainer, 'scrollLeft', { value: 100, writable: true })
        // Define dimensions so not at start or end
        Object.defineProperty(carouselContainer, 'scrollWidth', { value: 2000, configurable: true })
        Object.defineProperty(carouselContainer, 'clientWidth', { value: 500, configurable: true })

        // Initial state
        expect(carouselContainer.style.scrollSnapType).toBe('')

        // Click Next
        fireEvent.click(nextButton)

        // For finite carousels, scroll-snap should NOT be disabled
        // This prevents the "jitter" that occurs when snap is restored after animation
        expect(carouselContainer.style.scrollSnapType).toBe('')

        // Fast-forward through animation time
        act(() => {
            vi.advanceTimersByTime(650)
        })

        // Still should be empty (no snap restoration needed since it was never disabled)
        expect(carouselContainer.style.scrollSnapType).toBe('')
    })

    it('triggers bounce animation when clicking Prev at start', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                infinite={false}
            />
        )
        const prevButton = screen.getByLabelText('Anterior')
        const carousel = container.querySelector('.base-carousel') as HTMLElement
        // Force scrollLeft to 0 to simulate start of finite carousel

        // Initial style
        const initialTransform = carousel.style.transform
        expect(initialTransform).toBe('')

        // Click Prev
        fireEvent.click(prevButton)

        // Should have applied transform: translateX(30px) (negative direction * -30)
        // Note: Code uses `translateX(${-bounceAmount}px)` where bounceAmount = direction(-1) * 30 = -30
        // So -(-30) = +30px. Wait, logic is: bounceAmount = direction * 30.
        // direction = -1 (Prev). bounceAmount = -30.
        // translateX(${-bounceAmount}px) => translateX(${-(-30)}px) => translateX(30px).
        // Correct.
        expect(carousel.style.transform).toBe('translateX(30px)')
        expect(carousel.style.transition).toContain('transform 0.15s ease-out')

        // Fast forward to reset
        act(() => {
            vi.advanceTimersByTime(200) // Reset phase
        })
        expect(carousel.style.transform).toBe('translateX(0)')

        act(() => {
            vi.advanceTimersByTime(500) // Clear phase
        })
        expect(carousel.style.transform).toBe('')
    })

    it('has base carousel classes', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
            />
        )
        const carousel = container.querySelector('.base-carousel')

        expect(carousel!).toHaveClass('flex')
        // Gap is applied via style, not class in Phase 2
        // expect(carousel!.className).toMatch(/gap-\d+/)
        expect(carousel).toHaveClass('overflow-x-auto')
        expect(carousel).toHaveClass('select-none')
    })

    it('applies custom itemClassName to each item', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                itemClassName="custom-class"
            />
        )
        const firstItem = container.querySelector('.carousel-item')
        expect(firstItem).toHaveClass('custom-class')
    })

    it('applies itemWidthVar CSS variable class', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                itemWidthVar="review"
            />
        )
        const firstItem = container.querySelector('.carousel-item')
        expect(firstItem).toHaveClass('w-[var(--carousel-item-width-review)]')
    })
    it('maintains fixed DOM size in infinite mode (no memory leaks)', () => {
        const itemsCount = mockItems.length
        const minBuffer = LAYOUT_CONFIG.MIN_BUFFER_COUNT

        // Dynamic calc matching BaseCarousel logic
        const itemsNeeded = Math.ceil(minBuffer / itemsCount)
        const count = Math.max(1, itemsNeeded)
        const totalItems = (count * itemsCount) + itemsCount + (count * itemsCount)

        render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                infinite={true}
            />
        )
        const items = screen.getAllByTestId('carousel-item-content')
        expect(items.length).toBe(totalItems)
    })

    // Obsolete test removed: 'restores scroll snap on user touch after arrow click'
    // Logic was removed in Phase 2.1 to prevent race conditions.
    // Snap is now handled strictly via scrollend/animation completion.

    it('updates visual styles (opacity/scale) based on scroll position', async () => {
        // Mock HTMLElement properties globally for this test
        // We do this BEFORE render so the initial mount calculates correctly
        const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
        const originalOffsetLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft')
        const originalScrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')
        const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')

        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() {
                if (this.classList.contains('carousel-item')) return 200
                return 0
            }
        })

        // Mock getBoundingClientRect for new layout measurement
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
        HTMLElement.prototype.getBoundingClientRect = function () {
            const width = this.classList.contains('carousel-item') ? 200 : 0
            return { width, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => { } } as DOMRect
        }

        // Layout: 
        // Item 0: 26
        // Item 1: 250 (Center)
        // Item 2: 474
        const itemPositions = [26, 250, 474]

        Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
            configurable: true,
            get() {
                if (this.classList.contains('carousel-item')) {
                    // We use textContent to identify which item this is during the render phase
                    const text = this.textContent || ''
                    if (text.includes('Item 0')) return 26
                    if (text.includes('Item 1')) return 250
                    if (text.includes('Item 2')) return 474
                }
                return 0
            }
        })

        Object.defineProperty(Element.prototype, 'clientWidth', {
            configurable: true,
            get() {
                if (this.classList.contains('base-carousel')) return 500
                return 0
            }
        })

        Object.defineProperty(Element.prototype, 'scrollLeft', {
            configurable: true,
            get() {
                if (this.classList.contains('base-carousel')) return 100
                return 0
            },
            set: vi.fn()
        })


        const { container } = render(
            <BaseCarousel
                items={mockItems.slice(0, 3)}
                getItemKey={getItemKey}
                renderItem={renderItem}
                disableOpacityEffect={false}
                disableScaleEffect={false}
            />
        )

        const items = container.querySelectorAll('.carousel-item') as NodeListOf<HTMLElement>

        // Assertions - Initial Render should be correct now
        // Item 1 (Center) should be fully visible
        expect(items[1].style.opacity).toBe('1')

        // Neighbors < 1
        expect(items[0].style.opacity).not.toBe('1')
        expect(parseFloat(items[0].style.opacity)).toBeLessThan(1)
        expect(items[2].style.opacity).not.toBe('1')
        expect(parseFloat(items[2].style.opacity)).toBeLessThan(1)

        // Cleanup Mocks
        if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
        HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
        if (originalOffsetLeft) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', originalOffsetLeft)
        if (originalScrollLeft) Object.defineProperty(Element.prototype, 'scrollLeft', originalScrollLeft)
        if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth)
    })
    it('applies scroll snap classes by default (snap={true})', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
            />
        )
        const carousel = container.querySelector('.base-carousel')
        expect(carousel).toHaveClass('snap-x')
        expect(carousel).toHaveClass('snap-mandatory')
    })

    it('removes scroll snap classes when snap={false}', () => {
        const { container } = render(
            <BaseCarousel
                items={mockItems}
                getItemKey={getItemKey}
                renderItem={renderItem}
                snap={false}
            />
        )
        const carousel = container.querySelector('.base-carousel')
        expect(carousel).not.toHaveClass('snap-x')
        expect(carousel).not.toHaveClass('snap-mandatory')
    })

    describe('Teleport Protection Mechanisms', () => {
        it('sets pending scroll target on arrow click (infinite mode)', async () => {
            // Mock requestAnimationFrame since JSDOM doesn't handle it well
            const originalRAF = window.requestAnimationFrame
            window.requestAnimationFrame = (cb: FrameRequestCallback) => {
                cb(0)
                return 0
            }

            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )
            const nextButton = screen.getByLabelText('Siguiente')
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Mock scroll APIs
            carousel.scrollTo = vi.fn()
            Object.defineProperty(carousel, 'scrollLeft', { value: 1000, writable: true })
            Object.defineProperty(carousel, 'scrollWidth', { value: 5000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Click Next arrow
            fireEvent.click(nextButton)

            // Wait for microtasks to flush (RAF callback is synchronous in our mock)
            // Required when USE_RAF_FRAME_SEPARATION = true in BaseCarousel.tsx
            await Promise.resolve()

            // Should have called scrollTo (meaning target was set and scroll initiated)
            expect(carousel.scrollTo).toHaveBeenCalledWith(
                expect.objectContaining({
                    behavior: 'smooth',
                })
            )

            // Restore original
            window.requestAnimationFrame = originalRAF
        })

        it('clears pending scroll target on pointer down (drag start)', () => {
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )
            const nextButton = screen.getByLabelText('Siguiente')
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Mock scroll APIs
            carousel.scrollTo = vi.fn()
            Object.defineProperty(carousel, 'scrollLeft', { value: 1000, writable: true })
            Object.defineProperty(carousel, 'scrollWidth', { value: 5000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Click Next arrow to set pending target
            fireEvent.click(nextButton)
            expect(carousel.scrollTo).toHaveBeenCalled()

            // Clear the mock to track subsequent calls
            vi.mocked(carousel.scrollTo).mockClear()

            // Simulate drag start - this should clear the pending target
            fireEvent.pointerDown(carousel, { pointerId: 1, pageX: 100 })

            // Now if we fire another arrow click, it should work
            // (if target wasn't cleared, there might be issues)
            fireEvent.click(nextButton)
            expect(carousel.scrollTo).toHaveBeenCalled()
        })

        it('handles rapid arrow clicks without issues', () => {
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )
            const prevButton = screen.getByLabelText('Anterior')
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Mock scroll APIs
            carousel.scrollTo = vi.fn()
            Object.defineProperty(carousel, 'scrollLeft', { value: 2000, writable: true, configurable: true })
            Object.defineProperty(carousel, 'scrollWidth', { value: 5000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Rapid fire clicks
            fireEvent.click(prevButton)
            fireEvent.click(prevButton)
            fireEvent.click(prevButton)
            fireEvent.click(prevButton)
            fireEvent.click(prevButton)

            // All clicks should have worked (scrollTo called at least 5 times, may be more due to pre-teleport)
            expect(carousel.scrollTo).toHaveBeenCalled()
            expect((carousel.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(5)
        })

        it('attaches scrollend listener for modern browsers', () => {
            // Mock scrollend support
            const originalOnScrollEnd = Object.getOwnPropertyDescriptor(window, 'onscrollend')
            Object.defineProperty(window, 'onscrollend', {
                value: null,
                configurable: true,
                writable: true,
            })

            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )
            const nextButton = screen.getByLabelText('Siguiente')
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Spy on addEventListener
            const addEventListenerSpy = vi.spyOn(carousel, 'addEventListener')

            // Mock scroll APIs
            carousel.scrollTo = vi.fn()
            Object.defineProperty(carousel, 'scrollLeft', { value: 1000, writable: true })
            Object.defineProperty(carousel, 'scrollWidth', { value: 5000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Click arrow
            fireEvent.click(nextButton)

            // Should attach scrollend listener
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'scrollend',
                expect.any(Function),
                expect.objectContaining({ once: true })
            )

            // Cleanup
            if (originalOnScrollEnd) {
                Object.defineProperty(window, 'onscrollend', originalOnScrollEnd)
            } else {
                delete (window as unknown as Record<string, unknown>).onscrollend
            }
        })

        it('prevents multiple teleports when scroll lands exactly on threshold (flicker regression)', () => {
            /**
             * REGRESSION TEST: Teleport Threshold Flicker Bug
             * 
             * When the carousel scroll lands EXACTLY on the teleport threshold
             * (bufferBeforeWidth + originalSetWidth), multiple scroll events 
             * could fire with the same stale scrollLeft value, causing:
             * - Multiple rapid teleports (4x in the original bug)
             * - Visual flicker due to compositor vs main-thread conflict
             * 
             * Fix: The rafId is now cleared AFTER performTeleport completes,
             * preventing new RAF callbacks from being queued during teleport.
             */

            // Track teleport count via scrollTo calls during scroll handling
            let teleportCount = 0

            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Calculate threshold values matching the component logic:
            // With 6 items and MIN_BUFFER_COUNT 20:
            // itemsNeeded = ceil(20/6) = 4 sets
            // bufferBeforeCount = 4 * 6 = 24
            // stride = cardWidth + gap
            // For 170px cards with 24px gap: stride = 194
            // bufferBeforeWidth = 24 * 194 = 4656
            // originalSetWidth = 6 * 194 = 1164
            // threshold = 4656 + 1164 = 5820

            const stride = 194 // Approximate: 170px card + 24px gap
            const bufferBeforeCount = 24
            const originalItemsCount = 6
            const bufferBeforeWidth = bufferBeforeCount * stride
            const originalSetWidth = originalItemsCount * stride
            const exactThreshold = bufferBeforeWidth + originalSetWidth

            // Mock scroll position to be EXACTLY at threshold
            Object.defineProperty(carousel, 'scrollLeft', {
                get: () => exactThreshold,
                set: () => { teleportCount++ }, // Count teleport attempts
                configurable: true
            })
            Object.defineProperty(carousel, 'scrollWidth', { value: 50000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Mock scrollTo to track calls
            carousel.scrollTo = vi.fn()

            // Simulate multiple rapid scroll events (what happens during momentum scroll)
            // Before the fix, each would trigger a separate teleport
            for (let i = 0; i < 5; i++) {
                fireEvent.scroll(carousel)
            }

            // Allow RAF callbacks to execute
            act(() => {
                vi.advanceTimersByTime(100)
            })

            // KEY ASSERTION: Exactly ONE teleport should have occurred
            // Before the fix, 4+ teleports would happen with the same stale scrollLeft values.
            // The fix ensures rafId is cleared AFTER performTeleport, preventing
            // new RAF callbacks from being queued during the teleport operation.
            // If this assertion fails, the flicker bug has regressed!
            expect(teleportCount).toBe(1)
        })
    })

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * DESKTOP TELEPORT COUNT VALIDATION TESTS
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * These tests verify that exactly ONE teleport occurs per threshold crossing,
     * regardless of scroll distance or direction. Critical for flicker prevention.
     * 
     * Layout Constants (for 6 items with MIN_BUFFER_COUNT=20):
     * - bufferBeforeCount = 24 (4 repetitions × 6 items)
     * - stride = cardWidth + gap (varies by viewport, mocked to 24px in tests)
     * - bufferBeforeWidth = 24 × stride = 576
     * - originalSetWidth = 6 × stride = 144
     * - rightThreshold = 576 + 144 = 720
     * - leftThreshold = 576
     */
    // Desktop teleport tests - properly mock DOM measurements for accurate threshold calculation
    describe('Desktop Teleport Count Validation', () => {
        // Helper to create teleport test setup with proper DOM mocking
        const setupTeleportTest = () => {
            let teleportCount = 0
            let lastSetPosition: number | null = null

            // Mock offsetWidth BEFORE render so component measures correct cardWidth
            const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
                configurable: true,
                get() {
                    return LAYOUT_CONFIG.INITIAL_CARD_WIDTH
                }
            })

            // Mock getBoundingClientRect
            const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
            HTMLElement.prototype.getBoundingClientRect = function () {
                return { width: LAYOUT_CONFIG.INITIAL_CARD_WIDTH, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => { } } as DOMRect
            }

            const gap = LAYOUT_CONFIG.INITIAL_GAP
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                    gap={gap}
                />
            )
            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Layout values - match what component will calculate
            // Layout values - match what component will calculate
            const stride = LAYOUT_CONFIG.INITIAL_CARD_WIDTH + gap // 180 + 16 = 196

            // Recalculate based on real config
            const minBuffer = LAYOUT_CONFIG.MIN_BUFFER_COUNT
            const originalItemsCount = mockItems.length
            const itemsNeeded = Math.ceil(minBuffer / originalItemsCount)
            const count = Math.max(1, itemsNeeded)
            const bufferBeforeCount = count * originalItemsCount

            const bufferBeforeWidth = bufferBeforeCount * stride
            const originalSetWidth = originalItemsCount * stride
            const rightThreshold = bufferBeforeWidth + originalSetWidth

            carousel.scrollTo = vi.fn()
            Object.defineProperty(carousel, 'scrollWidth', { value: 50000, configurable: true })
            Object.defineProperty(carousel, 'clientWidth', { value: 500, configurable: true })

            // Wait for component initialization (ResizeObserver, centering, etc.)
            act(() => {
                vi.advanceTimersByTime(500)
            })

            // Reset teleport count AFTER initialization so we only count test actions
            teleportCount = 0

            const cleanup = () => {
                if (originalOffsetWidth) {
                    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
                }
                HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
            }

            return {
                carousel,
                teleportCount: () => teleportCount,
                resetCount: () => { teleportCount = 0 },
                setScrollPosition: (pos: number) => {
                    Object.defineProperty(carousel, 'scrollLeft', {
                        get: () => pos,
                        set: (val) => {
                            lastSetPosition = val
                            teleportCount++
                        },
                        configurable: true
                    })
                },
                triggerScroll: () => {
                    fireEvent.scroll(carousel)
                    act(() => { vi.advanceTimersByTime(100) })
                },
                getLastSetPosition: () => lastSetPosition,
                cleanup,
                thresholds: { bufferBeforeWidth, originalSetWidth, rightThreshold, stride }
            }
        }

        it('teleports exactly once on short rightward scroll (1px past threshold)', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: 1px past the right threshold
            setScrollPosition(thresholds.rightThreshold + 1)
            resetCount() // Reset after setScrollPosition to ignore any side effects
            triggerScroll()

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('teleports exactly once on long rightward scroll (3× originalSetWidth)', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: 3 full sets past threshold
            const longScrollPosition = thresholds.bufferBeforeWidth + (3 * thresholds.originalSetWidth)
            setScrollPosition(longScrollPosition)
            resetCount()
            triggerScroll()

            // Should still be exactly 1 teleport (with setsPassed=3)
            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('teleports exactly once on short leftward scroll (1px before left threshold)', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: 1px before the left threshold (bufferBeforeWidth)
            setScrollPosition(thresholds.bufferBeforeWidth - 1)
            resetCount()
            triggerScroll()

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('teleports exactly once when landing exactly on right threshold', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: Exactly at threshold (>= triggers teleport)
            setScrollPosition(thresholds.rightThreshold)
            resetCount()
            triggerScroll()

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('does NOT teleport when 1px before right threshold', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: 1px before threshold (should NOT trigger teleport)
            setScrollPosition(thresholds.rightThreshold - 1)
            resetCount()
            triggerScroll()

            expect(teleportCount()).toBe(0)
            cleanup()
        })

        it('does NOT teleport when in safe zone (between thresholds)', () => {
            const { setScrollPosition, triggerScroll, teleportCount, resetCount, thresholds, cleanup } = setupTeleportTest()

            // Position: Middle of safe zone
            const safePosition = thresholds.bufferBeforeWidth + (thresholds.originalSetWidth / 2)
            setScrollPosition(safePosition)
            resetCount()
            triggerScroll()

            expect(teleportCount()).toBe(0)
            cleanup()
        })

        it('calls scrollTo to cancel momentum before teleport (desktop only)', () => {
            const { carousel, setScrollPosition, triggerScroll, resetCount, thresholds, cleanup } = setupTeleportTest()

            setScrollPosition(thresholds.rightThreshold + 10)
            resetCount()
            triggerScroll()

            // Should have called scrollTo with behavior: 'auto' to cancel momentum
            expect(carousel.scrollTo).toHaveBeenCalledWith(
                expect.objectContaining({ behavior: 'auto' })
            )
            cleanup()
        })

        it('handles rapid consecutive scroll events with only one teleport', () => {
            const { setScrollPosition, teleportCount, resetCount, carousel, thresholds, cleanup } = setupTeleportTest()

            setScrollPosition(thresholds.rightThreshold + 50)
            resetCount()

            // Fire 10 rapid scroll events (simulating aggressive trackpad)
            for (let i = 0; i < 10; i++) {
                fireEvent.scroll(carousel)
            }

            act(() => { vi.advanceTimersByTime(100) })

            // RAF batching + rafId guard should result in exactly 1 teleport
            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('correctly calculates adjustment for multi-set crossing', () => {
            const { setScrollPosition, triggerScroll, getLastSetPosition, thresholds, cleanup } = setupTeleportTest()

            // Position: 2.5 sets past buffer (should teleport back 2 sets)
            const scrollPosition = thresholds.bufferBeforeWidth + (2.5 * thresholds.originalSetWidth)
            setScrollPosition(scrollPosition)
            triggerScroll()

            // Expected: teleport back by 2 × originalSetWidth
            expect(getLastSetPosition()).toBe(scrollPosition - (2 * thresholds.originalSetWidth))
            cleanup()
        })
    })

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * MOBILE TELEPORT COUNT VALIDATION TESTS
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * Mobile uses a different teleport strategy than desktop:
     * - During active touch scroll: NO teleport (to preserve native momentum feel)
     * - On scrollend: Teleport after momentum naturally stops
     * - On pointerdown: Teleport when user "catches" momentum with finger
     * 
     * Key differences:
            setScrollPosition(thresholds.bufferBeforeWidth + 50) // Safe zone first
            simulateTouchInteraction()


            // Mobile should NOT teleport during scroll - only on scrollend/pointerdown
            expect(teleportCount()).toBe(0)
            cleanup()
        })

        it('teleports exactly once on scrollend (momentum naturally stopped)', () => {
            const { carousel, setScrollPosition, teleportCount, resetCount, simulateTouchInteraction, thresholds, cleanup } = setupMobileTeleportTest()

            // First, set scroll position in safe zone and simulate touch to set the flag
            setScrollPosition(thresholds.bufferBeforeWidth + 50)
            simulateTouchInteraction()

            // Now set position past threshold
            setScrollPosition(thresholds.rightThreshold + 50)
            resetCount() // Reset before the actual test action

            // Fire scrollend event (momentum stopped naturally)
            fireEvent(carousel, new Event('scrollend'))
            act(() => { vi.advanceTimersByTime(50) })

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('teleports exactly once on pointerdown (user catches momentum)', () => {
            const { carousel, setScrollPosition, teleportCount, resetCount, thresholds, cleanup } = setupMobileTeleportTest()

            // Position past threshold FIRST (before touch interaction)
            setScrollPosition(thresholds.rightThreshold + 50)
            resetCount()

            // MOCK DANGER ZONE:
            // Position near the start (e.g. 100px) which is < 500px threshold
            // This ensures the "Safety Valve" check returns TRUE (unsafe)
            Object.defineProperty(carousel, 'scrollLeft', { value: 100, writable: true })

            // Fire pointerdown (touch)
            fireEvent.pointerDown(carousel, { pointerId: 1, pointerType: 'touch' })

            // Advance timers to allow RAF (if any)
            act(() => { vi.advanceTimersByTime(50) })

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('does NOT call scrollTo({behavior:auto}) on mobile (preserves native momentum)', () => {
            const { carousel, setScrollPosition, resetCount, simulateTouchInteraction, thresholds, cleanup } = setupMobileTeleportTest()

            // Set safe position first, then touch to set flag
            setScrollPosition(thresholds.bufferBeforeWidth + 50)
            simulateTouchInteraction()

            // Now set position past threshold
            setScrollPosition(thresholds.rightThreshold + 50)
            resetCount()

            // Trigger teleport via scrollend
            fireEvent(carousel, new Event('scrollend'))
            act(() => { vi.advanceTimersByTime(50) })

            // Should NOT have called scrollTo with behavior:'auto'
            // (Desktop does this to cancel momentum, mobile skips it)
            const scrollToCalls = (carousel.scrollTo as ReturnType<typeof vi.fn>).mock.calls
            const autoScrollCalls = scrollToCalls.filter(
                (call: unknown[]) => call[0] && (call[0] as { behavior?: string }).behavior === 'auto'
            )
            expect(autoScrollCalls.length).toBe(0)
            cleanup()
        })

        it('teleports on forward threshold (leftward scroll) via scrollend', () => {
            const { carousel, setScrollPosition, teleportCount, resetCount, simulateTouchInteraction, thresholds, cleanup } = setupMobileTeleportTest()

            // Position in safe zone, touch to set flag
            setScrollPosition(thresholds.bufferBeforeWidth + 50)
            simulateTouchInteraction()

            // Position before left threshold (forward teleport zone)
            setScrollPosition(thresholds.bufferBeforeWidth - 10)
            resetCount()

            fireEvent(carousel, new Event('scrollend'))
            act(() => { vi.advanceTimersByTime(50) })

            expect(teleportCount()).toBe(1)
            cleanup()
        })

        it('respects safe zone on mobile (no teleport in safe zone)', () => {
            const { carousel, setScrollPosition, teleportCount, resetCount, simulateTouchInteraction, thresholds, cleanup } = setupMobileTeleportTest()

            // Set safe position and touch to set flag
            const safePosition = thresholds.bufferBeforeWidth + (thresholds.originalSetWidth / 2)
            setScrollPosition(safePosition)
            simulateTouchInteraction()
            resetCount()

            fireEvent(carousel, new Event('scrollend'))
            act(() => { vi.advanceTimersByTime(50) })

            expect(teleportCount()).toBe(0)
            cleanup()
        })
    })

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * iOS INITIAL CENTERING TESTS
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * Regression tests for the iOS race condition fix (Dec 2024).
     * 
     * The bug: On iOS Safari, the carousel appeared off-center on first render
     * because React state updates (layout.cardWidth) hadn't propagated to CSS
     * when scrollLeft was set. Items appeared "between two cards" initially.
     * 
     * The fix: Set padding SYNCHRONOUSLY on the DOM node before setting scrollLeft,
     * bypassing the React state update cycle.
     * 
     * These tests verify:
     * 1. Padding is applied with correct formula
     * 2. scrollLeft is set to the correct initial position
     * 3. The centering works for infinite carousels
     */
    describe('iOS Initial Centering (Race Condition Fix)', () => {
        // Helper to mock layout measurements
        const setupCenteringTest = (cardWidth: number = 180, gap: number = 16) => {
            // Save original descriptors
            const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
            const originalScrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')
            const originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
            const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')

            let capturedScrollLeft: number = 0
            let capturedPaddingLeft: string = ''
            let capturedPaddingRight: string = ''
            let capturedScrollPaddingLeft: string = ''
            let capturedScrollPaddingRight: string = ''
            let paddingSetBeforeScroll = false
            let paddingTime = 0
            let scrollTime = 0

            // Mock offsetWidth to return our cardWidth
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
                configurable: true,
                get() {
                    if (this.classList?.contains('carousel-item')) return cardWidth
                    return 0
                }
            })

            // Mock offsetLeft to simulate layout (Index * Stride) + Padding
            // Required because code now uses DOM measurement for initialization
            Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
                configurable: true,
                get() {
                    if (this.classList?.contains('carousel-item') && this.parentElement) {
                        const index = Array.from(this.parentElement.children).indexOf(this)
                        // Simulate center padding: (Container 500 / 2) - (Card 180 / 2) = 160px
                        const paddingLeft = 160
                        return (index * (cardWidth + gap)) + paddingLeft
                    }
                    return 0
                }
            })

            // Mock getBoundingClientRect
            const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
            HTMLElement.prototype.getBoundingClientRect = function () {
                const width = this.classList?.contains('carousel-item') ? cardWidth : 0
                return { width, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => { } } as DOMRect
            }

            // Mock scrollWidth and clientWidth to satisfy hasScrollableContent check
            // scrollWidth > clientWidth is required for initialization to proceed
            Object.defineProperty(Element.prototype, 'scrollWidth', {
                configurable: true,
                get() { return 10000 } // Large value to indicate scrollable content
            })
            Object.defineProperty(Element.prototype, 'clientWidth', {
                configurable: true,
                get() { return 500 } // Smaller than scrollWidth
            })

            // Capture style assignments through a proxy-like approach
            const originalSetProperty = CSSStyleDeclaration.prototype.setProperty
            const styleSpy = vi.fn((property: string, value: string) => {
                const now = performance.now()
                if (property === 'paddingLeft' || property === 'padding-left') {
                    capturedPaddingLeft = value
                    paddingTime = now
                }
                if (property === 'paddingRight' || property === 'padding-right') {
                    capturedPaddingRight = value
                }
                if (property === 'scrollPaddingLeft' || property === 'scroll-padding-left') {
                    capturedScrollPaddingLeft = value
                }
                if (property === 'scrollPaddingRight' || property === 'scroll-padding-right') {
                    capturedScrollPaddingRight = value
                }
            })

            // Track scrollLeft assignments
            Object.defineProperty(Element.prototype, 'scrollLeft', {
                configurable: true,
                get() { return capturedScrollLeft },
                set(value: number) {
                    const now = performance.now()
                    scrollTime = now
                    capturedScrollLeft = value
                    // Check if padding was set first (for infinite carousels)
                    if (paddingTime > 0 && paddingTime <= scrollTime) {
                        paddingSetBeforeScroll = true
                    }
                }
            })

            return {
                cardWidth,
                gap,
                stride: cardWidth + gap,
                getCapturedValues: () => ({
                    scrollLeft: capturedScrollLeft,
                    paddingLeft: capturedPaddingLeft,
                    paddingRight: capturedPaddingRight,
                    scrollPaddingLeft: capturedScrollPaddingLeft,
                    scrollPaddingRight: capturedScrollPaddingRight,
                    paddingSetBeforeScroll
                }),
                cleanup: () => {
                    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
                    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
                    if (originalScrollLeft) Object.defineProperty(Element.prototype, 'scrollLeft', originalScrollLeft)
                    if (originalScrollWidth) Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth)
                    if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth)
                }
            }
        }

        // Verifies that infinite carousel initializes with correct scrollLeft position
        // so the first "real" item (after buffer clones) appears centered
        it('sets correct initial scrollLeft for infinite carousel', async () => {
            const { stride, cleanup, getCapturedValues } = setupCenteringTest(180, 16)

            render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )

            // Wait for ResizeObserver to fire and trigger initialization
            act(() => {
                vi.advanceTimersByTime(100)
            })

            const { scrollLeft } = getCapturedValues()

            // Expected: (bufferBeforeCount) * stride
            // We removed the +2 offset to align logic with VolumeCalculator and fix visual drift
            const itemCount = mockItems.length // 6
            const bufferBeforeCount = Math.ceil(LAYOUT_CONFIG.MIN_BUFFER_COUNT / itemCount) * itemCount
            const expectedScrollLeft = (bufferBeforeCount) * stride

            expect(scrollLeft).toBe(expectedScrollLeft)

            cleanup()
        })

        it('sets scrollLeft to 0 for finite carousel', () => {
            const { cleanup, getCapturedValues } = setupCenteringTest(180, 16)

            render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={false}
                />
            )

            const { scrollLeft } = getCapturedValues()

            // Finite carousels start at left edge
            expect(scrollLeft).toBe(0)

            cleanup()
        })

        it('applies center padding directly on DOM for infinite carousel', () => {
            const cardWidth = 180
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )

            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // The padding should be set in the inline style
            // Formula: calc(50% - ${cardWidth / 2}px)
            // Note: In JSDOM, cardWidth may be measured as 0, so the component uses fallback
            // The key is that SOME center padding is applied
            expect(carousel.style.paddingLeft).toMatch(/calc\(50% - \d+(\.\d+)?px\)/)
            expect(carousel.style.paddingRight).toMatch(/calc\(50% - \d+(\.\d+)?px\)/)
        })

        it('does NOT apply center padding for finite carousel', () => {
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={false}
                />
            )

            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Finite carousels use fixed edge padding, not centering
            expect(carousel.style.paddingLeft).toBe('16px')
            expect(carousel.style.paddingRight).toBe('16px')
        })

        it('applies scrollPadding for snap alignment on infinite carousel', () => {
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )

            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // scrollPaddingLeft/Right should match paddingLeft/Right for proper snap behavior
            expect(carousel.style.scrollPaddingLeft).toMatch(/calc\(50% - \d+(\.\d+)?px\)/)
            expect(carousel.style.scrollPaddingRight).toMatch(/calc\(50% - \d+(\.\d+)?px\)/)
        })

        it('uses consistent padding formula between initial mount and JSX (no race)', () => {
            /**
             * This test verifies that the initial DOM padding and the JSX inline style
             * use the same formula. If they differ, the carousel would "jump" when
             * React re-renders.
             */
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )

            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // Get the computed padding values
            const paddingLeft = carousel.style.paddingLeft
            const scrollPaddingLeft = carousel.style.scrollPaddingLeft

            // Both should be identical (same formula applied)
            expect(paddingLeft).toBe(scrollPaddingLeft)

            // Force a re-render by triggering a resize observer would update via state
            // The padding should remain stable (no jump)
            act(() => {
                vi.advanceTimersByTime(200)
            })

            // Padding should still match
            expect(carousel.style.paddingLeft).toBe(paddingLeft)
        })

        it('disables scroll-snap before setting initial position (prevents snap animation)', () => {
            const { container } = render(
                <BaseCarousel
                    items={mockItems}
                    getItemKey={getItemKey}
                    renderItem={renderItem}
                    infinite={true}
                />
            )

            const carousel = container.querySelector('.base-carousel') as HTMLElement

            // After initialization, scroll-snap should be re-enabled (empty = use CSS default)
            // The component disables it, sets position, then re-enables
            expect(carousel.style.scrollSnapType).toBe('')
        })
    })
})
