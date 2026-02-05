import { useRef, useCallback } from 'react'
import { LAYOUT_CONFIG, TIMING_CONFIG, FEATURE_FLAGS } from '../config'
import { useScrollCompletion } from './useScrollCompletion'
import type { UseCarouselCoordinatorReturn } from './useCarouselCoordinator'
import type { CarouselLoggerInstance } from '../logger'

export interface UseCarouselNavigationOptions {
    /** Ref to the scrollable carousel container */
    containerRef: React.RefObject<HTMLDivElement | null>
    /** Whether this is an infinite carousel */
    infinite: boolean
    /** Layout measurements */
    layout: { cardWidth: number; gap: number }
    /** Function to cancel momentum scroll (from useDraggableScroll) */
    cancelMomentum: () => void
    /** Pre-teleport function for infinite carousels (from useCarouselTeleport) */
    preTeleport?: (targetScroll: number) => number
    /** Callback when navigating to a new item */
    onNavigate?: (targetScroll: number) => void
    /** Coordinator for state management (REQUIRED in Phase 2+) */
    coordinator: UseCarouselCoordinatorReturn
    /** Optional logger for debugging */
    logger?: CarouselLoggerInstance
}

export interface UseCarouselNavigationReturn {
    /** Navigate left (previous item) */
    scrollLeft: () => void
    /** Navigate right (next item) */
    scrollRight: () => void
    /** Direct access to navigation handler */
    handleScrollNav: (direction: -1 | 1) => void
}

/**
 * Hook that handles arrow navigation for carousels.
 * 
 * Phase 2: Uses coordinator as single source of truth for state.
 * No more external ref passing - all state is managed via coordinator.
 * 
 * Features:
 * - Rapid-click "Catch-Up & Advance" strategy for smooth multi-click navigation
 * - Bounce animation at edges for finite carousels
 * - Pre-teleport integration for infinite carousels
 * - Scroll completion detection (scrollend or debounce fallback)
 */
export function useCarouselNavigation({
    containerRef,
    infinite,
    layout,
    cancelMomentum,
    preTeleport,
    onNavigate,
    coordinator,
    logger,
}: UseCarouselNavigationOptions): UseCarouselNavigationReturn {
    // Internal refs that can't be stored in coordinator (functions/objects)
    const scrollEndListenerRef = useRef<(() => void) | null>(null)
    const scrollIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const snapTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Debug counters per instance using refs
    const debugClickCountRef = useRef(0)

    // Clear pending target when scroll completes
    const onAnimationComplete = useCallback((source: string) => {
        const el = containerRef.current
        if (!el) return

        const ctx = coordinator.getContext()
        if (ctx.pendingTarget === null && source !== 'safety-timeout') {
            logger?.log('NAV', `#${debugClickCountRef.current} Arrow nav ${source} - Skipping cleanup (Interrupted)`)
            return
        }
        if (ctx.isPreTeleporting) return

        // POSITION CHECK: Verify we actually reached the target before clearing
        const currentPos = el.scrollLeft
        const targetPos = ctx.pendingTarget
        const stride = layout.cardWidth + layout.gap

        if (targetPos !== null) {
            const distanceToTarget = Math.abs(currentPos - targetPos)
            // Allow some tolerance for rounding/animation imprecision
            if (distanceToTarget > stride * TIMING_CONFIG.SCROLL_TARGET_TOLERANCE_RATIO) {
                logger?.log('NAV', `#${debugClickCountRef.current} Ignoring premature ${source} - not at target yet`, {
                    currentPos: currentPos.toFixed(1),
                    targetPos: targetPos.toFixed(1),
                    distanceToTarget: distanceToTarget.toFixed(1)
                })
                return
            }
        }

        logger?.log('NAV', `#${debugClickCountRef.current} Arrow nav complete via ${source}`)
        scrollEndListenerRef.current = null
        // Coordinator: Notify scroll completion (clears pendingTarget internally)
        coordinator.transition({ type: 'SCROLL_COMPLETE' })
        if (infinite && el) el.style.scrollSnapType = ''
    }, [containerRef, coordinator, infinite, layout.cardWidth, layout.gap, logger])

    // Check for scrollend support
    const { waitForScrollCompletion } = useScrollCompletion({
        ref: containerRef,
        listenerRef: scrollEndListenerRef,
        timeoutRef: scrollIdleTimeoutRef,
        onComplete: onAnimationComplete
    })

    const handleScrollNav = useCallback((direction: -1 | 1) => {
        const clickStartTime = performance.now()
        debugClickCountRef.current++
        const thisClickId = debugClickCountRef.current

        logger?.log('NAV', `━━━ Arrow Click #${thisClickId} START ━━━`, {
            direction: direction === 1 ? 'RIGHT →' : '← LEFT',
            timestamp: clickStartTime.toFixed(1)
        })

        const el = containerRef.current
        if (!el) {
            logger?.log('NAV', `#${thisClickId} ABORT: No element ref`)
            return
        }

        // Read state from coordinator
        const ctx = coordinator.getContext()

        // Ignore clicks while bouncing
        if (coordinator.getPhase() === 'BOUNCING') {
            logger?.log('NAV', `#${thisClickId} ABORT: Currently bouncing`)
            return
        }

        // OPTIMIZATION: Read dimensions BEFORE cancelling momentum to avoid layout thrashing
        // (cancelMomentum writes to the DOM, causing a forced reflow if we read after it)
        const perfStart = performance.now()
        const stride = layout.cardWidth + layout.gap
        const currentScroll = el.scrollLeft
        const maxScroll = el.scrollWidth - el.clientWidth

        // This measurement confirms we are NOT triggering a reflow (should be < 0.5ms)
        const readTime = performance.now() - perfStart

        logger?.log('PERF', `Layout Read: ${readTime.toFixed(2)}ms`, {
            safe: readTime < 1.0,
            threshold: '1.0ms'
        })

        logger?.log('NAV', `#${thisClickId} Cancelling momentum...`)
        cancelMomentum()

        logger?.log('NAV', `#${thisClickId} Current state`, {
            currentScroll: currentScroll.toFixed(1),
            stride,
            maxScroll: maxScroll.toFixed(1),
            infinite
        })

        logger?.log('NAV', `#${thisClickId} Current state`, {
            currentScroll: currentScroll.toFixed(1),
            stride,
            maxScroll: maxScroll.toFixed(1),
            infinite
        })

        // For finite carousels, check if we're at the edge
        if (!infinite) {
            const isAtStart = currentScroll <= LAYOUT_CONFIG.EDGE_TOLERANCE_START
            const isAtEnd = currentScroll >= maxScroll - LAYOUT_CONFIG.EDGE_TOLERANCE_END

            // If at edge and trying to go further, do bounce animation
            if ((direction === -1 && isAtStart) || (direction === 1 && isAtEnd)) {
                logger?.log('NAV', `#${thisClickId} Edge reached, bouncing`, { isAtStart, isAtEnd })
                const bounceAmount = direction * TIMING_CONFIG.BOUNCE_DISTANCE_PX

                // Coordinator: Start bounce phase
                const bounceTimeoutId = setTimeout(() => {
                    el.style.transition = ''
                    el.style.transform = ''
                    coordinator.transition({ type: 'END_BOUNCE' })
                    logger?.log('NAV', `#${thisClickId} Bounce complete`)
                }, TIMING_CONFIG.BOUNCE_PHASE2_MS)
                coordinator.transition({ type: 'START_BOUNCE', timeoutId: bounceTimeoutId })

                el.style.transition = 'transform 0.15s ease-out'
                el.style.transform = `translateX(${-bounceAmount}px)`

                setTimeout(() => {
                    el.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    el.style.transform = 'translateX(0)'
                }, TIMING_CONFIG.BOUNCE_PHASE1_MS)

                return // Don't scroll further
            }
        }

        // For infinite carousels, disable snap to prevent interference with teleport
        if (infinite) {
            el.style.scrollSnapType = 'none'
            if (snapTimeoutRef.current) {
                logger?.log('NAV', `#${thisClickId} Clearing previous snap timeout`)
                clearTimeout(snapTimeoutRef.current)
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // RAPID-CLICK FIX: "Catch-Up & Advance" Strategy
        // ═══════════════════════════════════════════════════════════════════════════

        let targetScroll: number

        // COMMON: Measure real DOM stride and padding first
        // We must use the same "ruler" for both idle and rapid clicks to avoid drift.
        let activeStride = stride
        let paddingOffset = 0

        if (infinite && el.children.length > 0) {
            const firstChild = el.children[0] as HTMLElement
            paddingOffset = firstChild.offsetLeft

            if (el.children.length > 1) {
                const secondChild = el.children[1] as HTMLElement
                const domStride = secondChild.offsetLeft - firstChild.offsetLeft

                // If DOM stride differs significantly, trust the DOM
                if (domStride > 0 && Math.abs(domStride - stride) > 1) {
                    activeStride = domStride
                }
            }
        }

        const pendingTarget = ctx.pendingTarget
        if (pendingTarget !== null) {
            // Mid-animation: CATCH UP first, then advance
            const previousTarget = pendingTarget

            // CRITICAL: Remove old scrollend listener BEFORE the instant snap
            if (scrollEndListenerRef.current) {
                el.removeEventListener('scrollend', scrollEndListenerRef.current)
                el.removeEventListener('scroll', scrollEndListenerRef.current)
                scrollEndListenerRef.current = null
                logger?.log('NAV', `#${thisClickId} Removed old scrollend listener before catch-up`)
            }

            // Instantly snap to where we were headed (no animation restart lag)
            el.scrollTo({ left: previousTarget, behavior: 'auto' })

            // Now calculate the next target from that position
            targetScroll = previousTarget + (direction * activeStride)

            logger?.log('NAV', `#${thisClickId} Mid-animation: Caught up to ${previousTarget}, now targeting`, {
                caughtUpTo: previousTarget,
                direction,
                activeStride,
                targetScroll: targetScroll.toFixed(1)
            })
        } else {
            // Idle: use current scroll position as base

            // Calculate index directly from scroll position
            // We assume Scroll 0 = Index 0, so simply dividing by stride works.
            const currentIndex = Math.round(currentScroll / activeStride)
            const nextIndex = currentIndex + direction

            // TARGET CALCULATION: TRUST THE DOM
            // Instead of multiplying Stride * Index (which accumulates errors),
            // we find the exact DOM element we want to land on and scroll there.
            let domTargetFound = false

            if (infinite && el.children[nextIndex]) {
                const targetNode = el.children[nextIndex] as HTMLElement
                // We know paddingOffset is essentially (ContainerWidth - CardWidth)/2
                // So Target = ItemLeft - PaddingOffset centers the item.
                targetScroll = targetNode.offsetLeft - paddingOffset
                domTargetFound = true
            } else {
                // Fallback to math if item not rendered yet
                targetScroll = paddingOffset + (nextIndex * activeStride)
            }

            logger?.log('NAV', `#${thisClickId} Idle target calculation`, {
                currentIndex,
                nextIndex,
                direction,
                paddingOffset,
                activeStride,
                method: domTargetFound ? 'DOM_EXACT' : 'MATH_APPROX',
                targetScroll: targetScroll.toFixed(1)
            })
        }

        // Pre-emptive teleport: If target would cross a threshold, teleport FIRST
        if (infinite && preTeleport) {
            targetScroll = preTeleport(targetScroll)
        }

        // Coordinator: Notify about arrow click scroll start (sets pendingTarget internally)
        coordinator.transition({ type: 'ARROW_CLICK', direction, targetScroll })
        logger?.log('NAV', `#${thisClickId} pendingScrollTarget = ${targetScroll.toFixed(1)}`)

        // Notify about navigation
        if (onNavigate) {
            onNavigate(targetScroll)
        }

        logger?.log('NAV', `#${thisClickId} 🚀 Starting smooth scroll to ${targetScroll.toFixed(1)}`)

        // Scroll to target - with or without RAF frame separation based on flag
        if (FEATURE_FLAGS.USE_RAF_FRAME_SEPARATION) {
            requestAnimationFrame(() => {
                el.scrollTo({
                    left: targetScroll,
                    behavior: 'smooth',
                })
            })
        } else {
            el.scrollTo({
                left: targetScroll,
                behavior: 'smooth',
            })
        }

        // Start listening for completion
        waitForScrollCompletion()

        // Restore scroll snap after animation (only for infinite carousels)
        // MOVED TO onAnimationComplete to avoid premature snapping
        // if (infinite) {
        //     snapTimeoutRef.current = setTimeout(() => {
        //         if (el) {
        //             el.style.scrollSnapType = ''
        //             logger?.log('NAV', `#${thisClickId} Scroll snap restored`)
        //         }
        //     }, TIMING_CONFIG.SNAP_RESTORE_DELAY_MS)
        // }

        const clickDuration = performance.now() - clickStartTime
        logger?.log('NAV', `━━━ Arrow Click #${thisClickId} END ━━━`, {
            totalDuration: `${clickDuration.toFixed(1)}ms`,
            finalTarget: targetScroll.toFixed(1)
        })
    }, [containerRef, infinite, layout, cancelMomentum, preTeleport, onNavigate, coordinator, waitForScrollCompletion, logger])

    const scrollLeft = useCallback(() => handleScrollNav(-1), [handleScrollNav])
    const scrollRight = useCallback(() => handleScrollNav(1), [handleScrollNav])

    return {
        scrollLeft,
        scrollRight,
        handleScrollNav,
    }
}
