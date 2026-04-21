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
    .select('subscription')
    .eq('user_id', userId)

  if (error || !subs?.length) return

  const results = await Promise.allSettled(
    subs.map(async (row: { subscription: webpush.PushSubscription }) => {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(payload))
      } catch (err: any) {
        // Subscription abgelaufen oder ungültig → löschen
        if (err.statusCode === 404 || err.statusCode === 410) {
          await (supabaseAdmin as any)
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('subscription->>endpoint', row.subscription.endpoint)
        }
      }
    })
  )

  return results
}