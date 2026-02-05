import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLoadingState, clearLoadingStateCache } from '../useLoadingState'

describe('useLoadingState', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        clearLoadingStateCache()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts in loading state', () => {
        const { result } = renderHook(() => useLoadingState())

        expect(result.current.isReady).toBe(false)
        expect(result.current.showSkeleton).toBe(false)
        expect(result.current.isInstant).toBe(false)
    })

    it('shows skeleton after delay', () => {
        const { result } = renderHook(() => useLoadingState({ skeletonDelay: 500 }))

        expect(result.current.showSkeleton).toBe(false)

        act(() => { vi.advanceTimersByTime(500) })

        expect(result.current.showSkeleton).toBe(true)
    })

    it('does not show skeleton if markReady called before delay', () => {
        const { result } = renderHook(() => useLoadingState({ skeletonDelay: 500 }))

        act(() => { vi.advanceTimersByTime(300) })
        expect(result.current.showSkeleton).toBe(false)

        act(() => { result.current.markReady() })

        expect(result.current.isReady).toBe(true)
        expect(result.current.showSkeleton).toBe(false)

        act(() => { vi.advanceTimersByTime(300) })
        expect(result.current.showSkeleton).toBe(false)
    })

    it('forces ready after fallback timeout', () => {
        const { result } = renderHook(() => useLoadingState({ fallbackTimeout: 3000 }))

        expect(result.current.isReady).toBe(false)

        act(() => { vi.advanceTimersByTime(3000) })

        expect(result.current.isReady).toBe(true)
        expect(result.current.showSkeleton).toBe(false)
    })

    it('caches and returns instant on second call with same key', () => {
        const { result: first } = renderHook(() => useLoadingState({ cacheKey: 'test-key' }))

        act(() => { first.current.markReady() })
        expect(first.current.isReady).toBe(true)

        // Second render with same key
        const { result: second } = renderHook(() => useLoadingState({ cacheKey: 'test-key' }))

        expect(second.current.isReady).toBe(true)
        expect(second.current.isInstant).toBe(true)
        expect(second.current.showSkeleton).toBe(false)
    })

    it('starts ready when startReady is true', () => {
        const { result } = renderHook(() => useLoadingState({ startReady: true }))

        expect(result.current.isReady).toBe(true)
        expect(result.current.showSkeleton).toBe(false)
    })

    it('prevents multiple markReady calls from re-triggering', () => {
        const { result } = renderHook(() => useLoadingState())

        act(() => { result.current.markReady() })
        const firstIsReady = result.current.isReady

        act(() => { result.current.markReady() })

        expect(result.current.isReady).toBe(firstIsReady)
    })
})
