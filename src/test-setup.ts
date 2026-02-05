import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'carousel.next': 'Siguiente',
                'carousel.previous': 'Anterior',
            }
            return translations[key] || key
        },
        i18n: {
            changeLanguage: () => new Promise(() => { }),
        },
    }),
    initReactI18next: {
        type: '3rdParty',
        init: () => { },
    }
}))

if (!global.PointerEvent) {
    class PointerEvent extends MouseEvent {
        public pointerId: number
        public pointerType: string
        public isPrimary: boolean

        constructor(type: string, params: PointerEventInit = {}) {
            super(type, params)
            this.pointerId = params.pointerId || 0
            this.pointerType = params.pointerType || 'mouse'
            this.isPrimary = params.isPrimary || false
        }
    }
    global.PointerEvent = PointerEvent as any
}

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
    cleanup()
})
