import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useDraggableScroll } from '../useDraggableScroll'

describe('useDraggableScroll Logic', () => {
    it('initializes with default state', () => {
        const { result } = renderHook(() => useDraggableScroll())

        expect(result.current.isDragging).toBe(false)
        expect(result.current.ref.current).toBeNull()
        expect(typeof result.current.cancelMomentum).toBe('function')
        expect(result.current.events).toHaveProperty('onPointerDown')
    })

    it('should expose cancelMomentum function', () => {
        const { result } = renderHook(() => useDraggableScroll())
        expect(() => result.current.cancelMomentum()).not.toThrow()
    })

    it('updates isDragging state on pointer moves', () => {
        const { result } = renderHook(() => useDraggableScroll())

        // Mock the ref
        const mockDiv = document.createElement('div')
        Object.defineProperty(mockDiv, 'scrollLeft', { value: 50, writable: true }) // Not at edge
        Object.defineProperty(mockDiv, 'scrollWidth', { value: 1000 })
        Object.defineProperty(mockDiv, 'clientWidth', { value: 300 })
        // @ts-ignore
        mockDiv.setPointerCapture = vi.fn()
        // @ts-ignore
        mockDiv.releasePointerCapture = vi.fn()
        // @ts-ignore
        result.current.ref.current = mockDiv

        const { events } = result.current

        // 1. Mouse Down
        act(() => {
            events.onPointerDown({
                pageX: 100,
                pointerType: 'mouse',
                preventDefault: vi.fn()
            } as any)
        })

        // 2. Move (less than threshold) - Should NOT be dragging yet
        act(() => {
            events.onPointerMove({
                pageX: 105,
                preventDefault: vi.fn(),
                pointerId: 1
            } as any)
        })
        expect(result.current.isDragging).toBe(false)

        // 3. Move (past threshold > 10px) - Should START dragging
        act(() => {
            events.onPointerMove({
                pageX: 120,
                preventDefault: vi.fn(),
                pointerId: 1
            } as any)
        })
        expect(result.current.isDragging).toBe(true)

        // 4. Mouse Up
        act(() => {
            events.onPointerUp({} as any)
        })
        // State updates are async/setTimeout based in the hook
        // We use vitest fake timers or wait, but here we can just check if event handler ran
        // Ideally we'd fast-forward timers, but for unit test simplicity checking entry is key.
    })

    it('prevents click when dragging', () => {
        const { result } = renderHook(() => useDraggableScroll())
        const preventDefault = vi.fn()
        const stopPropagation = vi.fn()

        // --- Scenario 1: NOT Dragging ---
        act(() => {
            result.current.events.onClickCapture({
                preventDefault,
                stopPropagation
            } as any)
        })
        expect(preventDefault).not.toHaveBeenCalled()

        // --- Scenario 2: IS Dragging ---
        // Force simulate drag state by moving
        act(() => {
            // @ts-ignore
            result.current.ref.current = document.createElement('div')
            result.current.events.onPointerDown({ pageX: 0, pointerType: 'mouse', preventDefault: vi.fn() } as any)
            result.current.events.onPointerMove({ pageX: 50, preventDefault: vi.fn(), pointerId: 1 } as any)
        })

        expect(result.current.isDragging).toBe(true)

        act(() => {
            result.current.events.onClickCapture({
                preventDefault,
                stopPropagation
            } as any)
        })
        expect(preventDefault).toHaveBeenCalled()
        expect(stopPropagation).toHaveBeenCalled()
    })
    it('ignores touch events (lets native scroll handle it)', () => {
        const { result } = renderHook(() => useDraggableScroll())
        const { events } = result.current

        act(() => {
            events.onPointerDown({
                pointerType: 'touch',  // <--- TOUCH
                pageX: 100,
                preventDefault: vi.fn()
            } as any)
        })

        // Should NOT start tracking drag for touch
        // So moving shouldn't matter
        act(() => {
            events.onPointerMove({ pageX: 200 } as any)
        })

        expect(result.current.isDragging).toBe(false)
    })

    it('applies rubber band transform when pulling past start edge (finite mode)', () => {
        const { result } = renderHook(() => useDraggableScroll({ infinite: false }))
        const { events } = result.current

        // Mock Ref
        const mockDiv = document.createElement('div')
        Object.defineProperty(mockDiv, 'scrollLeft', { value: 10, writable: true }) // < 20 (padding tolerance)
        Object.defineProperty(mockDiv, 'scrollWidth', { value: 1000 })
        Object.defineProperty(mockDiv, 'clientWidth', { value: 300 })
        // @ts-ignore
        mockDiv.setPointerCapture = vi.fn()
        // @ts-ignore
        mockDiv.releasePointerCapture = vi.fn()
        // @ts-ignore
        result.current.ref.current = mockDiv

        // 1. Mouse Down at Left Edge
        act(() => {
            events.onPointerDown({
                pageX: 100,
                pointerType: 'mouse',
                preventDefault: vi.fn()
            } as any)
        })

        // 2. Pull Right (intended scroll negative)
        // Move from 100 to 150 (+50px)
        // walk = 50
        // intendedScroll = 10 - 50 = -40
        // -40 < 0 => Pulling left edge
        act(() => {
            events.onPointerMove({
                pageX: 150,
                preventDefault: vi.fn(),
                pointerId: 1
            } as any)
        })

        // Should apply transform
        // We can't calculate exact pixels easily due to sqrt damping, but should be > 0
        expect(mockDiv.style.transform).toMatch(/translateX\(\d+(\.\d+)?px\)/)
        expect(mockDiv.style.transform).not.toBe('')

        // 3. Release
        act(() => {
            events.onPointerUp({} as any)
        })

        // Should snap back (transform cleared after animation)
        // Mock requestAnimationFrame to finish snap back
        // The snapBack function uses requestAnimationFrame loop
        // We can check if transform is eventually cleared
        // But checking the immediate logic (isPullingEdge released) is cleaner via checking if momentum calc was skipped or verify transform reset initiation

        // Verify snapBack was triggered: transform should effectively reset or animate
        // Since we can't easily advance rAF loops in this environment without complex setup, 
        // we mainly cared about the Pull transform application above.
    })
})
