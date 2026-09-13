import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-[#DCE1E7] bg-white px-3 py-2 text-base text-[#20242B] placeholder:text-[#68707D] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#01FF22] focus:shadow-[0_0_0_3px_rgba(1,255,34,0.16)] disabled:cursor-not-allowed disabled:bg-[#F4F6F8] disabled:opacity-60 sm:h-10 md:text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#20242B] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#42494D]",
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
