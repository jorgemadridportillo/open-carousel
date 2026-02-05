import { useCallback, useRef, useEffect } from 'react'
import { VISUAL_CONFIG } from '../config'
import type { CarouselLoggerInstance } from '../logger'

export interface UseCarouselVisualsOptions {
    /** Layout measurements */
    layout: { cardWidth: number; gap: number }
    /** Number of items (used to detect cache invalidation) */
    itemsCount: number
    /** Buffer items before original set */
    bufferBeforeCount: number
    /** Disable opacity effect */
    disableOpacityEffect: boolean
    /** Disable scale effect */
    disableScaleEffect: boolean
    /** Optional logger for debugging */
    logger?: CarouselLoggerInstance
}

export interface ChildPosition {
    left: number
    width: number
}

/**
 * Hook that manages visual effects for carousel items.
 * Handles:
 * - Position cache for children (offsetLeft, offsetWidth)
 * - Container width cache (to avoid layout thrashing)
 * - Apply visual effects (scale, opacity, shadow, z-index)
 * - Viewport culling (skip items outside visible area)
 */
export function useCarouselVisuals({
    layout,
    itemsCount,
    bufferBeforeCount,
    disableOpacityEffect,
    disableScaleEffect,
    logger,
}: UseCarouselVisualsOptions) {
    // Position cache for all children
    const childrenPositions = useRef<ChildPosition[]>([])
    const isCacheDirty = useRef(true)

    // Container width cache (avoids reflow when reading clientWidth after scrollLeft write)
    const containerWidthRef = useRef(0)
    const isContainerWidthDirty = useRef(true)

    // Mark cache dirty when items change
    useEffect(() => {
        isCacheDirty.current = true
        isContainerWidthDirty.current = true
        logger?.log('VISUALS', 'Marked cache dirty', { itemsCount, bufferBeforeCount })
    }, [itemsCount, bufferBeforeCount, logger])

    /**
     * Update the position cache for all children
     */
    const updateCache = useCallback((el: HTMLElement) => {
        childrenPositions.current = Array.from(el.children).map((child) => {
            const node = child as HTMLElement
            return {
                left: node.offsetLeft,
                width: node.offsetWidth,
            }
        })
        logger?.log('VISUALS', 'Updated positions cache', { count: childrenPositions.current.length })
    }, [logger])

    /**
     * Apply visual effects (scale, opacity, shadow) to visible items
     * Uses position cache to avoid layout thrashing
     */
    const applyVisuals = useCallback((el: HTMLElement, overrideScrollLeft?: number) => {
        // OPTIMIZATION: Use override value if provided to avoid DOM Read after Write
        const currentScrollLeft = overrideScrollLeft ?? el.scrollLeft

        // Cache container width to avoid reflow
        if (isContainerWidthDirty.current || containerWidthRef.current === 0) {
            containerWidthRef.current = el.clientWidth
            isContainerWidthDirty.current = false
        }

        const containerCenter = currentScrollLeft + containerWidthRef.current / 2
        if (childrenPositions.current.length === 0) {
            logger?.log('VISUALS', 'Skipping: positions cache empty')
            return
        }
        const positions = childrenPositions.current

        // Skip if both effects are disabled
        if (disableOpacityEffect && disableScaleEffect) return

        // Responsive breakpoints
        const width = window.innerWidth
        const isMobile = width < 640
        const isTablet = width < 1024

        const maxDist = isMobile
            ? VISUAL_CONFIG.MAX_DIST_MOBILE
            : isTablet
                ? VISUAL_CONFIG.MAX_DIST_TABLET
                : VISUAL_CONFIG.MAX_DIST_DESKTOP
        const baseScale = isMobile
            ? VISUAL_CONFIG.BASE_SCALE_MOBILE
            : isTablet
                ? VISUAL_CONFIG.BASE_SCALE_TABLET
                : VISUAL_CONFIG.BASE_SCALE_DESKTOP
        const scaleRange = 1 - baseScale

        // Viewport culling bounds
        const viewStart = currentScrollLeft - VISUAL_CONFIG.VIEW_BUFFER
        const viewEnd = currentScrollLeft + containerWidthRef.current + VISUAL_CONFIG.VIEW_BUFFER

        // OPTIMIZATION: Iterate HTMLCollection directly to avoid Array allocation (GC pressure)
        const count = el.children.length

        // Calculate stride for index-based culling
        const stride = layout.cardWidth + layout.gap
        const firstItemLeft = positions[0]?.left ?? 0

        // Calculate visible index range
        // We add a safety buffer of +/- 4 items to ensure we don't accidentally cull partially visible items due to sub-pixel rounding
        // or dynamic scaling transforms that might push items slightly out of their calculated slot
        let startIndex = 0
        let endIndex = count

        if (stride > 0) {
            // Formula: itemLeft = firstItemLeft + index * stride
            // Want: itemLeft + itemWidth > viewStart  -> index > (viewStart - itemWidth - firstItemLeft) / stride
            startIndex = Math.floor((viewStart - layout.cardWidth - firstItemLeft) / stride) - 4
            startIndex = Math.max(0, startIndex)

            // Want: itemLeft < viewEnd -> index < (viewEnd - firstItemLeft) / stride
            endIndex = Math.ceil((viewEnd - firstItemLeft) / stride) + 4
            endIndex = Math.min(count, endIndex)
        }

        const loopStart = performance.now()
        let processedCount = 0

        for (let i = startIndex; i < endIndex; i++) {
            const child = el.children[i] as HTMLElement
            const pos = positions[i]
            if (!pos) continue

            // Double check bounds (cheap) just in case calc was off
            if (pos.left + pos.width < viewStart || pos.left > viewEnd) {
                continue
            }

            processedCount++

            const childCenter = pos.left + pos.width / 2
            const dist = Math.abs(containerCenter - childCenter)

            // Cubic easing for smooth falloff
            const normDist = Math.min(dist / maxDist, 1)
            const factor = 1 - normDist
            const easeFactor = 1 - Math.pow(1 - factor, 3)

            const opacity = 0.5 + (0.5 * easeFactor)

            if (!disableOpacityEffect) {
                child.style.opacity = `${opacity}`
                if (dist < VISUAL_CONFIG.CENTER_THRESHOLD) child.style.opacity = '1'
            }

            const zIndex = Math.round(easeFactor * 100)
            child.style.zIndex = `${zIndex}`

            // PERF: Dynamic box-shadow animations trigger a "Paint" on every frame, which is very expensive (>1ms/frame).
            // We disable this by default to maintain 60fps, especially with many items on screen.
            if (!disableScaleEffect && !VISUAL_CONFIG.DISABLE_DYNAMIC_SHADOW) {
                const shadowOpacity = 0.12 * easeFactor
                child.style.boxShadow = `0 10px 20px -5px rgba(0, 0, 0, ${shadowOpacity})`
            }

            if (!disableScaleEffect) {
                const scale = baseScale + (scaleRange * easeFactor)
                child.style.transform = `scale(${scale})`
            }
        }

        const loopDuration = performance.now() - loopStart
        // Only log "heavy" frames to avoid console spam (default threshold 1ms)
        if (loopDuration > 1.0) {
            logger?.log('PERF', `Visuals Loop: ${loopDuration.toFixed(2)}ms`, {
                processed: processedCount,
                total: count,
                range: `${startIndex}-${endIndex}`
            })
        }
    }, [disableOpacityEffect, disableScaleEffect, logger, layout])

    return {
        /** Position cache for all children */
        childrenPositions,
        /** Whether the cache needs to be rebuilt */
        isCacheDirty,
        /** Container width cache ref */
        containerWidthRef,
        /** Whether container width needs to be remeasured */
        isContainerWidthDirty,
        /** Update the position cache */
        updateCache,
        /** Apply visual effects to visible items */
        applyVisuals,
    }
}
