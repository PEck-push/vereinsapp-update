'use client'

import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from './badge'

export interface MultiSelectOption {
  value: string
  label: string
  color?: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Auswählen...',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(optValue: string) {
    onChange(
      value.includes(optValue)
        ? value.filter((v) => v !== optValue)
        : [...value, optValue]
    )
  }

  function remove(optValue: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(value.filter((v) => v !== optValue))
  }

  const selected = options.filter((o) => value.includes(o.value))

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1 rounded-[6px] border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          open && 'ring-2 ring-ring ring-offset-2'
        )}
      >
        {selected.length === 0 && (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        {selected.map((opt) => (
          <Badge
            key={opt.value}
            variant="secondary"
            className="flex items-center gap-1 pr-1"
          >
            {opt.color && (
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
            )}
            {opt.label}
            <button
              type="button"
              onClick={(e) => remove(opt.value, e)}
              className="ml-0.5 rounded-full hover:bg-gray-300"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 opacity-50 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-1 max-h-60 overflow-y-auto">
            {options.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Keine Teams vorhanden
              </p>
            )}
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
              >
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    value.includes(opt.value)
                      ? 'bg-primary border-primary'
                      : 'border-input'
                  )}
                >
                  {value.includes(opt.value) && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </div>
                {opt.color && (
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
