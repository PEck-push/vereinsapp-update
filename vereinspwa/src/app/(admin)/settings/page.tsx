'use client'

import { useRef, useState } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebase/client'
import { CLUB_ID } from '@/lib/config'
import { useTeams } from '@/lib/hooks/useTeams'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toaster'
import { Camera, Check, ClipboardCopy, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Einstellungen
      </h1>
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

function ClubProfileSection() {
  const [clubName, setClubName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1a1a2e')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!db) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'clubs', CLUB_ID), { name: clubName, primaryColor }, { merge: true })
      document.documentElement.style.setProperty('--color-primary', primaryColor)
      toast.success('Vereinsprofil gespeichert')
    } catch { toast.error('Speichern fehlgeschlagen') } finally { setSaving(false) }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast.error('Nur PNG oder JPG erlaubt'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Maximale Dateigröße: 2 MB'); return }
    if (!storage || !db) return
    setUploading(true)
    try {
      const sRef = storageRef(storage, `clubs/${CLUB_ID}/logo`)
      await uploadBytes(sRef, file)
      const url = await getDownloadURL(sRef)
      await setDoc(doc(db, 'clubs', CLUB_ID), { logoUrl: url }, { merge: true })
      setLogoUrl(url)
      toast.success('Logo gespeichert')
    } catch { toast.error('Upload fehlgeschlagen') } finally { setUploading(false) }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Vereinsprofil</h2>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-xl" style={{ backgroundColor: primaryColor }}>
          {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : 'V'}
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
            Logo hochladen
          </Button>
          <p className="text-xs text-gray-400 mt-1">PNG oder JPG, max. 2 MB</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clubName">Vereinsname</Label>
        <Input id="clubName" value={clubName} onChange={e => setClubName(e.target.value)} placeholder="z.B. SC Rapid Wien" />
      </div>
      <div className="space-y-1.5">
        <Label>Primärfarbe</Label>
        <div className="flex items-center gap-3">
          <Input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
          <span className="text-sm text-gray-500 font-mono">{primaryColor}</span>
          <span className="text-xs text-gray-400">Wird als Hauptfarbe der App verwendet</span>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: '#e94560' }}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Speichern
      </Button>
    </section>
  )
}

function AdminProfileSection() {
  // Guard: auth may be null during build-time static generation
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
    setPwLoading(true)
    setPwError(null)
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw)
      await reauthenticateWithCredential(user, cred)
      await updatePassword(user, newPw)
      setPwSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setPwSuccess(false), 3000)
      toast.success('Passwort geändert')
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPwError('Aktuelles Passwort ist falsch.')
      } else { setPwError('Passwort konnte nicht geändert werden.') }
    } finally { setPwLoading(false) }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Mein Profil</h2>
      <div className="space-y-1.5">
        <Label>E-Mail</Label>
        <Input value={user?.email ?? ''} readOnly className="bg-gray-50 text-gray-500" />
        <p className="text-xs text-gray-400">E-Mail kann nicht geändert werden.</p>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Passwort ändern</p>
        <Input type="password" placeholder="Aktuelles Passwort" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        <Input type="password" placeholder="Neues Passwort (min. 8 Zeichen)" value={newPw} onChange={e => setNewPw(e.target.value)} />
        <Input type="password" placeholder="Neues Passwort bestätigen" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
        {pwError && <p className="text-xs text-red-600">{pwError}</p>}
        {pwSuccess && <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Passwort geändert</p>}
        <Button variant="outline" onClick={handlePasswordChange} disabled={pwLoading || !currentPw || !newPw || !confirmPw}>
          {pwLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Passwort speichern
        </Button>
      </div>
    </section>
  )
}

function CalendarSubscriptionsSection() {
  const { teams } = useTeams()
  const [copied, setCopied] = useState<string | null>(null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  function copy(url: string, key: string) {
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
    toast.info('Link kopiert')
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Kalender-Abos</h2>
        <p className="text-xs text-gray-400 mt-0.5">iCal Links für externe Kalender (Google, Apple, Outlook)</p>
      </div>
      <div className="space-y-2">
        <CalendarLinkRow label="Alle Termine" url={`${appUrl}/api/ical?clubId=${CLUB_ID}`} copied={copied === 'all'} onCopy={() => copy(`${appUrl}/api/ical?clubId=${CLUB_ID}`, 'all')} />
        {teams.map(team => (
          <CalendarLinkRow key={team.id} label={team.name} url={`${appUrl}/api/ical?clubId=${CLUB_ID}&teamId=${team.id}`} copied={copied === team.id} onCopy={() => copy(`${appUrl}/api/ical?clubId=${CLUB_ID}&teamId=${team.id}`, team.id)} color={team.color} />
        ))}
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
      <button onClick={onCopy} className="text-gray-400 hover:text-gray-700 shrink-0 p-1" title="Link kopieren">
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
      </button>
    </div>
  )
}

function SeasonSection() {
  const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  const [startMonth, setStartMonth] = useState(6)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!db) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'clubs', CLUB_ID), { settings: { seasonStartMonth: startMonth } }, { merge: true })
      toast.success('Saison-Einstellung gespeichert')
    } catch { toast.error('Speichern fehlgeschlagen') } finally { setSaving(false) }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Saison</h2>
        <p className="text-xs text-gray-400 mt-0.5">Wird für den „Diese Saison" Filter in Statistiken verwendet.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Saison-Start Monat</Label>
        <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))} className="flex h-10 w-48 items-center justify-between rounded-[6px] border border-input bg-background px-3 py-2 text-sm">
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
      </div>
      <Button variant="outline" onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Speichern
      </Button>
    </section>
  )
}