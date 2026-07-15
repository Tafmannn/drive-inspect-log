import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-marketing-electric disabled:pointer-events-none disabled:opacity-60 min-h-11",
  {
    variants: {
      variant: {
        primary:
          "bg-marketing-primary text-white shadow-marketing-sm hover:bg-marketing-primary-hover hover:-translate-y-px focus-visible:ring-offset-marketing-bg-light",
        secondary:
          "bg-white text-marketing-navy border border-marketing-border shadow-marketing-sm hover:border-marketing-primary/40 hover:-translate-y-px focus-visible:ring-offset-marketing-bg-light",
        outlineOnDark:
          "border border-white/25 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-offset-marketing-navy",
        ghost:
          "text-marketing-primary hover:bg-marketing-primary/10 focus-visible:ring-offset-marketing-bg-light",
      },
      size: {
        md: "px-5 py-2.5 text-[0.95rem]",
        lg: "px-7 py-3.5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type CommonProps = VariantProps<typeof buttonStyles> & {
  className?: string;
  children: React.ReactNode;
};

type AsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined };
type AsLink = CommonProps & { to: string } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
  >;
type AsAnchor = CommonProps & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>;

type MarketingButtonProps = AsButton | AsLink | AsAnchor;

/**
 * Unified CTA element. Renders a react-router <Link> (`to`), a native <a>
 * (`href`, for mailto/tel/external), or a <button>, sharing one visual system.
 */
export const MarketingButton = forwardRef<HTMLElement, MarketingButtonProps>(
  ({ variant, size, className, children, ...rest }, ref) => {
    const classes = cn(buttonStyles({ variant, size }), className);

    if ("to" in rest && rest.to !== undefined) {
      const { to, ...linkProps } = rest as AsLink;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          to={to}
          className={classes}
          {...linkProps}
        >
          {children}
        </Link>
      );
    }

    if ("href" in rest && rest.href !== undefined) {
      const anchorProps = rest as AsAnchor;
      return (
        <a ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...anchorProps}>
          {children}
        </a>
      );
    }

    const buttonProps = rest as AsButton;
    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} className={classes} {...buttonProps}>
        {children}
      </button>
    );
  },
);
MarketingButton.displayName = "MarketingButton";
