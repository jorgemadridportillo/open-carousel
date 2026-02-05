
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScrollCompletion } from '../useScrollCompletion'
import { TIMING_CONFIG } from '../../config'
import type { CarouselLoggerInstance } from '../../logger'

describe('useScrollCompletion', () => {
    let container: HTMLDivElement
    let mockOnComplete: (source: string) => void

    beforeEach(() => {
        container = document.createElement('div')
        mockOnComplete = vi.fn() as (source: string) => void
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should use native scrollend when supported', () => {
        // Mock scrollend support
        Object.defineProperty(window, 'onscrollend', {
            value: null,
            configurable: true,
            writable: true
        })

        const { result } = renderHook(() => useScrollCompletion({
            ref: { current: container },
            onComplete: mockOnComplete
        }))

        // Trigger wait
        result.current.waitForScrollCompletion()

        // Verify listener added (we can't easily check addEventListener calls without spying on element, 
        // but we can trigger the event)
        const event = new Event('scrollend')
        container.dispatchEvent(event)

        expect(mockOnComplete).toHaveBeenCalledWith('scrollend')
    })

    it('should fall back to debounce when scrollend is not supported', () => {
        // Mock NO scrollend support
        // @ts-ignore
        delete window.onscrollend

        const { result } = renderHook(() => useScrollCompletion({
            ref: { current: container },
            onComplete: mockOnComplete
        }))

        // Trigger wait
        result.current.waitForScrollCompletion()

        // Simulate scrolling
        const scrollEvent = new Event('scroll')
        container.dispatchEvent(scrollEvent)

        // Advance timer partially - shouldn't fire yet
        vi.advanceTimersByTime(TIMING_CONFIG.SCROLL_DEBOUNCE_FALLBACK_MS - 10)
        expect(mockOnComplete).not.toHaveBeenCalled()

        // Simulate more scrolling (resets debounce)
        container.dispatchEvent(scrollEvent)
        vi.advanceTimersByTime(TIMING_CONFIG.SCROLL_DEBOUNCE_FALLBACK_MS - 10)
        expect(mockOnComplete).not.toHaveBeenCalled()

        // Advance past timeout
        vi.advanceTimersByTime(20)
        expect(mockOnComplete).toHaveBeenCalledWith('debounce')
    })

    it('should trigger safety timeout if no scroll occurs', () => {
        // Mock NO scrollend support
        // @ts-ignore
        delete window.onscrollend

        const { result } = renderHook(() => useScrollCompletion({
            ref: { current: container },
            onComplete: mockOnComplete
        }))

        // Trigger wait
        result.current.waitForScrollCompletion()

        // Wait for safety timeout (no scroll events)
        vi.advanceTimersByTime(TIMING_CONFIG.SCROLL_IDLE_FALLBACK_MS + 10)

        expect(mockOnComplete).toHaveBeenCalledWith('safety-timeout')
    })

    it('should clean up listeners and timeouts on unmount', () => {
        // Mock NO scrollend support
        // @ts-ignore
        delete window.onscrollend

        const timeoutRef = { current: null }
        const { result, unmount } = renderHook(() => useScrollCompletion({
            ref: { current: container },
            onComplete: mockOnComplete,
            timeoutRef
        }))

        result.current.waitForScrollCompletion()

        // Unmount before timeout fires
        unmount()

        // Fast forward time
        vi.advanceTimersByTime(TIMING_CONFIG.SCROLL_IDLE_FALLBACK_MS + 100)

        // Should not have fired
        expect(mockOnComplete).not.toHaveBeenCalled()
    })
})
