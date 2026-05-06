"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { getCachedPrompt, clearCachedPrompt } from "@/lib/pwa"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function usePWAInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => getCachedPrompt() as BeforeInstallPromptEvent | null
  )
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", h)
    window.addEventListener("appinstalled", () => setInstalled(true))
    return () => window.removeEventListener("beforeinstallprompt", h)
  }, [])

  const install = useCallback(async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === "accepted") setInstalled(true)
    clearCachedPrompt()
    setPrompt(null)
  }, [prompt])

  return { canInstall: !!prompt, installed, install }
}

export default function Page() {
  const router = useRouter()
  const { canInstall, installed, install } = usePWAInstall()
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard")
      } else {
        setChecking(false)
      }
    })
  }, [router])

  const handleInstall = () => {
    if (canInstall) {
      install()
    } else {
      setShowInstallHint(true)
    }
  }

  // Kurz nichts zeigen während Session geprüft wird
  if (checking) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0c0c0c",
        }}
      />
    )
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0c0c0c",
        color: "#f0ede8",
        fontFamily: "'Montserrat', Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        padding: "24px",
      }}
    >
      {/* Logo / Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "#d4e840",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 18,
            color: "#000",
          }}
        >
          e
        </div>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>
          eWerkwort
        </span>
      </div>

      {/* Install Button */}
      {installed ? (
        <div
          style={{
            background: "#181818",
            border: "1px solid rgba(0,212,170,0.25)",
            borderRadius: 12,
            padding: "14px 20px",
            maxWidth: 320,
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ color: "#00D4AA", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            ✓ Bereits installiert
          </div>
          <div style={{ color: "#555", fontSize: 12, lineHeight: 1.5 }}>
            eWerkwort ist bereits in deinen Apps. Öffne die App direkt vom Home-Bildschirm.
          </div>
        </div>
      ) : (
        <button
          onClick={handleInstall}
          style={{
            background: "#d4e840",
            color: "#000",
            border: "none",
            borderRadius: 12,
            padding: "14px 32px",
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
            width: "100%",
            maxWidth: 320,
            transition: "filter 0.2s, transform 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.1)"
            e.currentTarget.style.transform = "translateY(-2px)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)"
            e.currentTarget.style.transform = "translateY(0)"
          }}
        >
          Installieren
        </button>
      )}

      {/* Manual install hint (iOS / kein Browser-Prompt) */}
      {showInstallHint && (
        <div
          style={{
            background: "#181818",
            border: "1px solid rgba(212,232,64,0.2)",
            borderRadius: 12,
            padding: "16px 20px",
            maxWidth: 320,
            width: "100%",
            fontSize: 13,
            color: "#aaa",
            lineHeight: 1.6,
            position: "relative",
          }}
        >
          <button
            onClick={() => setShowInstallHint(false)}
            style={{
              position: "absolute",
              top: 10,
              right: 14,
              background: "none",
              border: "none",
              color: "#555",
              fontSize: 16,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
          <div style={{ fontWeight: 700, color: "#d4e840", marginBottom: 8, fontSize: 14 }}>
            App installieren
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: "#f0ede8" }}>iPhone / iPad:</strong><br />
            Safari → Teilen-Symbol → „Zum Home-Bildschirm"
          </div>
          <div>
            <strong style={{ color: "#f0ede8" }}>Android / Desktop:</strong><br />
            Chrome → Menü (⋮) → „App installieren"
          </div>
        </div>
      )}

      {/* Login Button */}
      <a
        href="/auth"
        style={{
          display: "block",
          background: "transparent",
          border: "1.5px solid rgba(212,232,64,0.4)",
          color: "#d4e840",
          borderRadius: 12,
          padding: "14px 32px",
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
          width: "100%",
          maxWidth: 320,
          textAlign: "center",
          textDecoration: "none",
          boxSizing: "border-box",
          transition: "background 0.2s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(212,232,64,0.09)"
          e.currentTarget.style.transform = "translateY(-2px)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
          e.currentTarget.style.transform = "translateY(0)"
        }}
      >
        Login
      </a>

      {/* Beta notice */}
      <p
        style={{
          color: "#555",
          fontSize: 13,
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Beta Testversion. Bei Fragen melden Sie sich bei{" "}
        <a
          href="mailto:info@e-werkwort.com"
          style={{ color: "#888", textDecoration: "underline" }}
        >
          info@e-werkwort.com
        </a>
      </p>
    </div>
  )
}