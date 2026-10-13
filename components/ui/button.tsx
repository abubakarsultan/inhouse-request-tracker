'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

const button = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      default: 'bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] shadow-sm',
      secondary: 'bg-[var(--card)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--canvas)]',
      ghost: 'text-[var(--muted)] hover:bg-[var(--canvas)]',
      destructive: 'bg-[#c5221f] text-white hover:opacity-90',
    },
    size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', icon: 'h-9 w-9' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
