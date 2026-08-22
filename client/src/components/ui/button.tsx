import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-200" +
  " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-[#00C853] text-white border border-[#00B548] shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border",
        outline:
          "border border-input bg-white/50 dark:bg-white/5 hover:bg-white/70 dark:hover:bg-white/10 shadow-xs",
        secondary: 
          "bg-white/60 dark:bg-white/10 backdrop-blur-sm border border-[#00C853]/30 text-foreground",
        ghost: 
          "border border-transparent hover:bg-white/50 dark:hover:bg-white/10",
        link: 
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-xl px-3 text-xs",
        lg: "min-h-10 rounded-xl px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
