import { useRef, useState, useCallback, useEffect, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react'

// Configuration constants
const MAX_VELOCITY = 500          // Maximum momentum speed
const MIN_VELOCITY_THRESHOLD = 10 // Minimum velocity to trigger momentum
const FRICTION = 0.96              // Momentum decay per frame
const VELOCITY_SMOOTHING = 0.15    // How quickly velocity responds to input

// Bounce effect constants
const BOUNCE_DISTANCE = 35        // How far to bounce on momentum hit (pixels)
const BOUNCE_DURATION = 400       // Bounce animation duration (ms)

// Rubber band pull constants
const PULL_RESISTANCE = 0.35      // How hard it is to pull at edges (lower = more resistance)
const MAX_PULL_DISTANCE = 80      // Maximum pull distance (pixels)
const SNAP_BACK_DURATION = 250    // How fast it snaps back when released (ms)

// Snap-to-item constants
const SNAP_DURATION = 200         // Duration of snap animation (ms)
const SNAP_THRESHOLD = 30         // Minimum velocity to consider for snap direction



interface UseDraggableScrollOptions {
    infinite?: boolean
    hasNextPage?: boolean
    onEndReached?: () => void
    cardWidth?: number
    gap?: number
    cloneCount?: number
    friction?: number
    maxVelocity?: number
}

export function useDraggableScroll({
    infinite = false,
    hasNextPage = false,
    onEndReached,
    cardWidth = 320,
    gap = 24,
    cloneCount = 3,
    friction,
    maxVelocity,
}: UseDraggableScrollOptions = {}) {
    const ref = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Drag state
    const isDown = useRef(false)
    const startX = useRef(0)
    const scrollLeftStart = useRef(0)
    const currentPointerId = useRef<number | null>(null)

    // Velocity tracking
    const velocity = useRef(0)
    const lastTimestamp = useRef(0)
    const lastPageX = useRef(0)
    const animationFrameId = useRef<number | null>(null)

    // Edge pull state
    const currentPullOffset = useRef(0)
    const isPullingEdge = useRef(false)
    const startedAtLeftEdge = useRef(false)
    const startedAtRightEdge = useRef(false)
    const isBouncing = useRef(false)
    const lastEndReachedTime = useRef(0)

    // Infinite scroll state
    const stride = cardWidth + gap

    const cancelAnimation = useCallback((force = false) => {
        if (isBouncing.current && !force) return

        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current)
            animationFrameId.current = null
        }
        if (ref.current) {
            ref.current.style.transform = ''
        }
        currentPullOffset.current = 0
        isPullingEdge.current = false
        isBouncing.current = false
    }, [])

    // Find nearest snap point (center of child to center of container)
    const findNearestSnapPoint = useCallback((currentScroll: number, direction: number) => {
        if (!ref.current) return currentScroll

        const container = ref.current
        const children = Array.from(container.children) as HTMLElement[]

        if (children.length === 0) return currentScroll

        let nearestPoint = currentScroll
        let minDistance = Infinity
        const containerCenter = currentScroll + container.clientWidth / 2

        children.forEach((child) => {
            // Snap to center of each child
            const childCenter = child.offsetLeft + child.offsetWidth / 2
            const distance = Math.abs(childCenter - containerCenter)

            // Calculate the exact scroll position to center this child
            const targetScroll = childCenter - container.clientWidth / 2

            // If we have a direction preference, favor that direction
            if (direction !== 0) {
                const isInDirection = direction > 0
                    ? childCenter < containerCenter
                    : childCenter > containerCenter

                if (isInDirection && distance < minDistance) {
                    minDistance = distance
                    nearestPoint = targetScroll
                }
            } else if (distance < minDistance) {
                minDistance = distance
                nearestPoint = targetScroll
            }
        })

        // Clamp to valid scroll range if not infinite (or handle clamping differently)
        const maxScroll = container.scrollWidth - container.clientWidth
        return Math.max(0, Math.min(maxScroll, nearestPoint))
    }, [])

    // Smooth snap animation to target position (for mouse drag)
    const snapToPosition = useCallback((targetScroll: number) => {
        if (!ref.current) return

        const el = ref.current
        const startScroll = el.scrollLeft
        const distance = targetScroll - startScroll

        if (Math.abs(distance) < 1) {
            // Even if no movement, re-enable snap
            el.style.scrollSnapType = ''
            return
        }

        const startTime = performance.now()

        const snapLoop = () => {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / SNAP_DURATION, 1)

            // Smooth ease-out curve
            const easeProgress = 1 - Math.pow(1 - progress, 3)

            el.scrollLeft = startScroll + (distance * easeProgress)

            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(snapLoop)
            } else {
                el.scrollLeft = targetScroll
                animationFrameId.current = null
                // Re-enable CSS snap after custom positioning completes
                el.style.scrollSnapType = ''
            }
        }

        animationFrameId.current = requestAnimationFrame(snapLoop)
    }, [])

    const snapBack = useCallback(() => {
        if (!ref.current) return
        if (isBouncing.current) return

        const el = ref.current
        const startOffset = currentPullOffset.current
        const startTime = performance.now()

        currentPullOffset.current = 0
        isPullingEdge.current = false

        if (Math.abs(startOffset) < 1) {
            el.style.transform = ''
            return
        }

        const snapLoop = () => {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / SNAP_BACK_DURATION, 1)
            const easeProgress = 1 - Math.pow(1 - progress, 3)
            const offset = startOffset * (1 - easeProgress)

            el.style.transform = Math.abs(offset) > 0.5 ? `translateX(${offset}px)` : ''

            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(snapLoop)
            } else {
                el.style.transform = ''
                animationFrameId.current = null
            }
        }

        animationFrameId.current = requestAnimationFrame(snapLoop)
    }, [])

    const triggerBounce = useCallback((direction: 'left' | 'right') => {
        if (!ref.current) return
        // Disable bounce if infinite (unless specific edge cases, but generally teleport handles it)
        // Or if we are loading next page
        if (infinite) return
        if (direction === 'right' && hasNextPage) return

        cancelAnimation(true)
        isBouncing.current = true

        const el = ref.current
        const startTime = performance.now()
        const bounceDirection = direction === 'left' ? 1 : -1

        const bounceLoop = () => {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / BOUNCE_DURATION, 1)
            const easeProgress = Math.sin(progress * Math.PI)
            const offset = BOUNCE_DISTANCE * bounceDirection * easeProgress

            el.style.transform = `translateX(${offset}px)`

            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(bounceLoop)
            } else {
                el.style.transform = ''
                animationFrameId.current = null
                isBouncing.current = false
            }
        }

        animationFrameId.current = requestAnimationFrame(bounceLoop)
    }, [cancelAnimation, infinite, hasNextPage])

    const startMomentumScroll = useCallback(() => {
        if (!ref.current) return

        const el = ref.current
        const activeFriction = friction ?? FRICTION
        const activeMaxVelocity = maxVelocity ?? MAX_VELOCITY

        let currentVel = Math.max(-activeMaxVelocity, Math.min(activeMaxVelocity, velocity.current * 16))
        let lastLoopTime = performance.now()
        const initialDirection = currentVel > 0 ? 1 : currentVel < 0 ? -1 : 0

        if (Math.abs(currentVel) <= MIN_VELOCITY_THRESHOLD) {
            // No momentum, just snap to nearest
            const snapTarget = findNearestSnapPoint(el.scrollLeft, 0)
            snapToPosition(snapTarget)
            return
        }

        const maxScroll = el.scrollWidth - el.clientWidth

        if (el.scrollLeft <= 0 && currentVel > 0) {
            triggerBounce('left')
            return
        }
        if (el.scrollLeft >= maxScroll && currentVel < 0) {
            triggerBounce('right')
            return
        }

        const momentumLoop = () => {
            if (!ref.current) return

            const now = performance.now()
            const dt = now - lastLoopTime
            lastLoopTime = now

            const frameRatio = Math.min(dt / 16, 3)
            currentVel *= Math.pow(activeFriction, frameRatio)

            const prevScroll = el.scrollLeft
            const max = el.scrollWidth - el.clientWidth

            el.scrollLeft = prevScroll - (currentVel * frameRatio)
            const newScroll = el.scrollLeft

            // Check if scroll hit an edge
            // Logic updated for infinite:
            // infinite + hasNextPage -> no bounce right
            const hitLeft = currentVel > 0 && newScroll <= 0 && prevScroll > 0
            const hitRight = currentVel < 0 && newScroll >= max && prevScroll < max

            if (hitLeft) {
                if (!infinite) triggerBounce('left')
                return
            }
            if (hitRight) {
                if (!infinite && !(hasNextPage)) triggerBounce('right')
                return
            }

            // When velocity is low enough, snap to nearest item
            if (Math.abs(currentVel) < SNAP_THRESHOLD) {
                const snapTarget = findNearestSnapPoint(el.scrollLeft, initialDirection)
                snapToPosition(snapTarget)
                return
            }

            if (Math.abs(currentVel) > 0.5) {
                animationFrameId.current = requestAnimationFrame(momentumLoop)
            } else {
                // Snap when momentum ends
                const snapTarget = findNearestSnapPoint(el.scrollLeft, 0)
                snapToPosition(snapTarget)
            }
        }

        animationFrameId.current = requestAnimationFrame(momentumLoop)
    }, [triggerBounce, findNearestSnapPoint, snapToPosition, infinite, hasNextPage])

    const endDrag = useCallback(() => {
        if (!isDown.current) return

        isDown.current = false

        if (ref.current && currentPointerId.current !== null) {
            try {
                ref.current.releasePointerCapture(currentPointerId.current)
            } catch {
                // Already released
            }
        }
        currentPointerId.current = null

        if (isPullingEdge.current) {
            snapBack()
            setTimeout(() => setIsDragging(false), 0)
            return
        }

        if (isDragging) {
            startMomentumScroll()
        }
        setTimeout(() => setIsDragging(false), 0)
    }, [isDragging, startMomentumScroll, snapBack])

    const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        // For touch devices, let native scroll + CSS snap handle it
        if (e.pointerType === 'touch') {
            return
        }

        // For mouse, disable CSS snap so our custom drag works freely
        if (ref.current) {
            ref.current.style.scrollSnapType = 'none'
        }

        isDown.current = true
        cancelAnimation()
        window.getSelection()?.removeAllRanges()

        if (ref.current) {
            const el = ref.current
            const maxScroll = el.scrollWidth - el.clientWidth


            // We don't set capture here yet to allow simple clicks to pass through
            // Capture will be set in onPointerMove if movement threshold is exceeded
            startX.current = e.pageX
            scrollLeftStart.current = el.scrollLeft
            lastPageX.current = e.pageX
            lastTimestamp.current = performance.now()
            velocity.current = 0

            // Use 20px tolerance for left edge to account for padding in finite carousels
            startedAtLeftEdge.current = el.scrollLeft <= 20
            startedAtRightEdge.current = el.scrollLeft >= maxScroll - 5
        }
    }, [cancelAnimation])

    const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDown.current) return

        if (performance.now() - lastTimestamp.current > 80) {
            velocity.current = 0
        }

        endDrag()
    }, [endDrag])

    const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDown.current || !ref.current) return
        e.preventDefault()

        const now = performance.now()
        const pageX = e.pageX
        const el = ref.current

        // Optimization: Removed getBoundingClientRect() to avoid reflows

        const timeDelta = now - lastTimestamp.current
        if (timeDelta > 0) {
            const instantVel = (pageX - lastPageX.current) / timeDelta
            velocity.current = velocity.current * (1 - VELOCITY_SMOOTHING) + instantVel * VELOCITY_SMOOTHING
            lastTimestamp.current = now
            lastPageX.current = pageX
        }

        const x = pageX
        const walk = x - startX.current
        const intendedScroll = scrollLeftStart.current - walk
        const maxScroll = el.scrollWidth - el.clientWidth

        const isAtLeftEdge = el.scrollLeft <= 20  // 20px tolerance for padding
        const isAtRightEdge = el.scrollLeft >= maxScroll - 5

        // Pull resistance logic disabled if infinite
        const canPullLeft = !infinite && !isBouncing.current && startedAtLeftEdge.current && isAtLeftEdge && intendedScroll < 0
        const canPullRight = !infinite && !hasNextPage && !isBouncing.current && startedAtRightEdge.current && isAtRightEdge && intendedScroll > maxScroll

        if (canPullLeft || canPullRight) {
            isPullingEdge.current = true

            let pullAmount: number
            if (canPullLeft) {
                pullAmount = -intendedScroll * PULL_RESISTANCE
            } else {
                pullAmount = -(intendedScroll - maxScroll) * PULL_RESISTANCE
            }

            const sign = pullAmount > 0 ? 1 : -1
            const absPull = Math.min(Math.abs(pullAmount), MAX_PULL_DISTANCE)
            const dampedPull = sign * Math.sqrt(absPull / MAX_PULL_DISTANCE) * MAX_PULL_DISTANCE

            currentPullOffset.current = dampedPull
            el.style.transform = `translateX(${dampedPull}px)`

            if (!isDragging) setIsDragging(true)
        } else {
            // Normal drag
            if (isPullingEdge.current) {
                el.style.transform = ''
                currentPullOffset.current = 0
                isPullingEdge.current = false
            }

            if (Math.abs(walk) > 10) {
                if (!isDragging) {
                    setIsDragging(true)
                    // Set pointer capture when we are sure it's a drag
                    try {
                        el.setPointerCapture(e.pointerId)
                        currentPointerId.current = e.pointerId
                    } catch (err) {
                        // Ignore
                    }
                }
                el.scrollLeft = intendedScroll
            }
        }
    }, [isDragging, endDrag, infinite, hasNextPage])

    const onClickCapture = useCallback((e: MouseEvent) => {
        if (isDragging) {
            e.preventDefault()
            e.stopPropagation()
        }
    }, [isDragging])

    // Safety net: Listen to window for pointerup to ensure we always clean up
    // even if pointer capture fails or is interrupted.
    useEffect(() => {
        const handleWindowPointerUp = (e: any) => {
            if (isDown.current) {
                // If the event target is the element itself, the normal onPointerUp 
                // will handle it. But if it's something else (released outside), 
                // this is our fallback.
                if (e.target !== ref.current && !ref.current?.contains(e.target as Node)) {
                    endDrag()
                }
            }
        }

        window.addEventListener('pointerup', handleWindowPointerUp)
        window.addEventListener('blur', endDrag) // Close on window blur too

        return () => {
            window.removeEventListener('pointerup', handleWindowPointerUp)
            window.removeEventListener('blur', endDrag)
        }
    }, [endDrag])

    useEffect(() => cancelAnimation, [cancelAnimation])

    // Expose method to adjust internal state when parent teleports scroll position
    const adjustScroll = useCallback((delta: number) => {
        scrollLeftStart.current += delta
        // Also adjust current velocity tracking to prevent jumps? Not needed for velocity, just position.
    }, [])

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const handleScroll = () => {
            // Check for OnEndReached (Append Logic - Legacy support if needed)
            if (onEndReached) {
                const scrollLeft = el.scrollLeft
                const scrollWidth = el.scrollWidth
                const clientWidth = el.clientWidth

                const distToEnd = scrollWidth - (scrollLeft + clientWidth)
                const threshold = 2 * clientWidth

                if (distToEnd < threshold) {
                    const now = performance.now()
                    if (now - lastEndReachedTime.current > 1000) {
                        onEndReached()
                        lastEndReachedTime.current = now
                    }
                }
            }
        }

        el.addEventListener('scroll', handleScroll, { passive: true })
        // Initial check
        handleScroll()

        return () => {
            el.removeEventListener('scroll', handleScroll)
        }
    }, [onEndReached])

    // Touch-based edge effects for infinite carousels
    // Currently disabled for performance optimization (Phase 1)
    // The previous implementation used heavy paint operations (gradients) on the main thread
    useEffect(() => {
        const el = ref.current
        if (!el || infinite) return

        // Lightweight scroll end detection (optional future use)
    }, [infinite])

    return {
        ref,
        isDragging,
        cancelMomentum: () => cancelAnimation(true),
        adjustScroll,
        events: {
            onPointerDown,
            onPointerUp,
            onPointerMove,
            onLostPointerCapture: onPointerUp,
            onClickCapture,
            onDragStart: (e: MouseEvent) => e.preventDefault(),
        },
    }
}
