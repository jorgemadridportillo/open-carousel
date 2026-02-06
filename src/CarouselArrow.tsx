import clsx from 'clsx'
import type { ComponentProps } from 'react'

type Direction = 'left' | 'right'

interface CarouselArrowProps extends ComponentProps<'button'> {
    direction: Direction
    onClick: () => void
    disabled?: boolean
    className?: string
    label?: string
}

export function CarouselArrow({
    direction,
    onClick,
    disabled = false,
    className,
    label,
    ...props
}: CarouselArrowProps) {
    const defaultLabel = direction === 'left' ? 'Previous' : 'Next'

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={clsx(
                'carousel-button', // Base class from global CSS
                direction === 'left' ? 'prev' : 'next', // Positioning classes
                'disabled:opacity-0 disabled:cursor-not-allowed disabled:pointer-events-none', // State modifiers
                className,
            )}
            aria-label={label || defaultLabel}
            onPointerDown={(e) => {
                // Prevent this event from bubbling to the container or triggering "ghost" clicks
                e.stopPropagation()
                // Prevent focus ring or text selection
                e.preventDefault()
            }}
            {...props}
        >
            {direction === 'left' ? (
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path d="M15 18l-6-6 6-6" />
                </svg>
            ) : (
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path d="M9 18l6-6-6-6" />
                </svg>
            )}
        </button>
    )
}
