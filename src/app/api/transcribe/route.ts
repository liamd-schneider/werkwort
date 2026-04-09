import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('file') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'Keine Audiodatei' }, { status: 400 })
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'de',
    })

    return NextResponse.json({ text: transcription.text })

  } catch (error) {
    console.error('Transcription Fehler:', error)
    return NextResponse.json({ error: 'Transkription fehlgeschlagen' }, { status: 500 })
  }
}