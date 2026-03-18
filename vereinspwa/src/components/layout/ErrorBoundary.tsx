'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props { children: React.ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Etwas ist schiefgelaufen
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.
            </p>
            <Button
              onClick={() => window.location.reload()}
              style={{ backgroundColor: '#e94560' }}
            >
              Seite neu laden
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
