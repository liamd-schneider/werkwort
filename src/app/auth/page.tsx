'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function ForgotPasswordLink({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleReset = async () => {
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email || '', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) return <p className="text-xs text-green-400 mt-1.5">Link gesendet – bitte E-Mail prüfen.</p>

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={loading}
      className="text-xs text-[#fff] hover:text-[#d4e840] transition-colors mt-1.5 text-left disabled:opacity-40"
    >
      {loading ? 'Sende...' : 'Passwort vergessen?'}
    </button>
  )
}

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [betriebName, setBetriebName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { betrieb_name: betriebName } },
        })

        if (signUpError) throw signUpError

        setSuccess('Registrierung erfolgreich! Du bekommst 5 Gratis-Token. Bitte E-Mail bestätigen.')

      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

        if (signInError) throw signInError

        if (data.session) {
          router.replace('/dashboard')
        } else if (data.user && !data.user.email_confirmed_at) {
          setError('Bitte zuerst die E-Mail bestätigen')
        } else {
          setError('Login fehlgeschlagen — keine Session erhalten')
        }
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler aufgetreten'
      if (message.includes('Invalid login credentials')) setError('E-Mail oder Passwort falsch')
      else if (message.includes('Email not confirmed'))  setError('Bitte zuerst E-Mail bestätigen')
      else if (message.includes('User already registered')) setError('Diese E-Mail ist bereits registriert')
      else if (message.includes('Password should be'))  setError('Passwort muss mindestens 6 Zeichen haben')
      else setError(message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setError(null)
    setSuccess(null)
    setShowPassword(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0c0c] flex items-center justify-center">
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center  mb-2">
              <span className="text-3xl font-bold text-[#d4e840] tracking-tight">e</span>
              <span className="text-3xl font-light text-[#f0ede8] tracking-tight">Werk</span>
              <span className="text-3xl font-bold text-[#d4e840] tracking-tight">wort</span>
            </div>
            <p className="text-sm text-[#555]">Sprache wird Arbeit</p>
          </div>

          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
            {/* Tab switcher */}
            <div className="flex bg-[#111] rounded-xl p-1 mb-6 gap-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 text-xs rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium'
                    : 'text-[#555] hover:text-[#888]'
                }`}
              >
                Einloggen
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-2 text-xs rounded-lg transition-all ${
                  mode === 'register'
                    ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium'
                    : 'text-[#555] hover:text-[#888]'
                }`}
              >
                Registrieren
              </button>

            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Betriebsname – nur bei Registrierung */}
              {mode === 'register' && (
                <div>
                  <label className="text-xs text-[#b1b1b1] mb-1.5 block">Betriebsname</label>
                  <input
                    type="text"
                    value={betriebName}
                    onChange={e => setBetriebName(e.target.value)}
                    placeholder="Bauer Fliesen GmbH"
                    required
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"
                  />
                </div>
              )}

              {/* E-Mail */}
              <div>
                <label className="text-xs text-[#b1b1b1] mb-1.5 block">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="info@bauer-fliesen.de"
                  required
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"
                />
              </div>

              {/* Passwort */}
              <div>
                <label className="text-xs text-[#b1b1b1] mb-1.5 block">Passwort</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 pr-12 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {mode === 'login' && (
                  <ForgotPasswordLink email={email} />
                )}
              </div>

              {error   && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              {success && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-400 text-sm">{success}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all mt-1"
              >
                {loading ? 'Laden...' : mode === 'login' ? 'Einloggen' : 'Konto erstellen'}
              </button>
            </form>

            {mode === 'register' && (
              <p className="text-center text-xs text-[#444] mt-4">
                Du bekommst <span className="text-[#d4e840]">5 Token gratis</span> beim Start
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}