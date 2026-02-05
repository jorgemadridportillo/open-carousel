import { useRef, useCallback, useEffect } from 'react'

export interface UseCarouselPersistenceOptions {
    /** Unique key for this carousel's scroll position in sessionStorage */
    persistKey?: string
    /** Debounce delay in ms for saving scroll position. Default: 150 */
    debounceMs?: number
}

export interface UseCarouselPersistenceReturn {
    /** Get saved scroll position from sessionStorage (null if not found) */
    getSavedPosition: () => number | null
    /** Save current scroll position to sessionStorage (debounced) */
    savePosition: (scrollLeft: number) => void
    /** Immediately save position (no debounce, for unmount) */
    savePositionImmediate: (scrollLeft: number) => void
    /** Clear saved position from sessionStorage */
    clearPosition: () => void
}

/**
 * Hook for persisting carousel scroll position across navigation.
 * 
 * Uses sessionStorage so position survives:
 * - Browser back/forward navigation
 * - Same-tab navigation
 * 
 * But resets on:
 * - New tab/window
 * - Browser close
 * 
 * @example
 * ```tsx
 * const { getSavedPosition, savePosition } = useCarouselPersistence({ 
 *   persistKey: 'homepage-featured' 
 * })
 * 
 * // On mount
 * useEffect(() => {
 *   const saved = getSavedPosition()
 *   if (saved !== null) containerRef.current.scrollLeft = saved
 * }, [])
 * 
 * // On scroll
 * const handleScroll = () => savePosition(containerRef.current.scrollLeft)
 * ```
 */
export function useCarouselPersistence({
    persistKey,
    debounceMs = 150,
}: UseCarouselPersistenceOptions = {}): UseCarouselPersistenceReturn {
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const lastSavedRef = useRef<number | null>(null)

    // Build storage key
    const storageKey = persistKey ? `carousel-scroll-${persistKey}` : null

    const getSavedPosition = useCallback((): number | null => {
        if (!storageKey) return null

        try {
            const stored = sessionStorage.getItem(storageKey)
            if (stored === null) return null

            const parsed = parseInt(stored, 10)
            return Number.isFinite(parsed) ? parsed : null
        } catch {
            // sessionStorage may throw in private mode or when disabled
            return null
        }
    }, [storageKey])

    const savePositionImmediate = useCallback((scrollLeft: number) => {
        if (!storageKey) return
        if (!Number.isFinite(scrollLeft)) return

        // Skip if value hasn't changed (optimization)
        if (lastSavedRef.current === scrollLeft) return
        lastSavedRef.current = scrollLeft

        try {
            sessionStorage.setItem(storageKey, String(Math.round(scrollLeft)))
        } catch {
            // sessionStorage may throw when full or in private mode
        }
    }, [storageKey])

    const savePosition = useCallback((scrollLeft: number) => {
        if (!storageKey) return

        // Clear previous debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }

        // Debounce the save
        debounceTimerRef.current = setTimeout(() => {
            savePositionImmediate(scrollLeft)
        }, debounceMs)
    }, [storageKey, debounceMs, savePositionImmediate])

    const clearPosition = useCallback(() => {
        if (!storageKey) return

        try {
            sessionStorage.removeItem(storageKey)
            lastSavedRef.current = null
        } catch {
            // Ignore errors
        }
    }, [storageKey])

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    return {
        getSavedPosition,
        savePosition,
        savePositionImmediate,
        clearPosition,
    }
}
