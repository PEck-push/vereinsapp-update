'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'

interface AdminLayoutProps { children: React.ReactNode }

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const clubName = 'Mein Verein'

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f8f9fa' }}>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar clubName={clubName} />
      </div>

      {/* Mobile Sidebar via Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[240px]">
          <Sidebar clubName={clubName} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header clubName={clubName} onMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
