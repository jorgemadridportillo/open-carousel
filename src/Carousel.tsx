import { useRef, useEffect, useCallback, useLayoutEffect, useMemo, memo, type ReactNode } from 'react'
import { useDraggableScroll } from './hooks/useDraggableScroll'
import { useLoadingState } from './hooks/useLoadingState'
import { useCarouselTeleport } from './hooks/useCarouselTeleport'
import { useCarouselVisuals } from './hooks/useCarouselVisuals'
import { useCarouselPersistence } from './hooks/useCarouselPersistence'
import { useCarouselLayout, measureLayoutFromElement } from './hooks/useCarouselLayout'
import { useCarouselNavigation } from './hooks/useCarouselNavigation'
import { useScrollCompletion } from './hooks/useScrollCompletion'
import { useCarouselCoordinator } from './hooks/useCarouselCoordinator'
import { CarouselArrow } from './CarouselArrow'
import {
    VISUAL_CONFIG,
    TIMING_CONFIG,
    LAYOUT_CONFIG,
} from './config'
import { createLogger, type DebugChannel, type ChannelConfig } from './logger'


/** 
/** Available CSS variable names for carousel item widths */
export type CarouselWidthVar = 'default' | 'review' | 'compact' | 'collection'

/** SSR fallback width - matches CSS :root default for default variant */
const SSR_FALLBACK_WIDTH = 170

/** 
 * Map CSS variable name to Tailwind width class.
 * IMPORTANT: These must be LITERAL STRINGS so Tailwind can find them during build.
 * Dynamic construction like \`w-[var(${x})]\` will be purged!
 */
const WIDTH_CLASSES: Record<CarouselWidthVar, string> = {
    default: 'w-[var(--carousel-item-width-default)]',
    review: 'w-[var(--carousel-item-width-review)]',
    compact: 'w-[var(--carousel-item-width-compact)]',
    collection: 'w-[var(--carousel-item-width-collection)]',
}

/** Map CSS variable name to the actual CSS property name (for getComputedStyle) */
const CSS_VAR_MAP: Record<CarouselWidthVar, string> = {
    default: '--carousel-item-width-default',
    review: '--carousel-item-width-review',
    compact: '--carousel-item-width-compact',
    collection: '--carousel-item-width-collection',
}

/**
 * Get the computed item width from CSS variable.
 * This reads the actual computed value from the browser, which respects media queries.
 */
export const getComputedItemWidth = (varName: CarouselWidthVar = 'default'): number => {
    if (typeof window === 'undefined') return SSR_FALLBACK_WIDTH
    const cssVar = CSS_VAR_MAP[varName]
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar)
    return parseInt(value, 10) || SSR_FALLBACK_WIDTH
}

export interface BaseCarouselProps<T> {
    items: T[]
    getItemKey: (item: T, index: number) => string
    renderItem: (item: T, index: number, helpers: { scrollToItem: () => void }) => ReactNode
    infinite?: boolean
    onEndReached?: () => void
    hasNextPage?: boolean
    /** 
     * CSS variable name for item width. Uses native CSS media queries for responsive widths.
     * Options: 'default' | 'review' | 'compact' | 'collection'
     */
    itemWidthVar?: CarouselWidthVar
    itemClassName?: string
    snapType?: 'mandatory' | 'proximity'

    disableOpacityEffect?: boolean
    disableScaleEffect?: boolean
    /** Custom vertical padding for the carousel container. Defaults to '20px'. */
    verticalPadding?: string
    snap?: boolean
    /** Optional custom skeleton renderer. Receives index. */
    renderSkeleton?: (index: number) => ReactNode
    /** 
     * Optional key for persisting scroll position in sessionStorage.
     * When provided, the carousel will restore its scroll position after navigation.
     * Use a unique key per carousel instance, e.g., 'homepage-recommended'.
     */
    persistKey?: string
    onActiveItemChange?: (item: T) => void
    /** Optional explicit gap value in pixels. If not provided, uses LAYOUT_CONFIG based on viewport. */
    gap?: number
    /** Optional id for debug logging - helps identify which carousel in console */
    debugId?: string
    /** 
     * Optional per-instance debug config. 
     * Set `channels` to override global config for this carousel only.
     * Use 'ALL' to enable all channels.
     */
    debug?: {
        channels?: ChannelConfig
        bufferSize?: number
    }
    /**
     * Optional initial index to scroll to on mount.
     * Takes precedence over buffer positioning but yields to persisted position if available.
     */
    initialIndex?: number
    /**
     * If true, changes the selection threshold on mobile (viewport < 640px) from 0.5 (50%) to 0.3 (30%)
     * This makes the carousel select the next/prev item with less swipe distance.
     */
    eagerSelectionOnMobile?: boolean
}

function BaseCarouselInner<T>({
    items,
    getItemKey,
    renderItem,
    infinite = false,
    onEndReached,
    hasNextPage = false,
    itemWidthVar = 'default',
    itemClassName = '',
    snapType = 'mandatory',
    disableOpacityEffect = false,
    disableScaleEffect = false,
    verticalPadding = '20px',
    snap = true,
    renderSkeleton,
    persistKey,
    onActiveItemChange,
    gap: gapProp,
    debugId = 'carousel',
    debug,
    eagerSelectionOnMobile = false,
    initialIndex,
}: BaseCarouselProps<T>) {
    // Resolve gap: use prop if provided, otherwise determine from viewport
    const resolvedGap = gapProp ?? (
        typeof window !== 'undefined' && window.innerWidth < LAYOUT_CONFIG.GAP_BREAKPOINT
            ? LAYOUT_CONFIG.GAP_MOBILE
            : LAYOUT_CONFIG.GAP_DESKTOP
    )
    // ═══════════════════════════════════════════════════════════════════════════
    // LOGGER 2.0: Factory-created instance for this carousel
    // ═══════════════════════════════════════════════════════════════════════════
    const logger = useMemo(() => createLogger(debugId, debug), [debugId, debug])

    // CSS variable class for item width - uses native CSS media queries
    const widthClass = WIDTH_CLASSES[itemWidthVar]

    // Performance tracking - uses logger's timer for consistent metrics
    const initTimerRef = useRef(logger.createTimer())
    const getElapsedMs = () => initTimerRef.current.elapsed()
    // Use unified loading state hook for skeleton management
    // isInstant = true when carousel was previously seen (cache hit) - skips fade animation
    // This prevents the visible "reset" flash on Safari iOS when scrolling carousel back into view
    const { isReady, showSkeleton, markReady, isInstant } = useLoadingState({
        cacheKey: persistKey ? `carousel-${persistKey}` : undefined,
        skeletonDelay: 50,
        fallbackTimeout: 3000,
    })

    // Use persistence hook for scroll position save/restore across navigation
    const { getSavedPosition, savePosition } = useCarouselPersistence({
        persistKey,
        debounceMs: 150,
    })

    // TELEPORTING BUFFER STRATEGY
    // We render a fixed set of items: [BufferBefore] [OriginalItems] [BufferAfter]
    // And seamlessly teleport the scroll position when the user reaches the boundaries.

    const handleEndReached = () => {
        if (hasNextPage && onEndReached) {
            onEndReached()
        }
    }

    // Get draggable scroll first (needed for layout hook ref)
    const { ref: draggableRef, isDragging, events, cancelMomentum, adjustScroll } = useDraggableScroll({
        infinite,
        onEndReached: handleEndReached,
        hasNextPage,
        cardWidth: LAYOUT_CONFIG.INITIAL_CARD_WIDTH,
        gap: resolvedGap
    })

    // Use layout hook for stride measurement, viewport detection, and resize handling
    // Must be after draggableRef is declared
    // NOTE: We don't use onLayoutChange here because useCarouselVisuals hasn't been called yet.
    // Instead, we use a useEffect below to react to layout.cardWidth/gap changes.
    // resizeCount triggers re-renders when ResizeObserver fires, even if values are unchanged
    const { layout, measureLayout: triggerLayoutMeasure, resizeCount, isMobile } = useCarouselLayout({
        containerRef: draggableRef,
        logger,
    })

    // Setup Fixed Buffers
    // We need enough items to cover the screen width + buffer.
    // For safety, we aim for ~3 screens worth of items on each side if possible, or at least ~20 items.
    const { clonesBefore, clonesAfter } = useMemo(() => {
        let before: T[] = []
        let after: T[] = []

        if (infinite && items.length > 0) {
            const itemsNeeded = Math.ceil(LAYOUT_CONFIG.MIN_BUFFER_COUNT / items.length)
            const count = Math.max(1, itemsNeeded)

            before = Array(count).fill(items).flat()
            after = Array(count).fill(items).flat()
        }
        return { clonesBefore: before, clonesAfter: after }
    }, [infinite, items])

    const allItems = useMemo(() => [...clonesBefore, ...items, ...clonesAfter], [clonesBefore, items, clonesAfter])
    const bufferBeforeCount = clonesBefore.length

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATOR: Single source of truth for carousel state
    // Replaces: isTeleporting, pendingScrollTarget, isPreTeleportingRef, isBouncing
    // ═══════════════════════════════════════════════════════════════════════════
    const { transition, getPhase, getContext, contextRef } = useCarouselCoordinator({ logger })

    // SSR-safe useLayoutEffect - falls back to useEffect on the server
    const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

    const hasInitialized = useRef(false)
    // Timer/listener refs are still external (coordinator tracks IDs, we manage lifecycle)
    const scrollEndListenerRef = useRef<(() => void) | null>(null)
    const snapTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const scrollIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Note: Timer refs (snapTimeoutRef, scrollIdleTimeoutRef) still needed to manage actual timer handles
    // The coordinator only tracks timeout IDs for coordination, not the actual setTimeout return values
    // lastActiveItemRef: Used for dedup in onActiveItemChange callback - not coordinator state
    const lastActiveItemRef = useRef<T | null>(null)
    const lastInitRef = useRef<{ cardWidth: number, gap: number } | null>(null)

    // Use the extracted visuals hook for position cache and visual effects
    const {
        childrenPositions,
        isCacheDirty,
        containerWidthRef,
        isContainerWidthDirty,
        updateCache,
        applyVisuals,
    } = useCarouselVisuals({
        layout,
        itemsCount: items.length,
        bufferBeforeCount,
        disableOpacityEffect,
        disableScaleEffect,
        logger,
    })

    // Use the extracted teleport hook for infinite carousels
    // This handles scroll/scrollend/pointerdown events for the hybrid teleport strategy
    const { preTeleport } = useCarouselTeleport({
        containerRef: draggableRef,
        infinite,
        itemsCount: items.length,
        cardWidth: layout.cardWidth,
        gap: layout.gap,
        bufferBeforeCount,
        applyVisuals,
        adjustScroll,
        preTeleportClearDelayMs: TIMING_CONFIG.PRE_TELEPORT_CLEAR_DELAY_MS,
        coordinator: {
            transition,
            getContext,
            getPhase,
            contextRef,
            isBusy: () => getPhase() !== 'IDLE',
            isBlocking: () => getPhase() === 'BOUNCING' || getPhase() === 'TELEPORTING',
        },
        logger,
    })

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ IDEMPOTENT INITIALIZATION (Jan 2025)                                │
    // │ Extracted into a function so it can be called from both:            │
    // │   1. Ref callback (fast path, might fire before children render)    │
    // │   2. useLayoutEffect (guaranteed correct, after children in DOM)    │
    // │ The idempotent check ensures only one of them actually does work.   │
    // └─────────────────────────────────────────────────────────────────────┘
    const initializeCarousel = useCallback((node: HTMLDivElement) => {
        if (items.length === 0) {
            if (!isReady) markReady()
            return
        }

        // Use cached layout from ResizeObserver when available (avoids redundant getBoundingClientRect)
        // On first initialization, measure fresh to ensure accuracy before ResizeObserver has fired
        let cardWidth: number
        let gap: number

        if (hasInitialized.current) {
            // Subsequent calls (resize): use cached layout to avoid double measurement
            cardWidth = layout.cardWidth
            gap = layout.gap
        } else {
            // First call: measure fresh to ensure accurate initial positioning
            const measured = triggerLayoutMeasure()
            cardWidth = measured.cardWidth
            gap = measured.gap
        }

        // Get expected width from CSS variable.
        // CSS variables handle responsive widths natively via media queries,
        // avoiding the SSR timing issues of the old JS-based approach.
        const expectedWidth = getComputedItemWidth(itemWidthVar)
        const widthDiff = Math.abs(cardWidth - expectedWidth)

        // Consider "measured" if width is within 10px of expected value
        // This handles sub-pixel differences and slight rendering variations
        const TOLERANCE = 10
        const hasNoChildren = node.children.length === 0
        const isNotExpectedWidth = widthDiff > TOLERANCE

        // Also check that scroll dimensions are ready (scrollWidth > clientWidth for scrollable content)
        // Without this, we might initialize with maxScroll=0 and clamp positions incorrectly
        const hasScrollableContent = node.scrollWidth > node.clientWidth
        const isUnmeasured = hasNoChildren || isNotExpectedWidth || !hasScrollableContent

        if (isUnmeasured && !hasInitialized.current) {
            logger.log('INIT', 'Skipping - not ready for initialization', {
                elapsedMs: getElapsedMs(),
                childrenCount: node.children.length,
                cardWidth,
                expectedWidth,
                widthDiff,
                itemWidthVar,
                hasScrollableContent,
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                gap
            })
            return
        }

        // Idempotency Check: If already initialized and layout is identical, SKIP.
        // This prevents "drift" bugs where ResizeObserver fires (e.g. on mount/font-load)
        // but dimensions are unchanged, causing us to read a slightly snapped scroll position
        // and re-calculate targetPos with rounding errors.
        if (hasInitialized.current &&
            lastInitRef.current &&
            lastInitRef.current.cardWidth === cardWidth &&
            lastInitRef.current.gap === gap) {
            logger.log('INIT', 'Skipping - layout unchanged', { cardWidth, gap })
            return
        }

        // Update last init ref
        lastInitRef.current = { cardWidth, gap }

        const stride = cardWidth + gap

        // Determine target position
        let targetPos: number

        // If it's a subsequent run (e.g. resize), preserve the current active item
        if (hasInitialized.current) {
            const currentIndex = Math.round(node.scrollLeft / stride)
            targetPos = currentIndex * stride
            // Log the re-init for debugging to understand why it ran
            logger.log('INIT', `Re-initializing (Resize/Update)`, {
                currentIndex,
                targetPos,
                prevScroll: node.scrollLeft,
                stride
            })
        } else {
            const savedPosition = getSavedPosition()

            if (savedPosition !== null) {
                // Clamp to valid scroll range to handle viewport size changes
                const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth)
                targetPos = Math.min(savedPosition, maxScroll)
                logger.log('CACHE', `Restoring scroll position`, { saved: savedPosition, clamped: targetPos, maxScroll })
            } else {
                // DOM-BASED INITIALIZATION (Deterministically matches CSS Snap)
                // Instead of calculating theoretical position (which drifts due to padding/snap logic),
                // we measure exactly where the target item is and center it manually.
                const startIdx = typeof initialIndex === 'number' ? initialIndex : 0
                const targetIndex = infinite ? bufferBeforeCount + startIdx : startIdx
                const targetNode = node.children[targetIndex] as HTMLElement

                if (targetNode) {
                    // Center the item: ItemCenter - ContainerCenter
                    // This naturally accounts for all padding, margins, and gaps.
                    const itemCenter = targetNode.offsetLeft + (targetNode.offsetWidth / 2)
                    const containerCenter = node.clientWidth / 2
                    targetPos = Math.max(0, itemCenter - containerCenter)

                    logger.log('INIT', 'DOM-based positioning used', {
                        targetIndex,
                        itemCenter,
                        containerCenter,
                        targetPos,
                        offsetLeft: targetNode.offsetLeft,
                        initialIndex
                    })
                } else {
                    // Fallback to theoretical math if DOM node missing (unlikely in useLayoutEffect)
                    const startIdx = typeof initialIndex === 'number' ? initialIndex : 0
                    const targetIdx = infinite ? bufferBeforeCount + startIdx : startIdx
                    targetPos = targetIdx * stride
                    logger.log('INIT', 'Fallback to theoretical positioning', { targetPos, initialIndex })
                }
            }

            // DEBUG: Trace initial target mapping
            const initialTargetIndex = targetPos / stride
            logger.log('INIT', 'Target Calc Trace', {
                targetPos,
                stride,
                initialTargetIndex,
                bufferBeforeCount,
                infinite
            })
        }

        // Check if correction needed (idempotent - safe to call multiple times)
        const positionDrift = Math.abs(node.scrollLeft - targetPos)
        const needsCorrection = !hasInitialized.current || positionDrift > stride / 2

        logger.log('INIT', 'Target Calc Result', {
            targetPos,
            currentScroll: node.scrollLeft,
            needsCorrection,
            hasInitialized: hasInitialized.current,
            infinite,
            bufferBeforeCount
        })

        if (needsCorrection) {
            logger.log('INIT', `Applying position correction`, {
                elapsedMs: getElapsedMs(),
                current: node.scrollLeft,
                target: targetPos,
                drift: positionDrift,
                firstInit: !hasInitialized.current
            })

            // Disable snap during position set
            node.style.scrollSnapType = 'none'

            // Apply padding synchronously (iOS race condition fix)
            if (infinite) {
                const centerPadding = `calc(50% - ${cardWidth / 2}px)`
                node.style.paddingLeft = centerPadding
                node.style.paddingRight = centerPadding
                node.style.scrollPaddingLeft = centerPadding
                node.style.scrollPaddingRight = centerPadding
            }

            logger.log('INIT', 'DRIFT DEBUG: Before scrollLeft set', {
                currentScroll: node.scrollLeft,
                targetPos,
                paddingLeft: node.style.paddingLeft,
                clientWidth: node.clientWidth
            })

            node.scrollLeft = targetPos

            logger.log('INIT', 'DRIFT DEBUG: After scrollLeft set (before flush)', {
                scrollLeftNow: node.scrollLeft
            })

            // Force synchronous layout flush to ensure scrollLeft is applied
            // before re-enabling scroll-snap (prevents snap from animating to wrong position)
            void node.offsetHeight

            logger.log('INIT', 'DRIFT DEBUG: After layout flush (before snap re-enable)', {
                scrollLeftNow: node.scrollLeft
            })

            // Re-enable snap
            node.style.scrollSnapType = ''

            logger.log('INIT', 'DRIFT DEBUG: After snap re-enabled', {
                scrollLeftNow: node.scrollLeft
            })
        }

        applyVisuals(node)
        node.style.opacity = '1'

        if (!hasInitialized.current) {
            hasInitialized.current = true
            transition({ type: 'INITIALIZE' })
        }
        if (!isReady) markReady()
    }, [items.length, bufferBeforeCount, applyVisuals, isReady, infinite, markReady, layout.cardWidth, layout.gap, triggerLayoutMeasure, transition, getSavedPosition, resizeCount, itemWidthVar, initialIndex])

    // Ref callback: fast path (might work if timing is good)
    const setCarouselRef = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            (draggableRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            initializeCarousel(node)
        }
    }, [draggableRef, initializeCarousel])

    // useLayoutEffect: guaranteed second attempt after children are in DOM
    // Using isomorphic version to avoid SSR warnings
    useIsomorphicLayoutEffect(() => {
        const node = draggableRef.current
        if (node && items.length > 0) {
            initializeCarousel(node)
        }
    }, [items.length, initializeCarousel, draggableRef, resizeCount])

    // NOTE: ResizeObserver is now handled by useCarouselLayout hook internally.
    // This useEffect reacts to layout changes and invalidates caches.
    useEffect(() => {
        if (draggableRef.current) {
            isCacheDirty.current = true
            isContainerWidthDirty.current = true
            updateCache(draggableRef.current)
            requestAnimationFrame(() => applyVisuals(draggableRef.current!))
        }
    }, [layout.cardWidth, layout.gap, updateCache, applyVisuals, draggableRef, isCacheDirty, isContainerWidthDirty])

    // Save scroll position on scrollend for persistence across navigation
    useEffect(() => {
        const el = draggableRef.current
        if (!el || !persistKey) return

        const handleScrollEnd = () => {
            // Save position after scroll animation completes
            savePosition(el.scrollLeft)
        }

        el.addEventListener('scrollend', handleScrollEnd)
        return () => el.removeEventListener('scrollend', handleScrollEnd)
    }, [draggableRef, persistKey, savePosition])

    // NOTE: Teleport logic is now handled by useCarouselTeleport hook

    const getActiveItemAtScroll = useCallback((scrollLeft: number, direction: number = 0, overrides?: { cardWidth: number, gap: number }) => {
        const activeCardWidth = overrides?.cardWidth ?? layout.cardWidth
        const activeGap = overrides?.gap ?? layout.gap
        const stride = activeCardWidth + activeGap

        if (stride <= 0 || items.length === 0) return null

        // Use cached domStride from layout hook (measured on resize, not per-scroll)
        // This avoids triggering layout reflow on every scroll event
        const activeStride = layout.domStride > 0 ? layout.domStride : stride
        const effectiveScroll = scrollLeft

        const rawIndex = effectiveScroll / activeStride
        let totalIndex: number

        // DEBUG: Selection Input
        logger.log('NAV', 'getActiveItemAtScroll START', {
            scrollLeft,
            effectiveScroll,
            calculatedStride: stride,
            domStride: activeStride,
            rawIndex,
            direction,
            overrides
        })

        // EAGER SELECTION: Symmetrical directional bias
        // Use 30% threshold on mobile for snappy feedback, 50% (standard round) on desktop
        const EAGER_THRESHOLD = (isMobile && eagerSelectionOnMobile) ? 0.3 : 0.5

        if (direction > 0) {
            // Swiping forward (left swipe): eagerly select next item at threshold
            totalIndex = Math.floor(rawIndex + (1 - EAGER_THRESHOLD))
        } else if (direction < 0) {
            // Swiping backward (right swipe): eagerly select prev item at threshold
            totalIndex = Math.ceil(rawIndex - (1 - EAGER_THRESHOLD))
        } else {
            // Idle: Standard round (closest item)
            totalIndex = Math.round(rawIndex)
        }

        let activeIndex: number

        if (infinite) {
            activeIndex = ((totalIndex - bufferBeforeCount) % items.length + items.length) % items.length
        } else {
            activeIndex = Math.max(0, Math.min(totalIndex, items.length - 1))
        }

        // DEEP LOG: Selection params
        logger.log('NAV', 'getActiveItemAtScroll RESULT', {
            scrollLeft,
            stride,
            rawIndex,
            totalIndex,
            activeIndex,
            bufferBeforeCount,
            itemId: (items[activeIndex] as any)?.id,
            title: (items[activeIndex] as any)?.title
        })

        return items[activeIndex] || null
    }, [layout.cardWidth, layout.gap, layout.domStride, items, infinite, bufferBeforeCount, isMobile, eagerSelectionOnMobile])

    const onScrollToItemComplete = useCallback((source: string) => {
        const el = draggableRef.current
        if (!el) return

        const ctx = getContext()
        // INTERRUPTION GUARD: If target is already null, it was interrupted by 
        // PointerDown/Wheel/TouchStart. We MUST NOT restore snap because 
        // the user is now manually controlling the carousel.
        if (ctx.pendingTarget === null && source !== 'safety-timeout') {
            // We can't easily get the click ID here without passing it through, 
            // but strictly speaking we just need to know if we should cleanup.
            // If debugging is needed we can add context.
            logger.log('NAV', `ScrollToItem found pending=null (interrupted) via ${source}`)
            return
        }

        if (ctx.isPreTeleporting) {
            logger.log('NAV', `ScrollToItem finished but isPreTeleporting=true, skipping cleanup`)
            return
        }

        logger.log('NAV', `ScrollToItem complete via ${source}!`)
        transition({ type: 'SCROLL_COMPLETE' })
        if (infinite && el) {
            el.style.scrollSnapType = ''
            logger.log('NAV', `Snap restored after ScrollToItem`)
        }
    }, [infinite, draggableRef, getContext, transition])

    const { waitForScrollCompletion: waitForScrollCompletionForClick } = useScrollCompletion({
        ref: draggableRef,
        onComplete: onScrollToItemComplete,
        // We can reuse the snapTimeoutRef for safety, or let the hook manage its own.
        // Since scrollToThisItem used snapTimeoutRef as "safety net" before, we can pass it.
        // BUT wait, snapTimeoutRef is usually for restoring snap.
        // Check legacy code: "snapTimeoutRef.current = setTimeout(...)". Yes, it was reusing that ref.
        timeoutRef: snapTimeoutRef,
    })

    const scrollToThisItem = useCallback((index: number) => {
        const el = draggableRef.current
        if (!el) return

        const stride = layout.cardWidth + layout.gap
        if (stride <= 0) return

        let targetScroll = index * stride

        // CORRECTION: Use DOM positioning for clicks to match initialization logic
        // If we use index * stride, we'll scroll to the wrong place due to the accumulated stride error.
        if (infinite && el.children[index]) {
            const targetNode = el.children[index] as HTMLElement
            // Scroll so item center aligns with container center
            const itemCenter = targetNode.offsetLeft + (targetNode.offsetWidth / 2)
            const containerCenter = el.clientWidth / 2
            targetScroll = Math.max(0, itemCenter - containerCenter)
            logger.log('INTERACT', `Calculated DOM target for click`, { index, itemCenter, containerCenter, targetScroll })
        }

        // For infinite carousels, disable snap to prevent interference
        if (infinite) {
            el.style.scrollSnapType = 'none'
        }

        const thisClickId = Math.floor(Math.random() * 1000)
        logger.log('INTERACT', `━━━ Item Click #${thisClickId} START ━━━`, { index, targetScroll })

        transition({ type: 'ITEM_CLICK', targetScroll })
        el.scrollTo({
            left: targetScroll,
            behavior: 'smooth',
        })

        // SNAPPY: Trigger selection change immediately when the user clicks
        const targetItem = getActiveItemAtScroll(targetScroll)
        if (targetItem && onActiveItemChange) {
            lastActiveItemRef.current = targetItem
            onActiveItemChange(targetItem)
        }

        // CLEARANCE LOGIC: Use the shared hook to detect scroll completion
        waitForScrollCompletionForClick()
    }, [layout, draggableRef, infinite, getActiveItemAtScroll, onActiveItemChange, waitForScrollCompletionForClick, transition])

    // Navigation Hook - Phase 2: uses coordinator as single source of truth
    const { handleScrollNav, scrollLeft, scrollRight } = useCarouselNavigation({
        containerRef: draggableRef,
        infinite: !!infinite,
        layout: { cardWidth: layout.cardWidth, gap: layout.gap },
        cancelMomentum,
        preTeleport,
        coordinator: { transition, getPhase, getContext, contextRef, isBusy: () => getPhase() !== 'IDLE', isBlocking: () => getPhase() === 'BOUNCING' || getPhase() === 'TELEPORTING' },
        onNavigate: (targetScroll) => {
            const targetItem = getActiveItemAtScroll(targetScroll)
            if (targetItem && onActiveItemChange) {
                lastActiveItemRef.current = targetItem
                onActiveItemChange(targetItem)
            }
        },
        logger,
    })

    const activeItemCallbackRef = useRef(onActiveItemChange)
    activeItemCallbackRef.current = onActiveItemChange
    const getterRef = useRef(getActiveItemAtScroll)
    getterRef.current = getActiveItemAtScroll

    // Track last scroll position to determine direction for eager updates
    const lastScrollLeftRef = useRef(0)
    // Track last meaningful direction to prevent jitter/flicker in eager zones
    const lastMeaningfulDirectionRef = useRef(0)

    useEffect(() => {
        const currentCallback = activeItemCallbackRef.current
        if (!currentCallback || items.length === 0) return
        const el = draggableRef.current
        if (!el) return

        let timeoutId: NodeJS.Timeout

        const emitActiveItem = (scrollLeft: number) => {
            const ctx = contextRef.current
            // If we are currently teleporting, the scroll position is in flux
            if (ctx.isTeleporting) {
                lastScrollLeftRef.current = scrollLeft
                return
            }

            // If we are animating to a specific target (arrow click or direct click),
            // ignore intermediate scroll events.
            if (ctx.pendingTarget !== null) {
                lastScrollLeftRef.current = scrollLeft
                return
            }

            // Determine direction: 1 = Right, -1 = Left, 0 = Idle
            // STABILIZATION: Use a hysteresis threshold (e.g., 5px) to avoid flipping direction
            // on micro-movements or touch noise, which causes eager selection flickering.
            const delta = scrollLeft - lastScrollLeftRef.current
            let direction = lastMeaningfulDirectionRef.current

            if (Math.abs(delta) > 5) {
                direction = delta > 0 ? 1 : -1
                lastMeaningfulDirectionRef.current = direction
            }

            // Pass stabilized direction to getter for eager selection
            const activeItem = getterRef.current(scrollLeft, direction)

            // Use a stable reference check to avoid redundant calls
            if (activeItem && activeItem !== lastActiveItemRef.current) {
                lastActiveItemRef.current = activeItem
                // Always call the latest version of the callback
                if (activeItemCallbackRef.current) {
                    activeItemCallbackRef.current(activeItem)
                }
            }

            lastScrollLeftRef.current = scrollLeft
        }

        const handleScrollEnd = () => {
            emitActiveItem(el.scrollLeft)
        }

        const handleScrollImmediate = () => {
            emitActiveItem(el.scrollLeft)
        }

        const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window

        const scrollFallbackListener = () => {
            clearTimeout(timeoutId)
            timeoutId = setTimeout(handleScrollEnd, 150)
        }

        if (supportsScrollEnd) {
            el.addEventListener('scrollend', handleScrollEnd)
        } else {
            el.addEventListener('scroll', scrollFallbackListener, { passive: true })
        }

        el.addEventListener('scroll', handleScrollImmediate, { passive: true })

        return () => {
            el.removeEventListener('scrollend', handleScrollEnd)
            el.removeEventListener('scroll', scrollFallbackListener)
            el.removeEventListener('scroll', handleScrollImmediate)
            clearTimeout(timeoutId)
        }
    }, [items.length]) // Only items.length matters now, callback changes are handled via ref

    // Re-apply visuals after render
    useIsomorphicLayoutEffect(() => {
        const el = draggableRef.current
        if (!el) return

        // Phase 2: Safe Initial Measurement
        // INITIAL RENDER ONLY: Measure synchronously before paint to prevent flicker
        if (isCacheDirty.current) {
            updateCache(el)
            isCacheDirty.current = false
        }
        applyVisuals(el)
    })


    // Interaction tracking to prevent "Ghost Interruption"
    // If user clicks an arrow, we don't want a subsequent "ghost" pointerdown (or fat finger overlap)
    // to immediately interrupt the scroll we just started.
    const lastInteractionRef = useRef(0)

    const handleArrowClick = (direction: 'left' | 'right') => {
        lastInteractionRef.current = Date.now()
        if (direction === 'left') scrollLeft()
        else scrollRight()
    }

    return (
        <div
            className="base-carousel-container relative carousel-hover-group overflow-hidden"
            style={{
                paddingTop: verticalPadding,
                paddingBottom: verticalPadding
            }}
        >
            <CarouselArrow direction="left" onClick={() => handleArrowClick('left')} className="prev" />

            {/* SKELETON LOADER OVERLAY - shows while infinite carousel initializes */}
            {infinite && !isReady && (
                <div
                    className="absolute inset-0 z-10 flex gap-6 overflow-hidden pointer-events-none px-4"
                    aria-hidden="true"
                    style={{
                        paddingTop: 0,
                        paddingBottom: 0,
                    }}
                >
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className={`flex-shrink-0 ${widthClass} ${itemClassName}`}
                        >
                            {renderSkeleton ? renderSkeleton(i) : (
                                <div className="w-full h-full bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 animate-pulse rounded-md" style={{ minHeight: '200px' }} />
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div
                onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                    // GRACE PERIOD CHECK:
                    // If an arrow was clicked < 400ms ago, ignore this pointer down.
                    // This handles "Ghost Clicks" (simulated mouse events after touch) 
                    // and "Fat Finger" issues (touching container while tapping arrow).
                    const timeSinceInteraction = Date.now() - lastInteractionRef.current
                    if (timeSinceInteraction < 400) {
                        logger.log('INTERACT', `Ignoring PointerDown during grace period (${timeSinceInteraction}ms)`)
                        // Prevent this event from triggering browser defaults that might mess us up
                        e.preventDefault()
                        return
                    }

                    const hadPendingScroll = contextRef.current.pendingTarget !== null

                    // 1. Clear pending arrow scroll target when user starts dragging
                    if (hadPendingScroll) {
                        logger.log('INTERACT', 'PointerDown: Interrupting programmatic scroll')
                        transition({ type: 'USER_INTERRUPT' })  // Coordinator: SCROLLING -> IDLE (clears pendingTarget)
                        // Force an immediate visual refresh since the smooth scroll stopped
                        if (draggableRef.current) applyVisuals(draggableRef.current)
                    }
                    if (snapTimeoutRef.current) {
                        logger.log('INTERACT', 'PointerDown: Clearing snap timeout')
                        clearTimeout(snapTimeoutRef.current)
                        snapTimeoutRef.current = null
                    }

                    // For touch - always restore snap after interrupting programmatic scroll
                    // (Mouse/pen drags will disable snap again below)
                    if (draggableRef.current && e.pointerType === 'touch') {
                        draggableRef.current.style.scrollSnapType = ''
                    }

                    // 2. Only disable snap for mouse/pen drags
                    if (e.pointerType !== 'touch' && draggableRef.current) {
                        draggableRef.current.style.scrollSnapType = 'none'
                    }

                    // 3. Reset direction tracking for new swipe (prevents stale direction from previous swipe)
                    lastMeaningfulDirectionRef.current = 0

                    // 4. Call the draggable hook's handler
                    events.onPointerDown(e)
                }}
                onWheel={() => {
                    // Clear pending scroll target if user uses mouse wheel
                    if (contextRef.current.pendingTarget !== null) {
                        logger.log('INTERACT', 'Wheel: Interrupting programmatic scroll')
                        transition({ type: 'USER_INTERRUPT' })  // Coordinator: SCROLLING -> IDLE (clears pendingTarget)
                        if (draggableRef.current) draggableRef.current.style.scrollSnapType = ''
                    }
                    if (snapTimeoutRef.current) {
                        logger.log('INTERACT', 'Wheel: Clearing snap timeout')
                        clearTimeout(snapTimeoutRef.current)
                        snapTimeoutRef.current = null
                    }
                }}
                onTouchStart={() => {
                    // Mobile Optimization: Minimal logic here.
                    // 1. Clear timeout if exists (sync but cheap)
                    if (snapTimeoutRef.current) {
                        clearTimeout(snapTimeoutRef.current)
                        snapTimeoutRef.current = null
                    }
                    // 2. Do NOT transition coordinator state here (too expensive).
                    // Let the native scroll happen or useDraggableScroll handle the gesture.
                }}
                className={`base-carousel flex items-stretch overflow-x-auto overscroll-x-none scrollbar-hide select-none ${snap ? `snap-x snap-${snapType}` : ''}`}
                onPointerUp={events.onPointerUp}
                onPointerMove={events.onPointerMove}
                onLostPointerCapture={events.onLostPointerCapture}
                onClickCapture={events.onClickCapture}
                onDragStart={events.onDragStart}
                ref={setCarouselRef}
                style={{
                    gap: `${resolvedGap}px`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    scrollBehavior: 'auto',
                    // Optimization: tell browser this element is independent for rendering
                    contain: 'paint layout',
                    // Only apply center-padding for infinite carousels
                    // Finite carousels should start/end at the edges
                    ...(infinite ? {
                        paddingLeft: `calc(50% - ${layout.cardWidth / 2}px)`,
                        paddingRight: `calc(50% - ${layout.cardWidth / 2}px)`,
                        scrollPaddingLeft: `calc(50% - ${layout.cardWidth / 2}px)`,
                        scrollPaddingRight: `calc(50% - ${layout.cardWidth / 2}px)`,
                    } : {
                        paddingLeft: '16px',
                        paddingRight: '16px',
                        scrollPaddingLeft: '16px',
                        scrollPaddingRight: '16px',
                    }),
                    minHeight: 0,
                    opacity: (isReady || isInstant) ? 1 : 0,
                }}
            >
                {useMemo(() => allItems.map((item, index) => {
                    // Unique keys for clones
                    let type = 'item'
                    // Check logic for types if needed or just use index prefixes
                    // Buffer Before: 0 to bufferBeforeCount - 1
                    // Original: bufferBeforeCount to bufferBeforeCount + items.length - 1
                    // Buffer After: Rest
                    let realIndex = 0
                    if (infinite) {
                        if (index < bufferBeforeCount) {
                            type = 'clone-before'
                            realIndex = index % items.length
                        } else if (index >= bufferBeforeCount + items.length) {
                            type = 'clone-after'
                            realIndex = (index - bufferBeforeCount - items.length) % items.length
                        } else {
                            type = 'original'
                            realIndex = index - bufferBeforeCount
                        }
                    } else {
                        realIndex = index
                    }

                    const key = `${type}-${getItemKey(item, realIndex)}-${index}`
                    // Use snap-start for finite carousels (edge alignment), snap-center for infinite
                    const snapAlignment = infinite ? 'snap-center' : 'snap-start'

                    return (
                        <div
                            key={key}
                            className={`carousel-item flex-shrink-0 ${widthClass} ${itemClassName} cursor-pointer ${snapAlignment} snap-stop-always`}
                            style={{
                                WebkitFontSmoothing: 'subpixel-antialiased',
                                WebkitTapHighlightColor: 'transparent',
                                scrollSnapStop: 'always',
                                contain: 'layout paint',
                            }}
                        >
                            {renderItem(item, realIndex, { scrollToItem: () => scrollToThisItem(index) })}
                        </div>
                    )
                }), [allItems, infinite, bufferBeforeCount, items.length, getItemKey, renderItem, widthClass, itemClassName, scrollToThisItem])}
            </div>
            <CarouselArrow direction="right" onClick={() => handleArrowClick('right')} className="next" />
        </div >
    )
}

// Cast to any to allow generic props to pass through React.memo
// This is a common pattern for generic memoized components
export const Carousel = memo(BaseCarouselInner) as typeof BaseCarouselInner
