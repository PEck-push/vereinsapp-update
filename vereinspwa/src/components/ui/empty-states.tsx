import { Button } from '@/components/ui/button'
import { BarChart2, CalendarOff, UserPlus, Users } from 'lucide-react'

interface EmptyStateProps {
  onAction?: () => void
}

export function EmptyPlayers({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Users className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Noch keine Spieler
      </h3>
      <p className="text-xs text-gray-400 mb-4 max-w-xs">
        Lege den ersten Spieler an und sende ihm einen Einladungslink.
      </p>
      {onAction && (
        <Button size="sm" onClick={onAction} style={{ backgroundColor: '#e94560' }}>
          <UserPlus className="w-4 h-4 mr-2" />
          Ersten Spieler anlegen
        </Button>
      )}
    </div>
  )
}

export function EmptyEvents({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <CalendarOff className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Noch keine Termine
      </h3>
      <p className="text-xs text-gray-400 mb-4 max-w-xs">
        Erstelle Trainings, Spiele oder Meetings für deine Mannschaften.
      </p>
      {onAction && (
        <Button size="sm" onClick={onAction} style={{ backgroundColor: '#e94560' }}>
          Ersten Termin anlegen
        </Button>
      )}
    </div>
  )
}

export function EmptyStats() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <BarChart2 className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Noch keine Trainingsdaten
      </h3>
      <p className="text-xs text-gray-400 max-w-xs">
        Sobald Spieler auf Trainingseinladungen antworten, erscheinen hier Statistiken.
      </p>
    </div>
  )
}
