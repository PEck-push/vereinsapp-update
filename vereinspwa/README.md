# Vereins-PWA – Sprint 1

## Stack
- Next.js 14 (App Router) + TypeScript
- shadcn/ui + Tailwind CSS
- Firebase (Auth + Firestore + Hosting + FCM)

---

## Lokales Setup

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Environment Variables
```bash
cp .env.local.example .env.local
```
Fülle alle Werte aus (Firebase Console → Project Settings).

**FIREBASE_ADMIN_PRIVATE_KEY**: Den Private Key als eine Zeile eintragen, `\n` als wörtliche Escape-Sequenz belassen:
```
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

### 3. Dev Server starten
```bash
npm run dev
```
→ http://localhost:3000

### 4. Ersten Admin-User anlegen
Da noch kein Registrierungsflow existiert, Admin manuell in Firebase Console anlegen:
1. Firebase Console → Authentication → Users → Add User
2. Firestore → Collection `adminUsers` → Dokument mit der UID des Users:
```json
{
  "uid": "FIREBASE_UID",
  "playerId": "placeholder",
  "role": "admin",
  "teamIds": [],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

## ⚠️ Kritischer Hinweis: Firebase Hosting + Next.js SSR

**Firebase Hosting allein unterstützt kein SSR / API Routes / Middleware.**

Diese App benötigt Server-Side-Rendering (Session Cookies, Middleware, API Routes).

### Deployment-Optionen (Auswahl für Sprint 2+):

| Option | Aufwand | Kosten | Empfehlung |
|--------|---------|--------|------------|
| **Firebase Hosting + Cloud Functions** (via `firebase-frameworks`) | Mittel | Firebase Spark/Blaze | ✅ Passt zum Stack |
| **Vercel** | Minimal | Generous Free Tier | ✅ Einfachste Option |
| **Cloud Run** | Hoch | Pay-per-use | Für hohe Last |

**Für diesen Sprint empfohlen**: Vercel für schnelle Iteration, Firebase für finale Produktion.

#### Vercel Setup (5 Minuten):
```bash
npm i -g vercel
vercel
```
Environment Variables im Vercel Dashboard eintragen.

#### Firebase Hosting + Cloud Functions:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Wähle: "Use an existing project", dann "Hosting: Configure files for Firebase Hosting"
# Framework: Next.js auswählen (experimentelles Framework-Aware Hosting)
firebase deploy
```

---

## Projektstruktur

```
src/
├── app/
│   ├── (admin)/              ← Geschützte Admin-Routes
│   │   ├── dashboard/page.tsx
│   │   └── layout.tsx        ← Sidebar + Header
│   ├── (player)/             ← Geschützte Spieler-Routes
│   │   ├── mein-bereich/page.tsx
│   │   └── layout.tsx
│   ├── invite/[token]/page.tsx  ← Public: Onboarding
│   ├── login/page.tsx           ← Public: Login
│   ├── api/auth/session/route.ts
│   └── layout.tsx               ← Root Layout (Fonts)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   └── ui/                   ← shadcn/ui Komponenten
├── lib/
│   ├── firebase/
│   │   ├── client.ts         ← Client SDK (Singleton)
│   │   └── admin.ts          ← Admin SDK (Server only)
│   ├── types/index.ts        ← TypeScript Interfaces
│   └── utils.ts              ← cn() helper
└── middleware.ts              ← Auth-Guard (nodejs runtime!)
```

---

## Auth-Flow

```
Login Page
  → signInWithEmailAndPassword (Firebase Client)
  → getIdToken()
  → POST /api/auth/session (setzt httpOnly Cookie)
  → redirect /dashboard

Middleware (bei jedem Request auf geschützte Routes):
  → liest __session Cookie
  → adminAuth.verifySessionCookie()
  → ✅ weiter | ❌ redirect /login + Cookie löschen

Logout:
  → signOut (Firebase Client)
  → DELETE /api/auth/session (löscht Cookie)
  → redirect /login
```

---

## GitHub Actions

Alle env vars müssen als **GitHub Secrets** hinterlegt werden:
- `FIREBASE_SERVICE_ACCOUNT` (JSON, von Firebase Console)
- Alle `NEXT_PUBLIC_*` und `FIREBASE_ADMIN_*` Werte

---

## Nächste Sprints

| Sprint | Inhalt |
|--------|--------|
| Sprint 2 | Dashboard Widgets, Spieler-CRUD |
| Sprint 3 | Invite-Flow, Spieler-Onboarding |
| Sprint 4 | Firestore Security Rules |
| Sprint 5 | FCM Push Notifications |
