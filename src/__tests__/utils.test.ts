import { describe, it, expect } from 'vitest'
import {
    calculateCenterIndex,
    shouldTeleport,
    calculateVisualScale,
    calculateVisualOpacity,
    calculateRapidClickTarget,
    calculateTeleportOffset,
    isAtTarget,
    createTripleBuffer
} from '../utils'

describe('calculateCenterIndex', () => {
    const stride = 174

    it('returns correct index for exact multiples', () => {
        expect(calculateCenterIndex(174, stride)).toBe(1)
        expect(calculateCenterIndex(348, stride)).toBe(2)
    })

    it('returns 0 when stride is invalid', () => {
        expect(calculateCenterIndex(100, 0)).toBe(0)
    })

    it('rounds to nearest index', () => {
        expect(calculateCenterIndex(86, stride)).toBe(0)
        expect(calculateCenterIndex(87, stride)).toBe(1)
    })
})

describe('shouldTeleport', () => {
    const bufferWidth = 4176
    const rightThreshold = 6264

    it('returns "left" when below buffer', () => {
        expect(shouldTeleport(4000, bufferWidth, rightThreshold)).toBe('left')
    })

    it('returns "right" when above threshold', () => {
        expect(shouldTeleport(6300, bufferWidth, rightThreshold)).toBe('right')
    })

    it('returns null when in safe zone', () => {
        expect(shouldTeleport(5000, bufferWidth, rightThreshold)).toBe(null)
    })
})

describe('calculateVisualScale', () => {
    it('returns 1 at center (distance 0)', () => {
        expect(calculateVisualScale(0, 500, 0.85)).toBe(1)
    })

    it('returns baseScale at max distance', () => {
        expect(calculateVisualScale(500, 500, 0.85)).toBe(0.85)
    })

    it('interpolates linearly between center and edge', () => {
        const result = calculateVisualScale(250, 500, 0.85)
        expect(result).toBeCloseTo(0.925, 2)
    })
})

describe('calculateRapidClickTarget', () => {
    const stride = 174

    it('advances from pending target when mid-animation', () => {
        const result = calculateRapidClickTarget(4872, 4550, 1, stride)
        expect(result.shouldCatchUp).toBe(true)
        expect(result.nextTarget).toBe(5046)
        expect(result.previousTarget).toBe(4872)
    })

    it('calculates from current scroll when idle', () => {
        const result = calculateRapidClickTarget(null, 4698, 1, stride)
        expect(result.shouldCatchUp).toBe(false)
        expect(result.nextTarget).toBe(4872)
    })

    it('handles backward direction', () => {
        const result = calculateRapidClickTarget(5046, 5000, -1, stride)
        expect(result.nextTarget).toBe(4872)
    })
})

describe('isAtTarget', () => {
    it('returns true when within tolerance', () => {
        expect(isAtTarget(4860, 4872, 87)).toBe(true)
    })

    it('returns false when outside tolerance', () => {
        expect(isAtTarget(4700, 4872, 87)).toBe(false)
    })

    it('returns true when exactly at target', () => {
        expect(isAtTarget(100, 100, 0)).toBe(true)
    })
})

describe('createTripleBuffer', () => {
    it('triples the input array', () => {
        expect(createTripleBuffer(['a', 'b'])).toEqual(['a', 'b', 'a', 'b', 'a', 'b'])
    })

    it('handles empty arrays', () => {
        expect(createTripleBuffer([])).toEqual([])
    })

    it('maintains item order', () => {
        expect(createTripleBuffer([1, 2, 3])).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3])
    })
})

describe('calculateVisualOpacity', () => {
    it('returns 1 when distance is below center threshold', () => {
        const result = calculateVisualOpacity(5, 500, 0.5, 10)
        expect(result).toBe(1)
    })

    it('returns baseOpacity at max distance', () => {
        const result = calculateVisualOpacity(500, 500, 0.5, 10)
        expect(result).toBe(0.5)
    })

    it('interpolates between center and edge', () => {
        // At distance 250 (half of 500), normDist = 0.5
        // opacity = 0.5 + (0.5 * 0.5) = 0.75
        const result = calculateVisualOpacity(250, 500, 0.5, 10)
        expect(result).toBeCloseTo(0.75, 2)
    })

    it('clamps at max distance', () => {
        // Distance beyond halfViewport should still return baseOpacity
        const result = calculateVisualOpacity(1000, 500, 0.5, 10)
        expect(result).toBe(0.5)
    })
})

describe('calculateTeleportOffset', () => {
    it('returns positive offset for left teleport', () => {
        expect(calculateTeleportOffset('left', 4176)).toBe(4176)
    })

    it('returns negative offset for right teleport', () => {
        expect(calculateTeleportOffset('right', 4176)).toBe(-4176)
    })
})

describe('Numeric edge cases', () => {
    describe('Very large scrollLeft values', () => {
        it('calculateCenterIndex handles scrollLeft > 100,000 without precision loss', () => {
            // Large scroll positions should still calculate correctly
            const scrollLeft = 150000
            const stride = 174

            const result = calculateCenterIndex(scrollLeft, stride)

            // Should return a valid index (not NaN or Infinity)
            expect(Number.isFinite(result)).toBe(true)
            expect(result).toBeGreaterThanOrEqual(0)
            // 150000 / 174 ≈ 862
            expect(result).toBe(862)
        })

        it('calculateVisualScale handles large distances', () => {
            const result = calculateVisualScale(50000, 400, 0.85)
            // Should clamp to baseScale (distance >> halfViewport)
            expect(result).toBe(0.85)
        })
    })

    describe('Negative scrollLeft values', () => {
        it('shouldTeleport handles negative scrollLeft gracefully', () => {
            // Some browsers allow negative scrollLeft during elastic bounce
            // shouldTeleport(scrollLeft, bufferWidth, rightThreshold)
            const result = shouldTeleport(-100, 4176, 8352)
            // Negative is below buffer, should teleport left
            expect(result).toBe('left')
        })

        it('calculateCenterIndex handles negative scrollLeft', () => {
            const result = calculateCenterIndex(-100, 174)
            // Should return a valid (possibly negative) index
            expect(Number.isFinite(result)).toBe(true)
            // -100 / 174 ≈ -0.57, rounds to -1
            expect(result).toBe(-1)
        })
    })

    describe('NaN and invalid inputs', () => {
        it('calculateCenterIndex returns 0 for zero stride', () => {
            const result = calculateCenterIndex(5000, 0)
            // Guard clause (stride <= 0) should return 0
            expect(result).toBe(0)
        })

        it('calculateCenterIndex returns 0 for negative stride', () => {
            const result = calculateCenterIndex(5000, -174)
            // Guard clause (stride <= 0) should return 0
            expect(result).toBe(0)
        })

        it('calculateVisualScale handles NaN distance gracefully', () => {
            const result = calculateVisualScale(NaN, 400, 0.85)
            // NaN propagates through math, returns NaN
            expect(Number.isNaN(result)).toBe(true)
        })

        it('calculateVisualOpacity handles NaN distance gracefully', () => {
            const result = calculateVisualOpacity(NaN, 400, 0.5, 10)
            // NaN propagates through math
            expect(Number.isNaN(result)).toBe(true)
        })
    })
})



