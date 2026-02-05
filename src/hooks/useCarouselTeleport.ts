import { useEffect, useRef } from 'react'
import type { UseCarouselCoordinatorReturn } from './useCarouselCoordinator'
import type { CarouselLoggerInstance } from '../logger'

export interface UseCarouselTeleportOptions {
    /** Ref to the scrollable carousel container */
    containerRef: React.RefObject<HTMLDivElement | null>
    /** Whether this is an infinite carousel */
    infinite: boolean
    /** Number of items in the original set */
    itemsCount: number
    /** Width of each card in pixels */
    cardWidth: number
    /** Gap between cards in pixels */
    gap: number
    /** Number of buffer items before the original set */
    bufferBeforeCount: number
    /** Function to apply visual effects after teleport */
    applyVisuals: (el: HTMLElement, scrollLeft?: number) => void
    /** Function to adjust scroll tracking in useDraggableScroll */
    adjustScroll: (delta: number) => void
    /** Delay in ms before clearing pre-teleport flag */
    preTeleportClearDelayMs: number
    /** Coordinator for state management (required - Phase 3) */
    coordinator: UseCarouselCoordinatorReturn
    /** Optional logger for debugging */
    logger?: CarouselLoggerInstance
}

/**
 * Hook that handles the teleport logic for infinite carousels.
 * 
 * THE TELEPORT LOOP - HYBRID STRATEGY
 * Desktop (mouse): Teleport during scroll - works perfectly, no compositor conflict
 * Mobile (touch): 
 *   - Teleport on 'scrollend' - natural stop after momentum
 *   - Teleport on 'pointerdown' - "catch & reset" when user touches during momentum
 */
export function useCarouselTeleport({
    containerRef,
    infinite,
    itemsCount,
    cardWidth,
    gap,
    bufferBeforeCount,
    applyVisuals,
    adjustScroll,
    preTeleportClearDelayMs,
    coordinator,
    logger,
}: UseCarouselTeleportOptions) {
    // HYBRID STRATEGY: Track if last interaction was touch (mobile) to disable during-scroll teleport
    const isTouchInteraction = useRef(false)
    // Internal ref for scrollend listener (holds function reference, managed by this hook)
    const scrollEndListenerRef = useRef<(() => void) | null>(null)

    // ═══════════════════════════════════════════════════════════════════════════
    // APPENDIX A FIX: Store unstable dependencies in refs to prevent effect re-run
    // These values change frequently but don't require handler re-attachment
    // ═══════════════════════════════════════════════════════════════════════════
    const coordinatorRef = useRef(coordinator)
    const applyVisualsRef = useRef(applyVisuals)
    const adjustScrollRef = useRef(adjustScroll)
    const loggerRef = useRef(logger)

    // Sync refs on every render (no effect trigger)
    coordinatorRef.current = coordinator
    applyVisualsRef.current = applyVisuals
    adjustScrollRef.current = adjustScroll
    loggerRef.current = logger

    useEffect(() => {
        const el = containerRef.current
        if (!el || !infinite || itemsCount === 0) return

        let stride = cardWidth + gap

        // CORRECTION: Measure real DOM stride to ensure teleport is visually perfect.
        // If we use calculated stride (162) vs real (166), teleporting 12 items (buffer)
        // results in a ~48px jump (misalignment) because 12 * 4px error = 48px.
        if (infinite && el.children.length > 1) {
            const firstChild = el.children[0] as HTMLElement
            const secondChild = el.children[1] as HTMLElement
            const domStride = secondChild.offsetLeft - firstChild.offsetLeft

            if (domStride > 0 && Math.abs(domStride - stride) > 1) {
                loggerRef.current?.log('TELEPORT', `Using DOM stride for teleport accuracy`, { calculated: stride, measured: domStride })
                stride = domStride
            }
        }

        const originalSetWidth = itemsCount * stride
        const bufferBeforeWidth = bufferBeforeCount * stride

        let rafId: number | null = null

        // Shared teleport logic - called from scroll, scrollend, or pointerdown
        const performTeleport = (source: string): boolean => {
            const ctx = coordinatorRef.current.getContext()
            if (ctx.isTeleporting) {
                loggerRef.current?.log('TELEPORT', `Teleport in progress (${source})`)
                return false
            }
            if (ctx.pendingTarget !== null && source === 'scroll') {
                loggerRef.current?.log('TELEPORT', `Pending target exists (${source})`, { target: ctx.pendingTarget })
                return false
            }

            const currentScroll = el.scrollLeft

            if (currentScroll >= bufferBeforeWidth + originalSetWidth) {
                // Teleport Back
                const overshoot = currentScroll - bufferBeforeWidth
                const setsPassed = Math.floor(overshoot / originalSetWidth)
                if (setsPassed > 0) {
                    const adjust = setsPassed * originalSetWidth
                    loggerRef.current?.log('TELEPORT', `⚡ BACKWARD (${source})`, {
                        from: currentScroll.toFixed(0),
                        to: (currentScroll - adjust).toFixed(0)
                    })
                    coordinatorRef.current.transition({ type: 'SET_TELEPORTING', value: true })
                    // Momentum cancel for desktop only
                    if (!isTouchInteraction.current) {
                        el.scrollTo({ left: el.scrollLeft, behavior: 'auto' })
                    }
                    const newPos = currentScroll - adjust
                    el.scrollLeft = newPos
                    // Platform-optimized visuals
                    if (!isTouchInteraction.current) {
                        applyVisualsRef.current(el, newPos)
                    } else {
                        requestAnimationFrame(() => applyVisualsRef.current(el, newPos))
                    }
                    adjustScrollRef.current(-adjust)
                    coordinatorRef.current.transition({ type: 'SET_TELEPORTING', value: false })
                    coordinatorRef.current.transition({ type: 'END_TELEPORT' })
                    return true
                }
            } else if (currentScroll < bufferBeforeWidth) {
                // Teleport Forward
                loggerRef.current?.log('TELEPORT', `⚡ FORWARD (${source})`, {
                    from: currentScroll.toFixed(0),
                    to: (currentScroll + originalSetWidth).toFixed(0)
                })
                coordinatorRef.current.transition({ type: 'SET_TELEPORTING', value: true })
                // Momentum cancel for desktop only
                if (!isTouchInteraction.current) {
                    el.scrollTo({ left: el.scrollLeft, behavior: 'auto' })
                }
                const newPos = currentScroll + originalSetWidth
                el.scrollLeft = newPos
                // Platform-optimized visuals
                if (!isTouchInteraction.current) {
                    applyVisualsRef.current(el, newPos)
                } else {
                    requestAnimationFrame(() => applyVisualsRef.current(el, newPos))
                }
                adjustScrollRef.current(originalSetWidth)
                coordinatorRef.current.transition({ type: 'SET_TELEPORTING', value: false })
                coordinatorRef.current.transition({ type: 'END_TELEPORT' })
                return true
            }
            return false
        }

        const handleScroll = () => {
            if (rafId) {
                return
            }
            rafId = requestAnimationFrame(() => {
                const rafStartTime = performance.now()
                applyVisualsRef.current(el)

                const ctx = coordinatorRef.current.getContext()
                if (ctx.isTeleporting || ctx.isPreTeleporting) {
                    rafId = null
                    return
                }

                // HYBRID: Only teleport during scroll for DESKTOP (non-touch)
                if (!isTouchInteraction.current) {
                    performTeleport('scroll')
                } else {
                    loggerRef.current?.log('TELEPORT', 'Touch drag active: skipping scroll-teleport')
                }

                rafId = null

                const rafDuration = performance.now() - rafStartTime
                if (rafDuration > 5) {
                    loggerRef.current?.log('TELEPORT', `RAF took ${rafDuration.toFixed(1)}ms`)
                }
            })
        }

        // MOBILE: Teleport on scrollend - momentum has naturally stopped
        const handleScrollEnd = () => {
            if (!isTouchInteraction.current) return // Desktop already handled in scroll
            if (coordinatorRef.current.getContext().pendingTarget !== null) return // Arrow nav in progress

            // SNAP SAFETY CHECK:
            // Mobile Safari fires scrollend BEFORE the CSS Snap animation finishes.
            // If we teleport mid-snap (e.g. at index 72.5), we kill momentum and the browser
            // snaps back to 72 instead of continuing to 73.
            // We must only teleport if we are effectively "settled" on a slot.
            const currentScroll = el.scrollLeft

            // Calculate raw index to check alignment
            // Note: We need paddingOffset and stride. Stride is available in scope.
            // PaddingOffset we can infer from first child or assume standard centering.
            let paddingOffset = 0
            if (el.children.length > 0) {
                paddingOffset = (el.children[0] as HTMLElement).offsetLeft
            }

            const rawIndex = (currentScroll - paddingOffset) / stride
            const snapSkew = Math.abs(rawIndex - Math.round(rawIndex))

            // Tolerance: 5% of a card width (e.g. ~8px for a 160px card)
            if (snapSkew > 0.05) {
                loggerRef.current?.log('TELEPORT', 'Skipping teleport - mid-snap detected', {
                    rawIndex: rawIndex.toFixed(3),
                    snapSkew: snapSkew.toFixed(3)
                })
                return
            }

            loggerRef.current?.log('TELEPORT', 'Mobile scroll settled, checking teleport')
            performTeleport('scrollend')
        }

        // MOBILE: Teleport on pointerdown - "Safety Valve" Strategy
        // Only teleport if the user is dangerously close to the physical edge.
        // Otherwise, stay quiet to avoid fighting the browser's touch interaction (causes flicker).
        const handlePointerDown = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                if (!isTouchInteraction.current) loggerRef.current?.log('TELEPORT', 'Switched to TOUCH')
                isTouchInteraction.current = true

                // SAFETY VALVE CHECK:
                // We have a huge buffer (~6000px). Only teleport if we are running out of runway.
                const SAFETY_THRESHOLD = 500 // pixels indicating "dangerously close to edge"
                const maxScroll = el.scrollWidth - el.clientWidth

                const isDangerouslyCloseToStart = el.scrollLeft < SAFETY_THRESHOLD
                const isDangerouslyCloseToEnd = el.scrollLeft > maxScroll - SAFETY_THRESHOLD

                if (isDangerouslyCloseToStart || isDangerouslyCloseToEnd) {
                    loggerRef.current?.log('TELEPORT', '⚠️ SAFETY VALVE TRIGGERED: Teleporting during touch to prevent hitting wall')
                    const didTeleport = performTeleport('pointerdown')
                    if (didTeleport) {
                        loggerRef.current?.log('TELEPORT', 'Catch & reset teleport performed (Safety Valve)')
                    }
                } else {
                    // Safe zone - Do nothing! Let the user drag native scroll without interference.
                    // This is the key to "Zero Flicker".
                }
            } else {
                if (isTouchInteraction.current) loggerRef.current?.log('TELEPORT', 'Switched to MOUSE/PEN')
                isTouchInteraction.current = false
            }
        }

        el.addEventListener('scroll', handleScroll, { passive: true })
        el.addEventListener('scrollend', handleScrollEnd)
        el.addEventListener('pointerdown', handlePointerDown, { passive: true })

        loggerRef.current?.log('TELEPORT', 'Hybrid teleport handlers attached', {
            stride,
            originalSetWidth,
            bufferBeforeWidth,
            itemsCount
        })

        return () => {
            el.removeEventListener('scroll', handleScroll)
            el.removeEventListener('scrollend', handleScrollEnd)
            el.removeEventListener('pointerdown', handlePointerDown)
            if (rafId) cancelAnimationFrame(rafId)
            loggerRef.current?.log('TELEPORT', 'Scroll handlers removed')
        }
    }, [containerRef, infinite, itemsCount, cardWidth, gap, bufferBeforeCount])

    /**
     * Proactive pre-teleport for arrow navigation.
     */
    const preTeleport = (targetScroll: number): number => {
        const el = containerRef.current
        if (!el || !infinite || itemsCount === 0) return targetScroll

        // FIX: Measure real DOM stride for teleport accuracy (matches scroll handler)
        // Using calculated stride (cardWidth + gap) causes misalignment when DOM stride differs
        // e.g., calculated=232 vs DOM=236 → 40px drift per 10-item cycle
        let stride = cardWidth + gap
        if (el.children.length > 1) {
            const firstChild = el.children[0] as HTMLElement
            const secondChild = el.children[1] as HTMLElement
            const domStride = secondChild.offsetLeft - firstChild.offsetLeft
            if (domStride > 0 && Math.abs(domStride - stride) > 1) {
                logger?.log('TELEPORT', 'preTeleport using DOM stride', { calculated: stride, measured: domStride })
                stride = domStride
            }
        }

        const originalSetWidth = itemsCount * stride
        const bufferBeforeWidth = bufferBeforeCount * stride

        // Check if target is outside safe zone
        const needsLeftPreTeleport = targetScroll < bufferBeforeWidth
        const needsRightPreTeleport = targetScroll >= bufferBeforeWidth + originalSetWidth

        if (!needsLeftPreTeleport && !needsRightPreTeleport) {
            logger?.log('TELEPORT', 'No pre-teleport needed', { targetScroll })
            return targetScroll
        }

        const direction = needsLeftPreTeleport ? 'LEFT' : 'RIGHT'
        const offset = needsLeftPreTeleport ? originalSetWidth : -originalSetWidth
        const preTeleportStart = performance.now()

        logger?.log('TELEPORT', `⚡ ${direction} PRE-TELEPORT START`, {
            oldTarget: targetScroll.toFixed(1),
            newTarget: (targetScroll + offset).toFixed(1)
        })

        // Adjust target
        const adjustedTarget = targetScroll + offset

        // Block scroll handler from teleporting during this operation
        coordinator.transition({ type: 'SET_PRE_TELEPORTING', value: true })
        coordinator.transition({ type: 'START_PRE_TELEPORT' })
        logger?.log('TELEPORT', 'isPreTeleporting = true (via coordinator)')

        // CRITICAL: Remove old scrollend listener BEFORE stopping scroll
        if (scrollEndListenerRef.current) {
            logger?.log('TELEPORT', 'Removing old scrollend listener before stop')
            el.removeEventListener('scrollend', scrollEndListenerRef.current)
            scrollEndListenerRef.current = null
        }

        // STOP any ongoing smooth scroll animation first
        logger?.log('TELEPORT', 'Stopping ongoing smooth scroll...')
        el.scrollTo({ left: el.scrollLeft, behavior: 'auto' })

        // Perform the instant teleport
        coordinator.transition({ type: 'SET_TELEPORTING', value: true })
        const oldScrollLeft = el.scrollLeft
        const newScrollLeft = oldScrollLeft + offset
        el.scrollLeft = newScrollLeft
        logger?.log('TELEPORT', `Instant teleport: ${oldScrollLeft.toFixed(1)} → ${el.scrollLeft.toFixed(1)}`)

        // Apply visuals via RAF to avoid layout thrashing
        logger?.log('TELEPORT', 'Applying visuals after teleport...')
        requestAnimationFrame(() => applyVisuals(el, newScrollLeft))

        coordinator.transition({ type: 'SET_TELEPORTING', value: false })

        // CRITICAL: Update pendingTarget in coordinator with the ADJUSTED target
        coordinator.transition({ type: 'SET_PENDING_TARGET', target: adjustedTarget })

        // Clear the pre-teleport flag after a short delay
        setTimeout(() => {
            coordinator.transition({ type: 'SET_PRE_TELEPORTING', value: false })
            logger?.log('TELEPORT', `isPreTeleporting = false (after ${preTeleportClearDelayMs}ms)`)
        }, preTeleportClearDelayMs)

        logger?.log('TELEPORT', `⚡ ${direction} PRE-TELEPORT END`, {
            duration: `${(performance.now() - preTeleportStart).toFixed(1)}ms`
        })

        return adjustedTarget
    }

    return {
        /** Ref to track if current interaction is touch-based */
        isTouchInteraction,
        /** Proactive pre-teleport for arrow navigation */
        preTeleport,
    }
}
