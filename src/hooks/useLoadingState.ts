import { useState, useEffect, useRef, useCallback } from 'react'

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ SESSION CACHE: Tracks which resources have been loaded this session         │
// │                                                                             │
// │ KNOWN LIMITATION (Safari iOS):                                              │
// │ This in-memory Set may be cleared when Safari aggressively reclaims memory: │
// │   - Tab backgrounding under memory pressure                                 │
// │   - Long scroll away from component (DOM virtualization)                    │
// │   - Extended inactivity (30+ minutes)                                       │
// │                                                                             │
// │ FUTURE ENHANCEMENT (if Safari issues persist):                              │
// │ Add sessionStorage fallback - replace seenResources.has(key) with:          │
// │   function hasBeenSeen(key: string): boolean {                              │
// │     if (seenResources.has(key)) return true                                 │
// │     if (typeof sessionStorage !== 'undefined') {                            │
// │       return sessionStorage.getItem(`seen-${key}`) === '1'                  │
// │     }                                                                        │
// │     return false                                                             │
// │   }                                                                          │
// │ And update markAsSeen to write to both memory and sessionStorage.           │
// └─────────────────────────────────────────────────────────────────────────────┘
const seenResources = new Set<string>()

export interface UseLoadingStateOptions {
    /** Unique key for session cache. If provided, enables caching behavior. */
    cacheKey?: string
    /** Delay in ms before showing skeleton. Default: 500 */
    skeletonDelay?: number
    /** Hard fallback timeout in ms. Guarantees isReady after this. Default: 3000 */
    fallbackTimeout?: number
    /** 
     * If true, start in ready state immediately (e.g., for already-mounted carousels).
     * Useful when the component should skip the loading phase entirely.
     */
    startReady?: boolean
}

export interface UseLoadingStateReturn {
    /** True when resource is loaded OR fallback has fired */
    isReady: boolean
    /** True if loading takes longer than skeletonDelay AND resource is not cached */
    showSkeleton: boolean
    /** True if resource was cached (instant load, no fade needed) */
    isInstant: boolean
    /** Call this when your resource finishes loading (e.g., image onLoad) */
    markReady: () => void
}

/**
 * Unified hook for managing loading states with:
 * - First load: fade in, optional skeleton after delay
 * - Cached load: instant (no fade, no skeleton)
 * - Strict fallback: guaranteed ready after timeout
 */
export function useLoadingState({
    cacheKey,
    skeletonDelay = 500,
    fallbackTimeout = 3000,
    startReady = false,
}: UseLoadingStateOptions = {}): UseLoadingStateReturn {
    // Check if this resource was seen before in this session
    const wasCached = cacheKey ? seenResources.has(cacheKey) : false

    const [isReady, setIsReady] = useState(startReady || wasCached)
    const [showSkeleton, setShowSkeleton] = useState(false)
    const [isInstant] = useState(wasCached)

    // Refs to prevent stale closures and duplicate executions
    const mountedRef = useRef(true)
    const readyFiredRef = useRef(startReady || wasCached)
    const skeletonTimerRef = useRef<NodeJS.Timeout | null>(null)
    const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Mark resource as ready (called by consumer, e.g., onLoad)
    const markReady = useCallback(() => {
        if (readyFiredRef.current) return
        readyFiredRef.current = true

        // Clear timers
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current)
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)

        // Add to cache
        if (cacheKey) seenResources.add(cacheKey)

        // Update state
        if (mountedRef.current) {
            setIsReady(true)
            setShowSkeleton(false)
        }
    }, [cacheKey])

    useEffect(() => {
        mountedRef.current = true

        // If already ready (cached or startReady), skip all timers
        if (readyFiredRef.current) return

        // Start skeleton delay timer
        skeletonTimerRef.current = setTimeout(() => {
            if (mountedRef.current && !readyFiredRef.current) {
                setShowSkeleton(true)
            }
        }, skeletonDelay)

        // Start hard fallback timer
        fallbackTimerRef.current = setTimeout(() => {
            if (mountedRef.current && !readyFiredRef.current) {
                readyFiredRef.current = true
                if (cacheKey) seenResources.add(cacheKey)
                setIsReady(true)
                setShowSkeleton(false)
            }
        }, fallbackTimeout)

        return () => {
            mountedRef.current = false
            if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current)
            if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
        }
    }, [cacheKey, skeletonDelay, fallbackTimeout])

    return { isReady, showSkeleton, isInstant, markReady }
}

/**
 * Utility to clear the session cache (for testing)
 */
export function clearLoadingStateCache() {
    seenResources.clear()
}
