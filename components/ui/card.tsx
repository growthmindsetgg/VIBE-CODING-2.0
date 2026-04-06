import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-xl", {
  variants: {
    variant: {
      glass:
        "border border-white/10 bg-white/[0.04] shadow-[0_0_40px_rgba(0,240,255,0.06)] backdrop-blur-xl",
      brutal:
        "border-[3px] border-black bg-[#fafaf8] shadow-[4px_4px_0_0_#000] text-zinc-900",
    },
  },
  defaultVariants: {
    variant: "glass",
  },
});

export type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6 pb-0", className)} {...props} />;
}

type TitleProps = HTMLAttributes<HTMLHeadingElement> & { variant?: "glass" | "brutal" };

export function CardTitle({ className, variant = "glass", ...props }: TitleProps) {
  return (
    <h3
      className={cn(
        "font-semibold leading-none tracking-tight",
        variant === "brutal" ? "text-black" : "text-white",
        className,
      )}
      {...props}
    />
  );
}

type DescProps = HTMLAttributes<HTMLParagraphElement> & { variant?: "glass" | "brutal" };

export function CardDescription({ className, variant = "glass", ...props }: DescProps) {
  return (
    <p
      className={cn("text-sm", variant === "brutal" ? "text-zinc-600" : "text-cyan-100/60", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-4", className)} {...props} />;
}
