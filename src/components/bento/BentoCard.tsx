import React from 'react'
import { cn } from '@/lib/utils'

export type BentoGlowColor = 'emerald' | 'amber' | 'cyan' | 'rose' | 'purple' | 'primary' | 'none'

interface BentoCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  children: React.ReactNode
  className?: string
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6
  rowSpan?: 1 | 2 | 3
  glowColor?: BentoGlowColor
  title?: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  statusIndicator?: {
    color?: string
    label?: string
    pulse?: boolean
  }
}

const colSpanClasses: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'md:col-span-1 lg:col-span-2',
  3: 'md:col-span-2 lg:col-span-3',
  4: 'md:col-span-2 lg:col-span-4',
  5: 'md:col-span-2 lg:col-span-5',
  6: 'col-span-full',
}

const rowSpanClasses: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-1 lg:row-span-2',
  3: 'row-span-1 lg:row-span-3',
}

const glowClasses: Record<BentoGlowColor, string> = {
  emerald: 'hover:border-emerald-500/50 hover:shadow-emerald-500/10 focus-within:border-emerald-500/50',
  amber: 'hover:border-amber-500/50 hover:shadow-amber-500/10 focus-within:border-amber-500/50',
  cyan: 'hover:border-cyan-500/50 hover:shadow-cyan-500/10 focus-within:border-cyan-500/50',
  rose: 'hover:border-rose-500/50 hover:shadow-rose-500/10 focus-within:border-rose-500/50',
  purple: 'hover:border-purple-500/50 hover:shadow-purple-500/10 focus-within:border-purple-500/50',
  primary: 'hover:border-primary/50 hover:shadow-primary/10 focus-within:border-primary/50',
  none: '',
}

export function BentoCard({
  children,
  className,
  colSpan = 2,
  rowSpan = 1,
  glowColor = 'primary',
  title,
  subtitle,
  icon,
  badge,
  actions,
  statusIndicator,
  ...props
}: BentoCardProps) {
  const hasHeader = title || subtitle || icon || badge || actions || statusIndicator

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-lg',
        colSpanClasses[colSpan],
        rowSpanClasses[rowSpan],
        glowClasses[glowColor],
        className
      )}
      {...props}
    >
      {/* Subtle background ambient gradient on hover */}
      <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-2xl" />

      {hasHeader && (
        <div className="relative z-10 flex items-start justify-between gap-3 mb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="p-2 rounded-xl bg-muted/60 border border-border/50 text-foreground group-hover:scale-105 transition-transform shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {title && (
                  <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight truncate">
                    {title}
                  </h3>
                )}
                {badge}
              </div>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {statusIndicator && (
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border border-border/50 bg-background/50">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    statusIndicator.color || 'bg-emerald-400',
                    statusIndicator.pulse && 'animate-pulse'
                  )}
                />
                {statusIndicator.label && <span>{statusIndicator.label}</span>}
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Card Body */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0 min-w-0">
        {children}
      </div>
    </div>
  )
}
