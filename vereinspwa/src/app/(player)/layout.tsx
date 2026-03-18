interface PlayerLayoutProps {
  children: React.ReactNode
}

export default function PlayerLayout({ children }: PlayerLayoutProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8f9fa' }}>
      <header
        className="h-14 flex items-center px-4 border-b bg-white"
        style={{ borderColor: '#e9ecef' }}
      >
        <span
          className="font-semibold text-sm"
          style={{ fontFamily: 'Outfit, sans-serif', color: '#1a1a2e' }}
        >
          Mein Bereich
        </span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
