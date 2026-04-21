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
    setStatus(Notification.permission as PushStatus)
  }, [])

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    try {
      const permission = await Notification.requestPermission()
      setStatus(permission as PushStatus)
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Alte Subscription prüfen
      let subscription = await registration.pushManager.getSubscription()

      // Neue Subscription erstellen falls nicht vorhanden
      if (!subscription) {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
        })
      }

      // An Server senden
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription.toJSON()),
      })

      setStatus('granted')
    } catch (err) {
      console.error('Push subscription failed:', err)
    }
  }

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      if (!registration) return

      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return

      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch('/api/push-subscribe', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint }),
      })

      setStatus('default')
    } catch (err) {
      console.error('Unsubscribe failed:', err)
    }
  }

  return { status, subscribe, unsubscribe }
}

// VAPID Key Helper
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}