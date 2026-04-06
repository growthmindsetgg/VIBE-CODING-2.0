import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9146FF]/80 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-emerald-400 text-[#050510] shadow-[0_0_24px_rgba(0,240,255,0.35)] hover:brightness-110 focus-visible:ring-offset-[#050510]",
        outline:
          "border border-cyan-500/40 bg-white/5 text-cyan-100 backdrop-blur hover:border-cyan-400/70 hover:bg-cyan-500/10 focus-visible:ring-offset-[#050510]",
        ghost:
          "text-cyan-200/90 hover:bg-white/5 hover:text-cyan-50 focus-visible:ring-offset-[#050510]",
        link: "text-cyan-400 underline-offset-4 hover:underline focus-visible:ring-offset-transparent",
        brutalPrimary:
          "border-[3px] border-black bg-[#9146FF] text-white shadow-[4px_4px_0_0_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] focus-visible:ring-offset-[#fafaf8]",
        brutalOutline:
          "border-[3px] border-black bg-[#fafaf8] text-black shadow-[4px_4px_0_0_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] focus-visible:ring-offset-[#fafaf8]",
        brutalGhost:
          "border-[3px] border-transparent text-[#5c16c5] underline-offset-2 hover:underline focus-visible:ring-offset-[#fafaf8]",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-md px-4 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "brutalPrimary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";
