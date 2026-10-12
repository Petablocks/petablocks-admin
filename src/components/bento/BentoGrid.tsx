import React from 'react'
import { cn } from '@/lib/utils'

interface BentoGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  cols?: 3 | 4 | 6
}

export function BentoGrid({
  children,
  className,
  cols = 6,
  ...props
}: BentoGridProps) {
  const colClass = {
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-6',
  }[cols]

  return (
    <div
      className={cn(
        'grid gap-4 auto-rows-[minmax(130px,auto)]',
        colClass,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
