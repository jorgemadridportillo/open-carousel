import { useRef, useCallback, useEffect } from 'react'
import { TIMING_CONFIG } from '../config'

export interface UseScrollCompletionOptions {
    ref: React.RefObject<HTMLElement | null>
    onComplete: (source: string) => void
    /** Optional shared ref to track the listener for cleanup */
    listenerRef?: React.MutableRefObject<(() => void) | null>
    /** Optional shared ref for the safety timeout */
    timeoutRef?: React.MutableRefObject<NodeJS.Timeout | null>
}

/**
 * Hook to handle scroll completion detection across browsers.
 * Uses native `scrollend` event where available, falls back to debounce pattern.
 */
export function useScrollCompletion({
    ref,
    onComplete,
    listenerRef,
    timeoutRef
}: UseScrollCompletionOptions) {
    // Internal refs if external ones aren't provided
    const internalListenerRef = useRef<(() => void) | null>(null)
    const activeListenerRef = listenerRef || internalListenerRef

    const internalTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const activeTimeoutRef = timeoutRef || internalTimeoutRef

    // Check support once
    const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window

    /**
     * Starts listening for scroll completion.
     * @param timeoutDuration Override default timeout duration (for safety net)
     */
    const waitForScrollCompletion = useCallback((timeoutDuration = TIMING_CONFIG.SCROLL_IDLE_FALLBACK_MS) => {
        const el = ref.current
        if (!el) return

        // Cleanup previous listeners
        if (activeListenerRef.current) {
            el.removeEventListener('scrollend', activeListenerRef.current)
            el.removeEventListener('scroll', activeListenerRef.current) // In case it was the debounce one
            activeListenerRef.current = null
        }
        if (activeTimeoutRef.current) {
            clearTimeout(activeTimeoutRef.current)
            activeTimeoutRef.current = null
        }

        if (supportsScrollEnd) {
            // NATIVE: Use scrollend
            const listener = () => {
                activeListenerRef.current = null
                onComplete('scrollend')
            }
            activeListenerRef.current = listener
            el.addEventListener('scrollend', listener, { once: true })
        } else {
            // FALLBACK: Debounce pattern
            let debounceTimer: NodeJS.Timeout

            const debounceListener = () => {
                clearTimeout(debounceTimer)
                debounceTimer = setTimeout(() => {
                    if (activeListenerRef.current) {
                        el.removeEventListener('scroll', activeListenerRef.current)
                        activeListenerRef.current = null
                    }
                    if (activeTimeoutRef.current) {
                        clearTimeout(activeTimeoutRef.current)
                        activeTimeoutRef.current = null
                    }
                    onComplete('debounce')
                }, TIMING_CONFIG.SCROLL_DEBOUNCE_FALLBACK_MS)
            }

            activeListenerRef.current = debounceListener
            el.addEventListener('scroll', debounceListener, { passive: true })

            // Safety net: in case scroll never starts
            activeTimeoutRef.current = setTimeout(() => {
                if (activeListenerRef.current) {
                    el.removeEventListener('scroll', activeListenerRef.current)
                    activeListenerRef.current = null
                }
                onComplete('safety-timeout')
            }, timeoutDuration)
        }
    }, [ref, onComplete, supportsScrollEnd])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            const el = ref.current
            if (el && activeListenerRef.current) {
                el.removeEventListener('scrollend', activeListenerRef.current)
                el.removeEventListener('scroll', activeListenerRef.current)
            }
            if (activeTimeoutRef.current) {
                clearTimeout(activeTimeoutRef.current)
            }
        }
    }, [ref])

    return {
        waitForScrollCompletion
    }
}
