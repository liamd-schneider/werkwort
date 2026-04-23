// lib/send-push.ts

import webpush from 'web-push'
import { supabaseAdmin } from './supabase-admin'

webpush.setVapidDetails(
  process.env.VAPID_MAILTO!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

interface PushPayload {
  titel: string
  text?: string
  link?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const { data: subs, error } = await (supabaseAdmin as any)
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId)

  if (error) {
    console.error('Fehler beim Laden der Subscriptions:', error)
    return
  }

  if (!subs?.length) return

  const results = await Promise.allSettled(
    subs.map(async (row: { id: string; subscription: webpush.PushSubscription }) => {
      try {
        await webpush.sendNotification(
          row.subscription,
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24h Time-to-live
        )
      } catch (err: any) {
        // Subscription abgelaufen oder ungültig → löschen
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log('Subscription ungültig, wird gelöscht:', row.id)
          await (supabaseAdmin as any)
            .from('push_subscriptions')
            .delete()
            .eq('id', row.id)
        } else {
          console.error('Push Fehler:', err.statusCode, err.body)
        }
      }
    })
  )

  return results
}