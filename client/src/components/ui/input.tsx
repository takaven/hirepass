import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    // Clean iOS-inspired input styling with green focus
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border-[1.5px] border-[#E5E5EA] bg-[rgba(255,255,255,0.6)] px-4 py-3 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground outline-none focus:border-[#00C853] focus:shadow-[0_0_0_3px_rgba(0,200,83,0.15)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-200",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
