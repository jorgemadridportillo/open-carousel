import { useRef, useCallback } from 'react'
import type { CarouselLoggerInstance } from '../logger'

// ═══════════════════════════════════════════════════════════════════════════
// PHASE ENUM - Single source of truth for carousel state
// ═══════════════════════════════════════════════════════════════════════════

export type CarouselPhase =
    | 'UNINITIALIZED'   // Before first render/measurement
    | 'IDLE'            // Ready for user interaction
    | 'SCROLLING'       // Smooth scroll animation in progress
    | 'BOUNCING'        // Edge bounce animation (finite carousels only)
    | 'PRE_TELEPORTING' // About to teleport (calculating offset)
    | 'TELEPORTING'     // Mid-teleport (scroll position being adjusted)
    | 'DRAGGING'        // User is actively dragging

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT - Consolidated state object (replaces 10+ scattered refs)
// ═══════════════════════════════════════════════════════════════════════════

export interface CarouselContext {
    // Current phase (single source of truth)
    phase: CarouselPhase

    // Navigation state
    pendingTarget: number | null      // Target scroll position for smooth scroll
    scrollDirection: -1 | 1 | null    // Direction of current/last scroll

    // Teleport state (matches legacy refs for Phase 2-3 migration)
    teleportOffset: number | null     // Amount to adjust after teleport
    isTeleporting: boolean            // Whether mid-teleport adjustment is happening
    isPreTeleporting: boolean         // Whether calculating teleport offset

    // Active item tracking
    lastActiveItemKey: string | null  // Key of last emitted active item (for dedup)

    // Timer IDs (for cleanup - we store IDs, caller manages actual timers)
    snapTimeoutId: ReturnType<typeof setTimeout> | null
    scrollIdleTimeoutId: ReturnType<typeof setTimeout> | null
    bounceTimeoutId: ReturnType<typeof setTimeout> | null

    // Listener tracking (for cleanup)
    hasScrollEndListener: boolean
}

// Initial context state
const createInitialContext = (): CarouselContext => ({
    phase: 'UNINITIALIZED',
    pendingTarget: null,
    scrollDirection: null,
    teleportOffset: null,
    isTeleporting: false,
    isPreTeleporting: false,
    lastActiveItemKey: null,
    snapTimeoutId: null,
    scrollIdleTimeoutId: null,
    bounceTimeoutId: null,
    hasScrollEndListener: false,
})

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS - All possible state transitions
// ═══════════════════════════════════════════════════════════════════════════

export type CarouselAction =
    | { type: 'INITIALIZE' }
    | { type: 'ARROW_CLICK'; direction: -1 | 1; targetScroll: number }
    | { type: 'ITEM_CLICK'; targetScroll: number }
    | { type: 'SCROLL_COMPLETE' }
    | { type: 'USER_INTERRUPT' }  // PointerDown, Wheel, TouchStart
    | { type: 'START_BOUNCE'; timeoutId: ReturnType<typeof setTimeout> }
    | { type: 'END_BOUNCE' }
    | { type: 'START_PRE_TELEPORT' }
    | { type: 'EXECUTE_TELEPORT'; offset: number }
    | { type: 'END_TELEPORT' }
    | { type: 'START_DRAG' }
    | { type: 'END_DRAG' }
    | { type: 'SET_SNAP_TIMEOUT'; timeoutId: ReturnType<typeof setTimeout> }
    | { type: 'CLEAR_SNAP_TIMEOUT' }
    | { type: 'SET_SCROLL_IDLE_TIMEOUT'; timeoutId: ReturnType<typeof setTimeout> }
    | { type: 'CLEAR_SCROLL_IDLE_TIMEOUT' }
    | { type: 'SET_SCROLL_END_LISTENER'; hasListener: boolean }
    | { type: 'SET_ACTIVE_ITEM_KEY'; key: string | null }
    | { type: 'SET_TELEPORTING'; value: boolean }
    | { type: 'SET_PRE_TELEPORTING'; value: boolean }
    | { type: 'SET_PENDING_TARGET'; target: number }  // Unconditional update for pre-teleport

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER - Pure function for state transitions (no side effects, no logging)
// ═══════════════════════════════════════════════════════════════════════════

export function reduce(context: CarouselContext, action: CarouselAction): CarouselContext {
    switch (action.type) {
        case 'INITIALIZE': {
            return {
                ...context,
                phase: 'IDLE',
            }
        }

        case 'ARROW_CLICK': {
            // Can only start scrolling from IDLE or if already SCROLLING (rapid clicks)
            if (context.phase !== 'IDLE' && context.phase !== 'SCROLLING') {
                return context
            }
            return {
                ...context,
                phase: 'SCROLLING',
                pendingTarget: action.targetScroll,
                scrollDirection: action.direction,
            }
        }

        case 'ITEM_CLICK': {
            if (context.phase !== 'IDLE' && context.phase !== 'SCROLLING') {
                return context
            }
            return {
                ...context,
                phase: 'SCROLLING',
                pendingTarget: action.targetScroll,
                scrollDirection: null, // Direction not applicable for direct clicks
            }
        }

        case 'SCROLL_COMPLETE': {
            if (context.phase !== 'SCROLLING') {
                return context
            }
            return {
                ...context,
                phase: 'IDLE',
                pendingTarget: null,
                scrollDirection: null,
                hasScrollEndListener: false,
            }
        }

        case 'USER_INTERRUPT': {
            // User took control - cancel any programmatic scroll
            if (context.phase === 'SCROLLING') {
                return {
                    ...context,
                    phase: 'IDLE',
                    pendingTarget: null,
                    scrollDirection: null,
                }
            }
            return context
        }

        case 'START_BOUNCE': {
            if (context.phase !== 'IDLE') {
                return context
            }
            return {
                ...context,
                phase: 'BOUNCING',
                bounceTimeoutId: action.timeoutId,
            }
        }

        case 'END_BOUNCE': {
            if (context.phase !== 'BOUNCING') {
                return context
            }
            return {
                ...context,
                phase: 'IDLE',
                bounceTimeoutId: null,
            }
        }

        case 'START_PRE_TELEPORT': {
            // Can start pre-teleport from SCROLLING (arrow click near boundary)
            return {
                ...context,
                phase: 'PRE_TELEPORTING',
            }
        }

        case 'EXECUTE_TELEPORT': {
            if (context.phase !== 'PRE_TELEPORTING') {
                return context
            }
            return {
                ...context,
                phase: 'TELEPORTING',
                teleportOffset: action.offset,
            }
        }

        case 'END_TELEPORT': {
            if (context.phase !== 'TELEPORTING') {
                return context
            }
            // Return to SCROLLING if we have a pending target, otherwise IDLE
            const nextPhase = context.pendingTarget !== null ? 'SCROLLING' : 'IDLE'
            return {
                ...context,
                phase: nextPhase,
                teleportOffset: null,
            }
        }

        case 'START_DRAG': {
            return {
                ...context,
                phase: 'DRAGGING',
                pendingTarget: null, // Cancel any pending scroll
                scrollDirection: null,
            }
        }

        case 'END_DRAG': {
            if (context.phase !== 'DRAGGING') {
                return context
            }
            return {
                ...context,
                phase: 'IDLE',
            }
        }

        // Timer management actions (don't change phase)
        case 'SET_SNAP_TIMEOUT': {
            return { ...context, snapTimeoutId: action.timeoutId }
        }

        case 'CLEAR_SNAP_TIMEOUT': {
            return { ...context, snapTimeoutId: null }
        }

        case 'SET_SCROLL_IDLE_TIMEOUT': {
            return { ...context, scrollIdleTimeoutId: action.timeoutId }
        }

        case 'CLEAR_SCROLL_IDLE_TIMEOUT': {
            return { ...context, scrollIdleTimeoutId: null }
        }

        case 'SET_SCROLL_END_LISTENER': {
            return { ...context, hasScrollEndListener: action.hasListener }
        }

        case 'SET_ACTIVE_ITEM_KEY': {
            return { ...context, lastActiveItemKey: action.key }
        }

        case 'SET_TELEPORTING': {
            return { ...context, isTeleporting: action.value }
        }

        case 'SET_PRE_TELEPORTING': {
            if (action.value) {
                // Starting pre-teleport - just set the flag
                return { ...context, isPreTeleporting: true }
            } else {
                // Ending pre-teleport - transition back to SCROLLING if we have a pending target
                // This is critical: phase was PRE_TELEPORTING, now we need to resume scrolling
                const nextPhase = context.pendingTarget !== null ? 'SCROLLING' : 'IDLE'
                return {
                    ...context,
                    isPreTeleporting: false,
                    phase: nextPhase
                }
            }
        }

        case 'SET_PENDING_TARGET': {
            // Unconditional update - used by preTeleport to set adjusted target
            // This bypasses phase checks since pre-teleport needs to update target
            // regardless of current state
            return { ...context, pendingTarget: action.target }
        }

        default: {
            // TypeScript exhaustiveness check
            const _exhaustive: never = action
            return context
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK - Main coordinator hook
// ═══════════════════════════════════════════════════════════════════════════

export interface UseCarouselCoordinatorOptions {
    /** Optional logger for debugging */
    logger?: CarouselLoggerInstance
}

export interface UseCarouselCoordinatorReturn {
    /** Dispatch an action to transition state */
    transition: (action: CarouselAction) => CarouselContext
    /** Get current phase */
    getPhase: () => CarouselPhase
    /** Get full context (read-only snapshot) */
    getContext: () => Readonly<CarouselContext>
    /** Direct ref access (for passing to child hooks) */
    contextRef: React.MutableRefObject<CarouselContext>
    /** Check if currently in a "busy" phase (not idle) */
    isBusy: () => boolean
    /** Check if user interaction should be blocked */
    isBlocking: () => boolean
}

/**
 * Carousel Coordinator Hook
 * 
 * Consolidates all carousel state into a single ref-based state machine.
 * No re-renders triggered - all state is in refs.
 * 
 * @example
 * ```tsx
 * const { transition, getPhase, getContext } = useCarouselCoordinator({ logger })
 * 
 * // Check state
 * if (getPhase() === 'IDLE') {
 *   transition({ type: 'ARROW_CLICK', direction: 1, targetScroll: 500 })
 * }
 * 
 * // Later, on scroll complete
 * transition({ type: 'SCROLL_COMPLETE' })
 * ```
 */
export function useCarouselCoordinator(options?: UseCarouselCoordinatorOptions): UseCarouselCoordinatorReturn {
    const contextRef = useRef<CarouselContext>(createInitialContext())
    const loggerRef = useRef(options?.logger)
    loggerRef.current = options?.logger

    const transition = useCallback((action: CarouselAction): CarouselContext => {
        const prevContext = contextRef.current
        const prevPhase = prevContext.phase
        const nextContext = reduce(prevContext, action)
        contextRef.current = nextContext

        // Log transition at hook level (not in pure reducer)
        if (loggerRef.current) {
            const arrow = prevPhase === nextContext.phase ? '•' : '→'
            loggerRef.current.log('COORDINATOR', `${prevPhase} ${arrow} ${action.type} ${arrow} ${nextContext.phase}`, {
                action: action.type,
                prevPhase,
                nextPhase: nextContext.phase,
                ...('targetScroll' in action ? { target: action.targetScroll } : {}),
                ...('direction' in action ? { direction: action.direction } : {}),
            })
        }

        return nextContext
    }, [])

    const getPhase = useCallback((): CarouselPhase => {
        return contextRef.current.phase
    }, [])

    const getContext = useCallback((): Readonly<CarouselContext> => {
        return contextRef.current
    }, [])

    const isBusy = useCallback((): boolean => {
        const phase = contextRef.current.phase
        return phase !== 'IDLE' && phase !== 'UNINITIALIZED'
    }, [])

    const isBlocking = useCallback((): boolean => {
        const phase = contextRef.current.phase
        return phase === 'BOUNCING' || phase === 'TELEPORTING'
    }, [])

    return {
        transition,
        getPhase,
        getContext,
        contextRef,
        isBusy,
        isBlocking,
    }
}
