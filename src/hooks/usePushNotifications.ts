// hooks/usePushNotifications.ts
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PushStatus = 'unsupported' | 'denied' | 'granted' | 'default' | 'loading'

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('loading')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }

    // Prüfe ob Berechtigung UND aktive Subscription vorhanden
    const checkRealStatus = async () => {
      const permission = Notification.permission
      if (permission !== 'granted') {
        setStatus(permission as PushStatus)
        return
      }
      // Berechtigung ist granted – aber gibt es wirklich eine Subscription?
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        let hasSub = false
        for (const reg of regs) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) { hasSub = true; break }
        }
        setStatus(hasSub ? 'granted' : 'default')
      } catch {
        setStatus('default')
      }
    }

    checkRealStatus()
  }, [])

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    try {
      // 1. Berechtigung anfragen
      const permission = await Notification.requestPermission()
      setStatus(permission as PushStatus)
      if (permission !== 'granted') return

      // 2. SW registrieren
      const registration = await navigator.serviceWorker.register('/sw.js')

      // 3. Warten bis SW wirklich aktiv ist
      await new Promise<void>((resolve) => {
        if (registration.active) {
          resolve()
          return
        }
        const sw = registration.installing || registration.waiting
        if (!sw) { resolve(); return }
        sw.addEventListener('statechange', (e) => {
          if ((e.target as ServiceWorker).state === 'activated') resolve()
        })
      })

      // 4. Alte Subscription holen oder neue erstellen
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt!')
          return
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      // 5. An Server senden
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('Keine Session!')
        return
      }

      const body = subscription.toJSON()
      console.log('Sende Subscription:', body)

      const res = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const result = await res.json()
      console.log('Server Antwort:', res.status, result)

      if (!res.ok) {
        console.error('Server Fehler:', result)
        return
      }

      setStatus('granted')
    } catch (err) {
      console.error('Push subscription failed:', err)
    }
  }

  const unsubscribe = async () => {
    try {
      // Alle SW-Registrierungen durchsuchen
      const regs = await navigator.serviceWorker.getRegistrations()
      console.log('Registrierungen:', regs.length)

      let subscription = null
      for (const reg of regs) {
        subscription = await reg.pushManager.getSubscription()
        if (subscription) break
      }

      console.log('Gefundene Subscription:', subscription)

      if (!subscription) {
        setStatus('default')
        return
      }

      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/push-subscribe', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint }),
      })

      console.log('Unsubscribe Antwort:', res.status)
      setStatus('default')
    } catch (err) {
      console.error('Unsubscribe failed:', err)
    }
  }

  return { status, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const array = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    array[i] = rawData.charCodeAt(i)
  }
  return array
}