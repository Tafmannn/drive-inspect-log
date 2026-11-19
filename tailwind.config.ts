import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))'
				},
				'app-header': {
					DEFAULT: 'hsl(var(--app-header))',
					foreground: 'hsl(var(--app-header-foreground))'
				},
				// Phase 1a additive tokens (see src/index.css)
				'border-strong': 'hsl(var(--border-strong))',
				'primary-soft': 'hsl(var(--primary-soft))',
				'success-soft': 'hsl(var(--success-soft))',
				'warning-soft': 'hsl(var(--warning-soft))',
				'danger-soft': 'hsl(var(--danger-soft))',
				'info-soft': 'hsl(var(--info-soft))',
				'done-soft': 'hsl(var(--done-soft))',
				'neutral-soft': 'hsl(var(--neutral-soft))',
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
			// Phase 1a type scale tokens. Additive only: Tailwind's default text-xs/sm/... and
			// every existing text-[Npx] use are untouched. 12px (caption) is the floor.
			fontSize: {
				caption: ['var(--text-caption)', { lineHeight: 'var(--lh-caption)' }],
				label: ['var(--text-label)', { lineHeight: 'var(--lh-label)', fontWeight: '600' }],
				body: ['var(--text-body)', { lineHeight: 'var(--lh-body)' }],
				title: ['var(--text-title)', { lineHeight: 'var(--lh-title)', fontWeight: '650' }],
				h1: ['var(--text-h1)', { lineHeight: 'var(--lh-h1)', fontWeight: '650', letterSpacing: '-0.02em' }],
				display: ['var(--text-display)', { lineHeight: 'var(--lh-display)', fontWeight: '650', letterSpacing: '-0.02em' }]
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
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
} satisfies Config;
