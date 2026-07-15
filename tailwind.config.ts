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
				marketing: {
					'bg-dark': 'hsl(var(--marketing-bg-dark))',
					navy: 'hsl(var(--marketing-navy))',
					'navy-elevated': 'hsl(var(--marketing-navy-elevated))',
					'bg-light': 'hsl(var(--marketing-bg-light))',
					surface: 'hsl(var(--marketing-surface))',
					primary: 'hsl(var(--marketing-primary))',
					'primary-hover': 'hsl(var(--marketing-primary-hover))',
					electric: 'hsl(var(--marketing-electric))',
					accent: 'hsl(var(--marketing-accent))',
					text: 'hsl(var(--marketing-text))',
					'text-secondary': 'hsl(var(--marketing-text-secondary))',
					'text-muted': 'hsl(var(--marketing-text-muted))',
					'on-dark': 'hsl(var(--marketing-text-on-dark))',
					'on-dark-muted': 'hsl(var(--marketing-text-on-dark-muted))',
					success: 'hsl(var(--marketing-success))',
					warning: 'hsl(var(--marketing-warning))',
					border: 'hsl(var(--marketing-border))'
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
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			fontFamily: {
				heading: 'var(--font-heading)',
				body: 'var(--font-body)'
			},
			maxWidth: {
				content: '1280px'
			},
			backgroundImage: {
				'marketing-hero': 'var(--marketing-gradient-hero)',
				'marketing-accent': 'var(--marketing-gradient-accent)'
			},
			boxShadow: {
				'marketing-sm': 'var(--marketing-shadow-sm)',
				'marketing-md': 'var(--marketing-shadow-md)',
				'marketing-lg': 'var(--marketing-shadow-lg)'
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
