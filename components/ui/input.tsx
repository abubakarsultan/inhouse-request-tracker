import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[#9aa0a6] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]', className)} {...props} />
));
Input.displayName = 'Input';
