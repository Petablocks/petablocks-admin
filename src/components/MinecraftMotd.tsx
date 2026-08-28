import React from 'react'

const MC_COLORS: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  'a': '#55FF55',
  'b': '#55FFFF',
  'c': '#FF5555',
  'd': '#FF55FF',
  'e': '#FFFF55',
  'f': '#FFFFFF',
}

interface SpanSegment {
  text: string
  color: string
  bold: boolean
  italic: boolean
  underlined: boolean
  strikethrough: boolean
}

function parseFormattedString(input: string): SpanSegment[][] {
  if (!input) return []

  // Split lines
  const lines = input.split(/\r?\n/)

  return lines.map((line) => {
    const segments: SpanSegment[] = []
    let currentColor = '#FFFFFF'
    let bold = false
    let italic = false
    let underlined = false
    let strikethrough = false

    let buffer = ''

    const flush = () => {
      if (buffer.length > 0) {
        segments.push({
          text: buffer,
          color: currentColor,
          bold,
          italic,
          underlined,
          strikethrough,
        })
        buffer = ''
      }
    }

    let i = 0
    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if ((char === '§' || char === '&') && nextChar) {
        const code = nextChar.toLowerCase()

        // Check for hex color: §x§r§r§g§g§b§b
        if (code === 'x' && i + 13 < line.length) {
          let isHex = true
          let hexVal = '#'
          for (let h = 0; h < 6; h++) {
            const hPrefix = line[i + 2 + h * 2]
            const hChar = line[i + 3 + h * 2]
            if (hPrefix !== '§' && hPrefix !== '&') {
              isHex = false
              break
            }
            hexVal += hChar
          }

          if (isHex && /^#[0-9a-fA-F]{6}$/.test(hexVal)) {
            flush()
            currentColor = hexVal
            bold = false
            italic = false
            underlined = false
            strikethrough = false
            i += 14
            continue
          }
        }

        if (MC_COLORS[code]) {
          flush()
          currentColor = MC_COLORS[code]
          bold = false
          italic = false
          underlined = false
          strikethrough = false
          i += 2
          continue
        }

        if (code === 'l') {
          flush()
          bold = true
          i += 2
          continue
        }

        if (code === 'o') {
          flush()
          italic = true
          i += 2
          continue
        }

        if (code === 'n') {
          flush()
          underlined = true
          i += 2
          continue
        }

        if (code === 'm') {
          flush()
          strikethrough = true
          i += 2
          continue
        }

        if (code === 'r') {
          flush()
          currentColor = '#FFFFFF'
          bold = false
          italic = false
          underlined = false
          strikethrough = false
          i += 2
          continue
        }

        if (code === 'k') {
          // obfuscated, treat as normal formatting
          flush()
          i += 2
          continue
        }
      }

      buffer += char
      i++
    }

    flush()
    return segments
  })
}

interface MinecraftMotdProps {
  motd?: string | any
  className?: string
}

export const MinecraftMotd: React.FC<MinecraftMotdProps> = ({ motd, className = '' }) => {
  if (!motd) {
    return (
      <div className={`font-mono text-xs text-muted-foreground/60 italic ${className}`}>
        A Minecraft Server
      </div>
    )
  }

  // If motd is a raw string
  let rawText = ''
  if (typeof motd === 'string') {
    rawText = motd
  } else if (typeof motd === 'object') {
    if (typeof motd.clean === 'string') {
      rawText = motd.raw || motd.clean
    } else if (typeof motd.text === 'string') {
      rawText = motd.text
      if (Array.isArray(motd.extra)) {
        rawText += motd.extra.map((e: any) => (typeof e === 'string' ? e : e.text || '')).join('')
      }
    } else {
      rawText = JSON.stringify(motd)
    }
  }

  const lines = parseFormattedString(rawText)

  return (
    <div
      className={`font-mono text-xs leading-relaxed select-text bg-[#0d0d12]/90 border border-border/70 rounded-lg p-2 sm:p-2.5 overflow-hidden shadow-inner ${className}`}
      style={{
        textShadow: '1px 1px 0px rgba(0, 0, 0, 0.9)',
      }}
    >
      {lines.map((line, lineIdx) => (
        <div key={lineIdx} className="min-h-[1.2em] break-words">
          {line.length === 0 ? (
            <span>&nbsp;</span>
          ) : (
            line.map((segment, segIdx) => (
              <span
                key={segIdx}
                style={{
                  color: segment.color,
                  fontWeight: segment.bold ? 700 : 400,
                  fontStyle: segment.italic ? 'italic' : 'normal',
                  textDecoration: [
                    segment.underlined ? 'underline' : '',
                    segment.strikethrough ? 'line-through' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined,
                }}
              >
                {segment.text}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

export default MinecraftMotd
