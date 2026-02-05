// Visual effect configuration
export const VISUAL_CONFIG = {
    MAX_DIST_MOBILE: 320,
    MAX_DIST_TABLET: 400,
    MAX_DIST_DESKTOP: 500,
    BASE_SCALE_MOBILE: 0.80,
    BASE_SCALE_TABLET: 0.82,
    BASE_SCALE_DESKTOP: 0.85,
    VIEW_BUFFER: 200,
    CENTER_THRESHOLD: 10,
    DISABLE_DYNAMIC_SHADOW: true,
} as const

// Animation timing configuration
export const TIMING_CONFIG = {
    BOUNCE_DISTANCE_PX: 30,
    BOUNCE_PHASE1_MS: 150,
    BOUNCE_PHASE2_MS: 450,
    // How long to wait before clearing the pre-teleport flag
    PRE_TELEPORT_CLEAR_DELAY_MS: 100,
    SCROLL_IDLE_FALLBACK_MS: 300,
    SCROLL_DEBOUNCE_FALLBACK_MS: 50,
    SNAP_RESTORE_DELAY_MS: 100,
    RESIZE_DEBOUNCE_MS: 100,
    SCROLL_PERSIST_DEBOUNCE_MS: 150,
    // Milliseconds to wait for scroll to stop before considering it complete (fallback)
    SCROLL_COMPLETION_DEBOUNCE_MS: 150,
    // Tolerance for target arrival check (ratio of stride)
    SCROLL_TARGET_TOLERANCE_RATIO: 0.5,
} as const

// Layout configuration
export const LAYOUT_CONFIG = {
    GAP_MOBILE: 12,
    GAP_DESKTOP: 16,
    GAP_BREAKPOINT: 768,
    MIN_BUFFER_COUNT: 50,
    EDGE_TOLERANCE_START: 20,
    EDGE_TOLERANCE_END: 5,
    // Initial fallback values (should match --carousel-item-width-default in tailwind.css)
    INITIAL_CARD_WIDTH: 180,
    INITIAL_GAP: 16,
} as const

export const DEBUG_CONFIG = {
    // 🛡️ SAFETY: This defaults to false in production. 
    // Even if set to true manually, the logger has a hard guard against console output in production.
    ENABLED: false,
    HISTORY_SIZE: 100,
    // Enable specific channels to debug features
    // Options: 'ALL', 'TELEPORT', 'VISUALS', 'LAYOUT', 'INIT', 'CACHE', 'COORDINATOR', 'NAV', 'INTERACT'
    CHANNELS: {
        ALL: false,
        TELEPORT: false,
        VISUALS: false,
        LAYOUT: false,
        INIT: false,
        CACHE: false,
        COORDINATOR: false,
        NAV: false,
        INTERACT: false,
        PERF: false,
    },
}

// Feature flags
export const FEATURE_FLAGS = {
    USE_RAF_FRAME_SEPARATION: true,
} as const
