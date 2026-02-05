import { useRef, useCallback, useEffect, useState } from 'react'
import { LAYOUT_CONFIG, TIMING_CONFIG } from '../config'
import type { CarouselLoggerInstance } from '../logger'

export interface UseCarouselLayoutOptions {
    /** Ref to the scrollable carousel container */
    containerRef: React.RefObject<HTMLDivElement | null>
    /** Callback when layout is measured (for updating visual caches) */
    onLayoutChange?: (layout: { cardWidth: number; gap: number }) => void
    /** Debounce delay for resize handling in ms. Default: 100 */
    resizeDebounceMs?: number
    /** Optional logger for debugging */
    logger?: CarouselLoggerInstance
}

export interface UseCarouselLayoutReturn {
    /** Current layout measurements */
    layout: { cardWidth: number; gap: number; domStride: number }
    /** Computed stride (cardWidth + gap) - fallback if domStride unavailable */
    stride: number
    /** Whether viewport is mobile (< 640px) */
    isMobile: boolean
    /** Whether viewport is tablet (< 1024px but >= 640px) */
    isTablet: boolean
    /** Manually trigger a layout measurement */
    measureLayout: () => { cardWidth: number; gap: number }
    /** Mark layout as dirty (triggers remeasure on next access) */
    invalidateLayout: () => void
    /** 
     * Counter that increments each time ResizeObserver fires.
     * Used to trigger re-checks even when layout values are unchanged.
     */
    resizeCount: number
}

/**
 * Calculate layout measurements from a carousel container element.
 * Reads the first child's width and determines gap based on breakpoint.
 * 
 * @param container - The scrollable carousel container element
 * @returns The measured cardWidth and gap values, or null if children aren't rendered yet
 */
export function measureLayoutFromElement(container: HTMLElement): { cardWidth: number; gap: number; domStride: number } | null {
    const firstCard = container.firstElementChild as HTMLElement
    if (!firstCard) {
        // Children not rendered yet - return null to signal "can't measure"
        return null
    }

    // Use getBoundingClientRect for sub-pixel precision (critical for large buffer accumulative drift)
    const cardWidth = firstCard.getBoundingClientRect().width
    // Use known Tailwind gap values - responsive breakpoint
    const gap = window.innerWidth < LAYOUT_CONFIG.GAP_BREAKPOINT
        ? LAYOUT_CONFIG.GAP_MOBILE
        : LAYOUT_CONFIG.GAP_DESKTOP

    // Measure actual stride from DOM (distance between item centers)
    // This accounts for sub-pixel rendering that may differ from cardWidth + gap
    let domStride = cardWidth + gap // fallback
    const secondCard = container.children[1] as HTMLElement | undefined
    if (secondCard) {
        domStride = secondCard.offsetLeft - firstCard.offsetLeft
    }

    return { cardWidth, gap, domStride }
}

/**
 * Hook that manages carousel layout measurements.
 * Handles:
 * - Initial layout measurement from first card element
 * - Viewport detection (mobile, tablet, desktop)
 * - Resize handling with debouncing
 * - Stride calculation
 */
export function useCarouselLayout({
    containerRef,
    onLayoutChange,
    resizeDebounceMs = TIMING_CONFIG.RESIZE_DEBOUNCE_MS,
    logger,
}: UseCarouselLayoutOptions): UseCarouselLayoutReturn {
    // Layout state - triggers re-render on change
    const [layout, setLayout] = useState<{ cardWidth: number; gap: number; domStride: number }>({
        cardWidth: LAYOUT_CONFIG.INITIAL_CARD_WIDTH,
        gap: LAYOUT_CONFIG.INITIAL_GAP,
        domStride: LAYOUT_CONFIG.INITIAL_CARD_WIDTH + LAYOUT_CONFIG.INITIAL_GAP
    })

    // Counter that increments on each ResizeObserver callback - forces re-render even when values unchanged
    const [resizeCount, setResizeCount] = useState(0)

    // Dirty flag for lazy remeasurement
    const isLayoutDirty = useRef(true)

    // Callback ref to avoid stale closure issues
    const onLayoutChangeRef = useRef(onLayoutChange)
    onLayoutChangeRef.current = onLayoutChange

    // Logger ref to avoid effect re-running when logger changes
    const loggerRef = useRef(logger)
    loggerRef.current = logger

    // Compute stride from layout
    const stride = layout.cardWidth + layout.gap

    // Viewport detection
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    const isTablet = typeof window !== 'undefined' && window.innerWidth >= 640 && window.innerWidth < 1024

    /**
     * Measure layout from container and update state if changed
     */
    const measureLayout = useCallback(() => {
        const el = containerRef.current
        if (!el) {
            logger?.log('LAYOUT', 'No container element')
            return layout
        }

        const measured = measureLayoutFromElement(el)

        // If children aren't rendered yet, return current layout (don't update state)
        if (measured === null) {
            logger?.log('LAYOUT', 'Children not rendered, keeping current layout')
            return layout
        }

        logger?.log('LAYOUT', 'Layout measured', measured)

        // Only update state if values changed (prevents unnecessary re-renders)
        setLayout(prev => {
            if (prev.cardWidth === measured.cardWidth && prev.gap === measured.gap && prev.domStride === measured.domStride) {
                logger?.log('LAYOUT', 'Layout unchanged, skipping update')
                return prev
            }
            logger?.log('LAYOUT', 'Layout changed, updating state', {
                old: prev,
                new: measured
            })
            // Notify subscribers of layout change
            if (onLayoutChangeRef.current) {
                onLayoutChangeRef.current(measured)
            }
            return measured
        })

        isLayoutDirty.current = false
        return measured
    }, [containerRef, layout, logger])

    /**
     * Mark layout as dirty - will trigger remeasure on next access
     */
    const invalidateLayout = useCallback(() => {
        isLayoutDirty.current = true
        logger?.log('LAYOUT', 'Layout marked as dirty')
    }, [logger])

    /**
     * Resize handler - uses ResizeObserver with debouncing
     * Only fires when the container element actually changes size
     */
    // Use ref to avoid effect re-running when measureLayout changes
    const measureLayoutRef = useRef(measureLayout)
    measureLayoutRef.current = measureLayout

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        let timeoutId: NodeJS.Timeout
        let isFirstObservation = true

        const ro = new ResizeObserver(() => {
            // First observation: browser just computed layout, measure immediately
            if (isFirstObservation) {
                isFirstObservation = false
                loggerRef.current?.log('LAYOUT', 'First observation - measuring immediately')
                measureLayoutRef.current()
                // Increment resizeCount to trigger re-render even if values unchanged
                setResizeCount(c => c + 1)
                return
            }

            // Subsequent observations: debounce for stability
            clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
                loggerRef.current?.log('LAYOUT', 'Container resized, remeasuring layout')
                measureLayoutRef.current()
                setResizeCount(c => c + 1)
            }, resizeDebounceMs)
        })

        ro.observe(el)
        loggerRef.current?.log('LAYOUT', 'ResizeObserver attached')

        return () => {
            ro.disconnect()
            clearTimeout(timeoutId)
            loggerRef.current?.log('LAYOUT', 'ResizeObserver disconnected')
        }
    }, [containerRef, resizeDebounceMs])

    return {
        layout,
        stride,
        isMobile,
        isTablet,
        measureLayout,
        invalidateLayout,
        resizeCount,
    }
}
