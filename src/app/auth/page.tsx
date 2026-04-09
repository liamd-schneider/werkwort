'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [betriebName, setBetriebName] = useState('')
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { betrieb_name: betriebName } },
        })

        if (signUpError) throw signUpError

        if (data.user) {
          // Betrieb anlegen
          const { error: betriebError } = await (supabase as any)
            .from('betriebe')
            .insert({
              user_id:  data.user.id,
              name:     betriebName,
              adresse:  '',
            })

          if (betriebError) console.error('Betrieb anlegen fehlgeschlagen:', betriebError)

          // Token-Konto anlegen (Fallback falls Trigger fehlt)
          const { error: tokenError } = await (supabase as any)
            .from('token_konten')
            .upsert({ user_id: data.user.id, guthaben: 5 }, { onConflict: 'user_id' })

          if (tokenError) console.error('Token-Konto anlegen fehlgeschlagen:', tokenError)

          setSuccess('Registrierung erfolgreich! Du bekommst 5 Gratis-Token. Bitte E-Mail bestätigen.')
        }

      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError

        if (data.session) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          window.location.replace('/dashboard')
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

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1 mb-2">
            <span className="text-3xl font-light text-[#f0ede8] tracking-tight">werk</span>
            <span className="text-3xl font-bold text-[#d4e840] tracking-tight">wort</span>
          </div>
          <p className="text-sm text-[#555]">Sprache wird Arbeit</p>
        </div>

        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex bg-[#111] rounded-xl p-1 mb-6">
            <button type="button" onClick={() => { setMode('login'); setError(null) }}
              className={`flex-1 py-2 text-sm rounded-lg transition-all ${mode === 'login' ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium' : 'text-[#555] hover:text-[#888]'}`}>
              Einloggen
            </button>
            <button type="button" onClick={() => { setMode('register'); setError(null) }}
              className={`flex-1 py-2 text-sm rounded-lg transition-all ${mode === 'register' ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium' : 'text-[#555] hover:text-[#888]'}`}>
              Registrieren
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div>
                <label className="text-xs text-[#666] mb-1.5 block">Betriebsname</label>
                <input type="text" value={betriebName} onChange={e => setBetriebName(e.target.value)}
                  placeholder="Bauer Fliesen GmbH" required
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
              </div>
            )}
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">E-Mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="info@bauer-fliesen.de" required
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Passwort</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
            {success && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-400 text-sm">{success}</div>}

            <button type="submit" onClick={() => console.log('submit')} disabled={loading}
              className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all mt-1">
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
  )
}