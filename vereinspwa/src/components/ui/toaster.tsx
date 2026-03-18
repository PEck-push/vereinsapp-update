'use client'

import * as React from 'react'
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from './toast'
import type { ToastProps } from './toast'

// ─── State management ─────────────────────────────────────────────────────────
type ToastData = ToastProps & {
  id: string
  title?: string
  description?: string
}

type State = { toasts: ToastData[] }
type Action =
  | { type: 'ADD'; toast: ToastData }
  | { type: 'REMOVE'; id: string }

let count = 0
function genId() { return String(++count) }

const listeners: Array<(state: State) => void> = []
let memState: State = { toasts: [] }

function dispatch(action: Action) {
  memState = reducer(memState, action)
  listeners.forEach(l => l(memState))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...state.toasts].slice(0, 5) }
    case 'REMOVE':
      return { toasts: state.toasts.filter(t => t.id !== action.id) }
  }
}

export function toast(props: Omit<ToastData, 'id'>) {
  const id = genId()
  dispatch({ type: 'ADD', toast: { ...props, id } })
  setTimeout(() => dispatch({ type: 'REMOVE', id }), 4000)
  return id
}

// Convenience helpers
toast.success = (title: string, description?: string) =>
  toast({ variant: 'success' as ToastProps['variant'], title, description })
toast.error = (title: string, description?: string) =>
  toast({ variant: 'destructive' as ToastProps['variant'], title, description })
toast.info = (title: string, description?: string) =>
  toast({ variant: 'info' as ToastProps['variant'], title, description })

export function useToast() {
  const [state, setState] = React.useState<State>(memState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { const i = listeners.indexOf(setState); if (i > -1) listeners.splice(i, 1) }
  }, [])
  return { toasts: state.toasts, toast }
}

// ─── Toaster component ────────────────────────────────────────────────────────
export function Toaster() {
  const { toasts } = useToast()
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, variant, ...props }) => (
        <Toast key={id} variant={variant} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
