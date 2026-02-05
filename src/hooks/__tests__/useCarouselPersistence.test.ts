import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCarouselPersistence } from '../useCarouselPersistence'
import type { CarouselLoggerInstance } from '../../logger'
describe('useCarouselPersistence', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.useRealTimers()
        sessionStorage.clear()
    })

    describe('getSavedPosition', () => {
        it('should return null when no persistKey provided', () => {
            const { result } = renderHook(() => useCarouselPersistence({}))

            expect(result.current.getSavedPosition()).toBeNull()
        })

        it('should return null when no value in sessionStorage', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'test-carousel' })
            )

            expect(result.current.getSavedPosition()).toBeNull()
        })

        it('should return saved position from sessionStorage', () => {
            sessionStorage.setItem('carousel-scroll-test-carousel', '1234')

            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'test-carousel' })
            )

            expect(result.current.getSavedPosition()).toBe(1234)
        })

        it('should return null for invalid stored values', () => {
            sessionStorage.setItem('carousel-scroll-test', 'not-a-number')

            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'test' })
            )

            expect(result.current.getSavedPosition()).toBeNull()
        })
    })

    describe('savePosition (debounced)', () => {
        it('should not save when persistKey is undefined', () => {
            const { result } = renderHook(() => useCarouselPersistence({}))

            act(() => {
                result.current.savePosition(5000)
                vi.advanceTimersByTime(200)
            })

            expect(sessionStorage.getItem('carousel-scroll-undefined')).toBeNull()
        })

        it('should debounce save calls', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'debounce-test', debounceMs: 100 })
            )

            act(() => {
                result.current.savePosition(100)
                result.current.savePosition(200)
                result.current.savePosition(300)
            })

            // Value not saved yet
            expect(sessionStorage.getItem('carousel-scroll-debounce-test')).toBeNull()

            // Advance past debounce
            act(() => {
                vi.advanceTimersByTime(100)
            })

            // Only last value saved
            expect(sessionStorage.getItem('carousel-scroll-debounce-test')).toBe('300')
        })

        it('should save position after debounce delay', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'save-test', debounceMs: 150 })
            )

            act(() => {
                result.current.savePosition(4567)
                vi.advanceTimersByTime(150)
            })

            expect(sessionStorage.getItem('carousel-scroll-save-test')).toBe('4567')
        })
    })

    describe('savePositionImmediate', () => {
        it('should save immediately without debounce', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'immediate-test' })
            )

            act(() => {
                result.current.savePositionImmediate(9999)
            })

            // Saved immediately, no timer advance needed
            expect(sessionStorage.getItem('carousel-scroll-immediate-test')).toBe('9999')
        })

        it('should skip save if value unchanged', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'unchanged-test' })
            )

            const spy = vi.spyOn(Storage.prototype, 'setItem')

            act(() => {
                result.current.savePositionImmediate(1000)
                result.current.savePositionImmediate(1000)
                result.current.savePositionImmediate(1000)
            })

            // Only called once (optimization)
            expect(spy).toHaveBeenCalledTimes(1)
            spy.mockRestore()
        })
    })

    describe('clearPosition', () => {
        it('should remove position from sessionStorage', () => {
            sessionStorage.setItem('carousel-scroll-clear-test', '1234')

            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'clear-test' })
            )

            act(() => {
                result.current.clearPosition()
            })

            expect(sessionStorage.getItem('carousel-scroll-clear-test')).toBeNull()
        })
    })

    describe('Key isolation', () => {
        it('different persistKeys should not interfere', () => {
            sessionStorage.setItem('carousel-scroll-carousel-a', '100')
            sessionStorage.setItem('carousel-scroll-carousel-b', '200')

            const { result: resultA } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'carousel-a' })
            )
            const { result: resultB } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'carousel-b' })
            )

            expect(resultA.current.getSavedPosition()).toBe(100)
            expect(resultB.current.getSavedPosition()).toBe(200)

            // Changing one doesn't affect the other
            act(() => {
                resultA.current.savePositionImmediate(999)
            })

            expect(resultA.current.getSavedPosition()).toBe(999)
            expect(resultB.current.getSavedPosition()).toBe(200)
        })
    })

    describe('Edge cases', () => {
        it('should handle NaN scrollLeft gracefully', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'nan-test' })
            )

            act(() => {
                result.current.savePositionImmediate(NaN)
            })

            // Should not save NaN
            expect(sessionStorage.getItem('carousel-scroll-nan-test')).toBeNull()
        })

        it('should round scroll position to integer', () => {
            const { result } = renderHook(() =>
                useCarouselPersistence({ persistKey: 'round-test' })
            )

            act(() => {
                result.current.savePositionImmediate(1234.789)
            })

            expect(sessionStorage.getItem('carousel-scroll-round-test')).toBe('1235')
        })
    })
})
