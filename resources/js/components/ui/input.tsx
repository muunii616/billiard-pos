import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  onWheel,
  onKeyDown,
  ...props
}: React.ComponentProps<"input">) {
  const isNumber = type === "number"

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        // Hide browser spinners; amounts are typed, not stepped.
        isNumber &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      onWheel={(event) => {
        if (isNumber) {
          // Scroll must not change the value while the field is focused.
          event.currentTarget.blur()
        }
        onWheel?.(event)
      }}
      onKeyDown={(event) => {
        if (isNumber && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault()
        }
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
}

export { Input }
