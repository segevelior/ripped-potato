/**
 * Design Tokens - Centralized Design System
 * Following Figma design system best practices
 * 
 * Structure:
 * 1. Primitive Tokens - Raw values (colors, sizes, etc.)
 * 2. Semantic Tokens - Contextual usage
 * 3. Component Tokens - Specific component styles
 */

// ============================================================================
// PRIMITIVE TOKENS (Foundation)
// ============================================================================

export const primitiveColors = {
    // Grayscale
    gray: {
        50: '#F9FAFB',
        100: '#F3F4F6',
        200: '#E5E7EB',
        300: '#D1D5DB',
        400: '#9CA3AF',
        500: '#6B7280',
        600: '#4B5563',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
    },

    // Brand Colors
    blue: {
        50: '#EFF6FF',
        100: '#DBEAFE',
        200: '#BFDBFE',
        300: '#93C5FD',
        400: '#60A5FA',
        500: '#3B82F6',
        600: '#2563EB',
        700: '#1D4ED8',
        800: '#1E40AF',
    },

    // Accent
    coral: {
        500: '#FF6B52',
        600: '#FF5238',
    },

    // Status Colors
    green: {
        50: '#F0FDF4',
        100: '#DCFCE7',
        500: '#22C55E',
        600: '#16A34A',
        700: '#15803D',
    },

    yellow: {
        50: '#FEFCE8',
        100: '#FEF9C3',
        400: '#FACC15',
        500: '#EAB308',
        600: '#CA8A04',
    },

    orange: {
        50: '#FFF7ED',
        100: '#FFEDD5',
        500: '#F97316',
        600: '#EA580C',
    },

    red: {
        50: '#FEF2F2',
        100: '#FEE2E2',
        500: '#EF4444',
        600: '#DC2626',
    },

    // Discipline Colors
    purple: {
        500: '#A855F7',
        600: '#9333EA',
    },

    pink: {
        500: '#EC4899',
    },

    cyan: {
        500: '#06B6D4',
    },
};

export const primitiveSpacing = {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
};

export const primitiveBorderRadius = {
    none: '0',
    sm: '0.375rem',    // 6px
    md: '0.5rem',      // 8px
    lg: '0.75rem',     // 12px
    xl: '1rem',        // 16px
    '2xl': '1.5rem',   // 24px
    '3xl': '2rem',     // 32px
    full: '9999px',
};

export const primitiveFontSize = {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
};

export const primitiveFontWeight = {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
};

export const primitiveShadow = {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

// ============================================================================
// SEMANTIC TOKENS (Contextual Usage)
// ============================================================================

export const semanticColors = {
    // Surface colors
    surface: {
        primary: primitiveColors.gray[50],
        secondary: primitiveColors.gray[100],
        elevated: '#FFFFFF',
    },

    // Text colors
    text: {
        primary: primitiveColors.gray[900],
        secondary: primitiveColors.gray[600],
        tertiary: primitiveColors.gray[500],
        inverse: '#FFFFFF',
    },

    // Border colors
    border: {
        default: primitiveColors.gray[200],
        subtle: primitiveColors.gray[100],
        strong: primitiveColors.gray[300],
    },

    // Interactive colors
    interactive: {
        primary: primitiveColors.gray[900],
        primaryHover: primitiveColors.gray[800],
        accent: primitiveColors.coral[500],
        accentHover: primitiveColors.coral[600],
    },

    // Status colors
    status: {
        success: primitiveColors.green[500],
        warning: primitiveColors.yellow[500],
        error: primitiveColors.red[500],
        info: primitiveColors.blue[500],
    },

    // Discipline colors (for workout/exercise categories)
    discipline: {
        strength: primitiveColors.blue[600],
        running: primitiveColors.green[500],
        cycling: primitiveColors.purple[500],
        climbing: primitiveColors.orange[600],
        hiit: primitiveColors.red[500],
        cardio: primitiveColors.pink[500],
        mobility: primitiveColors.cyan[500],
        calisthenics: primitiveColors.yellow[600],
    },

    // Difficulty colors
    difficulty: {
        beginner: primitiveColors.green[500],
        intermediate: primitiveColors.orange[500],
        advanced: primitiveColors.red[500],
    },

    // Intensity colors
    intensity: {
        low: {
            bg: primitiveColors.green[100],
            text: primitiveColors.green[700],
        },
        moderate: {
            bg: primitiveColors.yellow[100],
            text: primitiveColors.yellow[600],
        },
        high: {
            bg: primitiveColors.orange[100],
            text: primitiveColors.orange[600],
        },
        max: {
            bg: primitiveColors.red[100],
            text: primitiveColors.red[600],
        },
    },
};

export const semanticSpacing = {
    // Component spacing
    component: {
        xs: primitiveSpacing[2],   // 8px
        sm: primitiveSpacing[3],   // 12px
        md: primitiveSpacing[4],   // 16px
        lg: primitiveSpacing[6],   // 24px
        xl: primitiveSpacing[8],   // 32px
    },

    // Layout spacing
    layout: {
        xs: primitiveSpacing[4],   // 16px
        sm: primitiveSpacing[6],   // 24px
        md: primitiveSpacing[8],   // 32px
        lg: primitiveSpacing[12],  // 48px
        xl: primitiveSpacing[16],  // 64px
    },
};

export const semanticBorderRadius = {
    // Component border radius
    component: {
        sm: primitiveBorderRadius.lg,    // 12px
        md: primitiveBorderRadius.xl,    // 16px
        lg: primitiveBorderRadius['2xl'], // 24px
        xl: primitiveBorderRadius['3xl'], // 32px
    },

    // Special cases
    pill: primitiveBorderRadius.full,
    circle: primitiveBorderRadius.full,
};

export const semanticTypography = {
    // Headings
    heading: {
        h1: {
            size: primitiveFontSize['3xl'],
            weight: primitiveFontWeight.bold,
            lineHeight: '1.2',
        },
        h2: {
            size: primitiveFontSize['2xl'],
            weight: primitiveFontWeight.bold,
            lineHeight: '1.3',
        },
        h3: {
            size: primitiveFontSize.xl,
            weight: primitiveFontWeight.bold,
            lineHeight: '1.4',
        },
        h4: {
            size: primitiveFontSize.lg,
            weight: primitiveFontWeight.semibold,
            lineHeight: '1.5',
        },
    },

    // Body text
    body: {
        large: {
            size: primitiveFontSize.lg,
            weight: primitiveFontWeight.normal,
            lineHeight: '1.6',
        },
        base: {
            size: primitiveFontSize.base,
            weight: primitiveFontWeight.normal,
            lineHeight: '1.5',
        },
        small: {
            size: primitiveFontSize.sm,
            weight: primitiveFontWeight.normal,
            lineHeight: '1.5',
        },
    },

    // Labels
    label: {
        large: {
            size: primitiveFontSize.base,
            weight: primitiveFontWeight.semibold,
            lineHeight: '1.5',
        },
        base: {
            size: primitiveFontSize.sm,
            weight: primitiveFontWeight.semibold,
            lineHeight: '1.5',
        },
        small: {
            size: primitiveFontSize.xs,
            weight: primitiveFontWeight.semibold,
            lineHeight: '1.5',
        },
    },
};

// ============================================================================
// COMPONENT TOKENS (Specific Components)
// ============================================================================

export const componentTokens = {
    // Card
    card: {
        background: semanticColors.surface.elevated,
        borderRadius: semanticBorderRadius.component.xl,
        padding: semanticSpacing.component.lg,
        shadow: primitiveShadow.sm,
        shadowHover: primitiveShadow.lg,
        border: semanticColors.border.default,
    },

    // Button
    button: {
        primary: {
            background: semanticColors.interactive.primary,
            backgroundHover: semanticColors.interactive.primaryHover,
            text: semanticColors.text.inverse,
            borderRadius: semanticBorderRadius.component.md,
            padding: {
                x: primitiveSpacing[6],
                y: primitiveSpacing[3],
            },
        },
        secondary: {
            background: primitiveColors.gray[100],
            backgroundHover: primitiveColors.gray[200],
            text: semanticColors.text.primary,
            borderRadius: semanticBorderRadius.component.md,
            padding: {
                x: primitiveSpacing[6],
                y: primitiveSpacing[3],
            },
        },
    },

    // Input
    input: {
        background: semanticColors.surface.elevated,
        border: semanticColors.border.default,
        borderFocus: semanticColors.interactive.accent,
        borderRadius: semanticBorderRadius.component.lg,
        padding: {
            x: primitiveSpacing[4],
            y: primitiveSpacing[3],
        },
    },

    // Badge
    badge: {
        borderRadius: semanticBorderRadius.pill,
        padding: {
            x: primitiveSpacing[3],
            y: primitiveSpacing[1],
        },
        fontSize: primitiveFontSize.xs,
        fontWeight: primitiveFontWeight.semibold,
    },

    // Modal
    modal: {
        background: semanticColors.surface.elevated,
        borderRadius: {
            mobile: primitiveBorderRadius.none,
            desktop: '2.5rem', // 40px - special case for modals
        },
        shadow: primitiveShadow.xl,
        overlay: 'rgba(0, 0, 0, 0.6)',
    },

    // Filter Tab
    filterTab: {
        borderRadius: semanticBorderRadius.component.md,
        padding: {
            x: primitiveSpacing[5],
            y: primitiveSpacing[2],
        },
        active: {
            background: semanticColors.interactive.primary,
            text: semanticColors.text.inverse,
        },
        inactive: {
            background: semanticColors.surface.elevated,
            text: semanticColors.text.primary,
            border: semanticColors.border.default,
        },
    },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get discipline color
 */
export const getDisciplineColor = (discipline) => {
    const disciplineLower = discipline?.toLowerCase();
    return semanticColors.discipline[disciplineLower] || primitiveColors.gray[600];
};

/**
 * Get difficulty color
 */
export const getDifficultyColor = (difficulty) => {
    const difficultyLower = difficulty?.toLowerCase();
    return semanticColors.difficulty[difficultyLower] || primitiveColors.gray[500];
};

/**
 * Get intensity colors (background and text)
 */
export const getIntensityColors = (intensity) => {
    const intensityLower = intensity?.toLowerCase();
    return semanticColors.intensity[intensityLower] || {
        bg: primitiveColors.gray[100],
        text: primitiveColors.gray[700],
    };
};

/**
 * Get Tailwind class for discipline color
 */
export const getDisciplineClass = (discipline) => {
    const classes = {
        strength: 'bg-blue-600',
        running: 'bg-green-500',
        cycling: 'bg-purple-500',
        climbing: 'bg-orange-600',
        hiit: 'bg-red-500',
        cardio: 'bg-pink-500',
        mobility: 'bg-cyan-500',
        calisthenics: 'bg-yellow-600',
    };
    return classes[discipline?.toLowerCase()] || 'bg-gray-600';
};

/**
 * Get Tailwind class for difficulty color
 */
export const getDifficultyClass = (difficulty) => {
    const classes = {
        beginner: 'bg-green-500 text-white',
        intermediate: 'bg-orange-500 text-white',
        advanced: 'bg-red-500 text-white',
    };
    return classes[difficulty?.toLowerCase()] || 'bg-gray-500 text-white';
};

/**
 * Get Tailwind class for intensity
 */
export const getIntensityClass = (intensity) => {
    const classes = {
        low: 'bg-green-100 text-green-800',
        moderate: 'bg-yellow-100 text-yellow-800',
        high: 'bg-orange-100 text-orange-800',
        max: 'bg-red-100 text-red-800',
    };
    return classes[intensity?.toLowerCase()] || 'bg-gray-100 text-gray-700';
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export const designTokens = {
    primitive: {
        colors: primitiveColors,
        spacing: primitiveSpacing,
        borderRadius: primitiveBorderRadius,
        fontSize: primitiveFontSize,
        fontWeight: primitiveFontWeight,
        shadow: primitiveShadow,
    },
    semantic: {
        colors: semanticColors,
        spacing: semanticSpacing,
        borderRadius: semanticBorderRadius,
        typography: semanticTypography,
    },
    component: componentTokens,
    utils: {
        getDisciplineColor,
        getDifficultyColor,
        getIntensityColors,
        getDisciplineClass,
        getDifficultyClass,
        getIntensityClass,
    },
};

export default designTokens;
