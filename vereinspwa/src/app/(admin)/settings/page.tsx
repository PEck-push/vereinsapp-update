'use client'

import { useEffect, useRef, useState } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { useTeams } from '@/lib/hooks/useTeams'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toaster'
import { Camera, Check, ChevronRight, ClipboardCopy, Loader2, Shield, Trash2, Users } from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Einstellungen</h1>
      <SettingsNav />
      <ClubProfileSection />
      <Separator />
      <AdminProfileSection />
      <Separator />
      <CalendarSubscriptionsSection />
      <Separator />
      <SeasonSection />
    </div>
  )
}

function SettingsNav() {
  const { teams } = useTeams()
  const links = [
    { href: '/settings/teams', label: 'Mannschaften verwalten', description: `${teams.length} ${teams.length === 1 ? 'Mannschaft' : 'Mannschaften'} angelegt`, icon: Users, color: 'var(--club-primary, #1a1a2e)' },
    { href: '/settings/users', label: 'Benutzer & Rollen', description: 'Admins, Trainer, Funktionäre', icon: Shield, color: '#8B5CF6' },
  ]
  return (
    <div className="space-y-2">
      {links.map(({ href, label, description, icon: Icon, color }) => (
        <Link key={href} href={href} className="flex items-center gap-4 p-4 bg-white rounded-lg border hover:shadow-sm transition-shadow group" style={{ borderRadius: '8px' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color }}><Icon className="w-5 h-5 text-white" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900">{label}</p><p className="text-xs text-gray-400">{description}</p></div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
        </Link>
      ))}
    </div>
  )
}

/**
 * Converts a File to a base64 data URL.
 * Resizes to max 256x256. Keeps PNG for transparency, JPEG for photos.
 */
async function fileToBase64(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')

    // SVG: just read as data URL directly (no resize needed)
    if (isSvg) {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
      reader.readAsDataURL(file)
      return
    }

    reader.onload = () => {
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * (maxSize / w)); w = maxSize }
          else { w = Math.round(w * (maxSize / h)); h = maxSize }
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }

        // For PNG: keep transparent background
        // For JPEG: no transparency support anyway
        if (!isPng) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
        }

        ctx.drawImage(img, 0, 0, w, h)

        // PNG keeps transparency, JPEG for smaller file size on photos
        const format = isPng ? 'image/png' : 'image/jpeg'
        const quality = isPng ? undefined : 0.85
        resolve(canvas.toDataURL(format, quality))
      }
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsDataURL(file)
  })
}

function ClubProfileSection() {
  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1a1a2e')
  const [secondaryColor, setSecondaryColor] = useState('#e94560')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!db) return
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'clubs', CLUB_ID))
        if (snap.exists()) {
          const data = snap.data()
          setClubName(data.name || '')
          setPrimaryColor(data.primaryColor || '#1a1a2e')
          setSecondaryColor(data.secondaryColor || '#e94560')
          setLogoUrl(data.logoUrl || null)
        }
      } finally { setLoaded(true) }
    }
    load()
  }, [])

  async function handleSave() {
    if (!db) return; setSaving(true)
    try {
      await setDoc(doc(db, 'clubs', CLUB_ID), { name: clubName, primaryColor, secondaryColor }, { merge: true })
      toast.success('Vereinsprofil gespeichert')
    } catch { toast.error('Speichern fehlgeschlagen') } finally { setSaving(false) }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Nur Bilddateien erlaubt'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Maximale Dateigröße: 5 MB'); return }
    if (!db) return

    setUploading(true)
    try {
      const base64 = await fileToBase64(file, 256)
      if (base64.length > 500000) { toast.error('Bild ist zu groß nach Komprimierung.'); return }
      await setDoc(doc(db, 'clubs', CLUB_ID), { logoUrl: base64 }, { merge: true })
      setLogoUrl(base64)
      toast.success('Logo gespeichert')
    } catch (err) {
      console.error('[Logo Upload]', err)
      toast.error('Logo konnte nicht gespeichert werden')
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function handleRemoveLogo() {
    if (!db) return
    setDoc(doc(db, 'clubs', CLUB_ID), { logoUrl: '' }, { merge: true })
    setLogoUrl(null)
    toast.info('Logo entfernt')
  }

  if (!loaded) return null

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Vereinsprofil</h2>

      {/* Logo preview — primary color shows through transparent areas */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-xl shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            clubName.charAt(0).toUpperCase() || 'V'
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {logoUrl ? 'Logo ändern' : 'Logo hochladen'}
            </Button>
            {logoUrl && (
              <Button variant="ghost" size="sm" onClick={handleRemoveLogo} className="text-red-500 hover:text-red-700 text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Entfernen
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">PNG (mit Transparenz), JPG oder SVG. Max 256×256.</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clubName">Vereinsname</Label>
        <Input id="clubName" value={clubName} onChange={e => setClubName(e.target.value)} placeholder="z.B. ASV Pöttsching" />
      </div>
      <div className="space-y-1.5">
        <Label>Primärfarbe</Label>
        <div className="flex items-center gap-3">
          <Input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
          <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-28 font-mono text-sm" />
          <span className="text-xs text-gray-400">Sidebar, Header, Logo-Hintergrund</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Sekundärfarbe</Label>
        <div className="flex items-center gap-3">
          <Input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
          <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-28 font-mono text-sm" />
          <span className="text-xs text-gray-400">Buttons, Akzente</span>
        </div>
      </div>

      <div className="p-4 rounded-lg border space-y-3" style={{ borderRadius: '8px' }}>
        <p className="text-xs text-gray-400 font-medium">Vorschau</p>
        <div className="flex items-center gap-3">
          {/* Logo preview on primary background — shows how transparency looks */}
          <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-white text-xs font-bold">{clubName.charAt(0) || 'V'}</span>}
          </div>
          <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: secondaryColor }} />
          <div className="flex gap-2">
            <span className="px-3 py-1 rounded-md text-xs font-medium text-white" style={{ backgroundColor: primaryColor }}>Primär</span>
            <span className="px-3 py-1 rounded-md text-xs font-medium text-white" style={{ backgroundColor: secondaryColor }}>Sekundär</span>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} variant="club">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Speichern
      </Button>
    </section>
  )
}

function AdminProfileSection() {
  const user = auth?.currentUser ?? null
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  async function handlePasswordChange() {
    if (newPw !== confirmPw) { setPwError('Passwörter stimmen nicht überein'); return }
    if (newPw.length < 8) { setPwError('Mindestens 8 Zeichen'); return }
    if (!user?.email) return
    setPwLoading(true); setPwError(null)
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPw))
      await updatePassword(user, newPw)
      setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setPwSuccess(false), 3000); toast.success('Passwort geändert')
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setPwError('Aktuelles Passwort ist falsch.')
      else setPwError('Passwort konnte nicht geändert werden.')
    } finally { setPwLoading(false) }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Mein Profil</h2>
      <div className="space-y-1.5"><Label>E-Mail</Label><Input value={user?.email ?? ''} readOnly className="bg-gray-50 text-gray-500" /></div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Passwort ändern</p>
        <Input type="password" placeholder="Aktuelles Passwort" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        <Input type="password" placeholder="Neues Passwort (min. 8 Zeichen)" value={newPw} onChange={e => setNewPw(e.target.value)} />
        <Input type="password" placeholder="Neues Passwort bestätigen" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
        {pwError && <p className="text-xs text-red-600">{pwError}</p>}
        {pwSuccess && <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Passwort geändert</p>}
        <Button variant="outline" onClick={handlePasswordChange} disabled={pwLoading || !currentPw || !newPw || !confirmPw}>
          {pwLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Passwort speichern
        </Button>
      </div>
    </section>
  )
}

function CalendarSubscriptionsSection() {
  const { teams } = useTeams()
  const [copied, setCopied] = useState<string | null>(null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  function copy(url: string, key: string) { navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(null), 2000); toast.info('Link kopiert') }
  return (
    <section className="space-y-4">
      <div><h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Kalender-Abos</h2><p className="text-xs text-gray-400 mt-0.5">iCal Links für externe Kalender</p></div>
      <div className="space-y-2">
        <CalendarLinkRow label="Alle Termine" url={`${appUrl}/api/ical?clubId=${CLUB_ID}`} copied={copied === 'all'} onCopy={() => copy(`${appUrl}/api/ical?clubId=${CLUB_ID}`, 'all')} />
        {teams.map(team => <CalendarLinkRow key={team.id} label={team.name} url={`${appUrl}/api/ical?clubId=${CLUB_ID}&teamId=${team.id}`} copied={copied === team.id} onCopy={() => copy(`${appUrl}/api/ical?clubId=${CLUB_ID}&teamId=${team.id}`, team.id)} color={team.color} />)}
      </div>
    </section>
  )
}

function CalendarLinkRow({ label, url, copied, onCopy, color }: { label: string; url: string; copied: boolean; onCopy: () => void; color?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="text-sm font-medium text-gray-700 flex-1">{label}</span>
      <code className="text-xs text-gray-400 hidden md:block truncate max-w-[200px]">{url}</code>
      <button onClick={onCopy} className="text-gray-400 hover:text-gray-700 shrink-0 p-1">{copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}</button>
    </div>
  )
}

function SeasonSection() {
  const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  const [startMonth, setStartMonth] = useState(6)
  const [saving, setSaving] = useState(false)
  async function handleSave() { if (!db) return; setSaving(true); try { await setDoc(doc(db, 'clubs', CLUB_ID), { settings: { seasonStartMonth: startMonth } }, { merge: true }); toast.success('Saison gespeichert') } catch { toast.error('Fehlgeschlagen') } finally { setSaving(false) } }
  return (
    <section className="space-y-4">
      <div><h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Saison</h2><p className="text-xs text-gray-400 mt-0.5">Für Statistik-Filter</p></div>
      <div className="space-y-1.5"><Label>Saison-Start Monat</Label>
        <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))} className="flex h-10 w-48 rounded-[6px] border border-input bg-background px-3 py-2 text-sm">{MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
      </div>
      <Button variant="outline" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Speichern</Button>
    </section>
  )
}