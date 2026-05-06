// lib/pwa.ts
let _prompt: Event | null = null

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    _prompt = e
  })
}

export function getCachedPrompt() { return _prompt }
export function clearCachedPrompt() { _prompt = null }