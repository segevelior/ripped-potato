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
				// Workfit Design System Colors
				primary: {
					DEFAULT: '#1F2937', // gray-900 - main dark color for buttons, text
					foreground: '#FFFFFF'
				},
				secondary: {
					DEFAULT: '#6366F1', // indigo-600 - accent blue
					foreground: '#FFFFFF'
				},
				accent: {
					DEFAULT: '#FF6B52', // coral/orange - for links, checkboxes, highlights
					foreground: '#FFFFFF',
					light: '#FF8A73',
					dark: '#E5533A'
				},
				coral: {
					DEFAULT: '#FF6B52',
					50: '#FFF5F2',
					100: '#FFE5DE',
					200: '#FFCBBF',
					300: '#FFB0A0',
					400: '#FF8A73',
					500: '#FF6B52',
					600: '#E5533A',
					700: '#CC3B22',
					800: '#B22710',
					900: '#991705',
					'brand': '#FE755D', // Figma Primary/Red 400
				},
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
					900: '#111827'
				},
				// Background colors
				background: {
					DEFAULT: '#FFFFFF',
					secondary: '#F9FAFB',
					tertiary: '#F3F4F6'
				},
				// Text colors
				text: {
					primary: '#111827',
					secondary: '#6B7280',
					tertiary: '#9CA3AF',
					inverse: '#FFFFFF'
				},
				// Border colors
				border: {
					DEFAULT: '#E5E7EB',
					light: '#F3F4F6',
					dark: '#D1D5DB'
				},
				// Status colors
				success: {
					DEFAULT: '#10B981',
					light: '#D1FAE5',
					dark: '#047857'
				},
				error: {
					DEFAULT: '#EF4444',
					light: '#FEE2E2',
					dark: '#DC2626'
				},
				warning: {
					DEFAULT: '#F59E0B',
					light: '#FEF3C7',
					dark: '#D97706'
				},
				info: {
					DEFAULT: '#3B82F6',
					light: '#DBEAFE',
					dark: '#2563EB'
				},
				// Legacy support (keep for existing components)
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