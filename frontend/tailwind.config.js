/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
	theme: {
		extend: {
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			colors: {
				// Workfit Design System Colors - Figma Palette
				primary: {
					DEFAULT: '#111827', // Greyscale / Grey 900
					foreground: '#FFFFFF',
					50: '#FFF2F0', // Primary/Red 50
					100: '#FEE1DC', // Primary/Red 100
					400: '#FE755D', // Primary/Red 400
					500: '#FE5334', // Primary/Red 500
					600: '#E0482C', // Primary/Red 600 (Added)
					700: '#C23D25', // Primary/Red 700 (Added)
				},
				'coral-brand': '#FE5334', // Adding explicit coral-brand to match usage
				secondary: {
					DEFAULT: '#6366F1',
					foreground: '#FFFFFF'
				},
				// Greyscale Palette
				grey: {
					50: '#F9FAFB',
					100: '#F3F4F6',
					200: '#E5E7EB',
					300: '#D1D5DB', // Greyscale / Grey 300
					400: '#9CA3AF', // Greyscale / Grey 400
					500: '#6B7280', // Greyscale / Grey 500
					600: '#4B5563',
					700: '#374151',
					800: '#1F2937',
					900: '#111827'  // Greyscale / Grey 900
				},
				// Other Colors
				green: {
					DEFAULT: '#00BF71', // Other Colors/Green
					50: '#ECFDF5',
					100: '#D1FAE5',
					600: '#059669',
					800: '#065F46'
				},
				yellow: {
					DEFAULT: '#FBBC05', // Other Colors / Yellow
				},
				white: '#FFFFFF', // Other Colors / White

				// Semantic Aliases
				background: {
					DEFAULT: '#FFFFFF',
					secondary: '#F9FAFB',
					tertiary: '#F3F4F6'
				},
				text: {
					primary: '#111827', // Grey 900
					secondary: '#6B7280', // Grey 500
					tertiary: '#9CA3AF', // Grey 400
					inverse: '#FFFFFF'
				},
				border: {
					DEFAULT: '#E5E7EB',
					light: '#F3F4F6',
					dark: '#D1D5DB'
				},

				// Legacy/Shadcn support
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			spacing: {
				'18': '4.5rem',
				'88': '22rem',
				'128': '32rem'
			},
			fontSize: {
				'xxs': ['0.625rem', { lineHeight: '0.75rem' }],
				'xs': ['0.75rem', { lineHeight: '1rem' }],
				'sm': ['0.875rem', { lineHeight: '1.25rem' }],
				'base': ['1rem', { lineHeight: '1.5rem' }],
				'lg': ['1.125rem', { lineHeight: '1.75rem' }],
				'xl': ['1.25rem', { lineHeight: '1.75rem' }],
				'2xl': ['1.5rem', { lineHeight: '2rem' }],
				'3xl': ['1.875rem', { lineHeight: '2.25rem' }],
				'4xl': ['2.25rem', { lineHeight: '2.5rem' }],
				'5xl': ['3rem', { lineHeight: '1' }]
			},
			borderRadius: {
				'none': '0',
				'sm': '0.25rem',
				'DEFAULT': '0.5rem',
				'md': '0.75rem',
				'lg': '1rem',
				'xl': '1.25rem',
				'2xl': '1.5rem',
				'3xl': '2rem',
				'full': '9999px'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
}