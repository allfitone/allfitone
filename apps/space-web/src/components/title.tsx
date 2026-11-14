import type { ElementType } from 'react'

export type Tone = 'solid' | 'ghost' | 'cyan'

const TONE_CLASS: Record<Tone, string> = { solid: '', ghost: ' tone-ghost', cyan: ' tone-cyan' }

/** A product name inside a line takes the cyan alone, without its line's punctuation. */
function withHighlight(line: string, highlight: string | undefined) {
  const at = highlight ? line.indexOf(highlight) : -1
  if (!highlight || at < 0) return line
  return (
    <>
      {line.slice(0, at)}
      <span className="tone-cyan">{highlight}</span>
      {line.slice(at + highlight.length)}
    </>
  )
}

/** A big display title whose lines rise one after the other out of a mask. */
export function Title({
  as: Tag = 'h2',
  id,
  lines,
  tones = [],
  highlight,
  size = 'lg',
  reveal = true,
}: {
  as?: ElementType
  id?: string
  lines: readonly string[]
  tones?: readonly Tone[]
  highlight?: string
  size?: 'xl' | 'lg'
  reveal?: boolean
}) {
  return (
    <Tag id={id} className={`display display--${size}`} data-reveal={reveal ? 'mask' : undefined}>
      {lines.map((line, index) => (
        <span
          key={line}
          className={`line${TONE_CLASS[tones[index] ?? 'solid']}`}
          style={{ '--l': index }}
        >
          <span>{withHighlight(line, highlight)}</span>
        </span>
      ))}
    </Tag>
  )
}
