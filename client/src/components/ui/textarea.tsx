import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-xl border border-[#DCE1E7] bg-white px-3 py-2 text-base text-[#20242B] placeholder:text-[#68707D] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#01FF22] focus:shadow-[0_0_0_3px_rgba(1,255,34,0.16)] disabled:cursor-not-allowed disabled:bg-[#F4F6F8] disabled:opacity-60 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
