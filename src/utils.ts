/**
 * Calculate the index of the item currently at the center of the viewport
 */
export function calculateCenterIndex(scrollLeft: number, stride: number): number {
    if (stride <= 0) return 0
    return Math.round(scrollLeft / stride)
}

/**
 * Determine if a teleport is needed based on scroll position
 */
export function shouldTeleport(
    scrollLeft: number,
    bufferWidth: number,
    rightThreshold: number
): 'left' | 'right' | null {
    if (scrollLeft < bufferWidth) return 'left'
    if (scrollLeft >= rightThreshold) return 'right'
    return null
}

/**
 * Calculate visual scale for an item based on distance from center
 */
export function calculateVisualScale(
    distanceFromCenter: number,
    halfViewport: number,
    baseScale: number
): number {
    const normalizedDistance = Math.min(distanceFromCenter / halfViewport, 1)
    return baseScale + (1 - baseScale) * (1 - normalizedDistance)
}

/**
 * Calculate visual opacity for an item based on distance from center
 */
export function calculateVisualOpacity(
    distanceFromCenter: number,
    halfViewport: number,
    baseOpacity: number,
    centerThreshold: number
): number {
    if (distanceFromCenter < centerThreshold) return 1
    const normalizedDistance = Math.min(distanceFromCenter / halfViewport, 1)
    // Formula matches BaseCarousel.tsx: 0.5 + (0.5 * easeFactor)
    // normalizedDistance = 0 (center) -> opacity 1
    // normalizedDistance = 1 (edge) -> opacity baseOpacity
    return baseOpacity + (1 - baseOpacity) * (1 - normalizedDistance)
}

/**
 * Calculate next scroll target for rapid-click navigation
 * Implements the "Catch-Up & Advance" strategy
 */
export function calculateRapidClickTarget(
    pendingTarget: number | null,
    currentScroll: number,
    direction: 1 | -1,
    stride: number
): { shouldCatchUp: boolean; previousTarget: number | null; nextTarget: number } {
    if (pendingTarget !== null) {
        return {
            shouldCatchUp: true,
            previousTarget: pendingTarget,
            nextTarget: pendingTarget + (direction * stride)
        }
    }
    const currentIndex = Math.round(currentScroll / stride)
    return {
        shouldCatchUp: false,
        previousTarget: null,
        nextTarget: (currentIndex + direction) * stride
    }
}

/**
 * Calculate teleport offset
 */
export function calculateTeleportOffset(
    direction: 'left' | 'right',
    originalSetWidth: number
): number {
    return direction === 'left' ? originalSetWidth : -originalSetWidth
}

/**
 * Check if scroll position is close enough to target
 */
export function isAtTarget(
    currentPos: number,
    targetPos: number,
    tolerance: number
): boolean {
    return Math.abs(currentPos - targetPos) <= tolerance
}

/**
 * Create tripled items array for infinite scroll
 */
export function createTripleBuffer<T>(items: T[]): T[] {
    return [...items, ...items, ...items]
}
