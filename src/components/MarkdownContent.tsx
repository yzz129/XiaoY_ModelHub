import { Fragment, type ReactNode } from 'react'

interface MarkdownContentProps {
  content: string
}

type TableAlignment = 'left' | 'center' | 'right' | undefined

function splitTableRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)

  const cells: string[] = []
  let cell = ''
  let inInlineCode = false

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]
    const nextCharacter = row[index + 1]

    if (character === '\\' && nextCharacter === '|') {
      cell += '|'
      index += 1
      continue
    }
    if (character === '`') {
      inInlineCode = !inInlineCode
      cell += character
      continue
    }
    if (character === '|' && !inInlineCode) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += character
  }

  cells.push(cell.trim())
  return cells
}

function parseTableDelimiter(line: string, columnCount: number): TableAlignment[] | undefined {
  const cells = splitTableRow(line)
  if (columnCount < 2 || cells.length !== columnCount) return undefined
  if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return undefined

  return cells.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return undefined
  })
}

function normalizeTableRow(cells: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? '')
}

function inlineMarkdown(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link && /^https?:\/\//.test(link[2])) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    return <Fragment key={index}>{part}</Fragment>
  })
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let codeLines: string[] | undefined
  let codeLanguage = ''

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      if (codeLines) {
        blocks.push(<pre key={`code-${index}`} data-language={codeLanguage}><code>{codeLines.join('\n')}</code></pre>)
        codeLines = undefined
        codeLanguage = ''
      } else {
        codeLines = []
        codeLanguage = fence[1].trim()
      }
      continue
    }
    if (codeLines) {
      codeLines.push(line)
      continue
    }
    if (!line.trim()) {
      blocks.push(<span className="markdown-gap" key={`gap-${index}`} />)
      continue
    }

    if (line.includes('|') && lines[index + 1]?.includes('|')) {
      const headers = splitTableRow(line)
      const alignments = parseTableDelimiter(lines[index + 1], headers.length)

      if (alignments) {
        const rows: string[][] = []
        let cursor = index + 2

        while (cursor < lines.length && lines[cursor].trim() && lines[cursor].includes('|')) {
          rows.push(normalizeTableRow(splitTableRow(lines[cursor]), headers.length))
          cursor += 1
        }

        blocks.push(
          <div className="markdown-table-wrap" key={`table-${index}`}>
            <table>
              <thead>
                <tr>
                  {headers.map((header, columnIndex) => (
                    <th className={alignments[columnIndex] ? `align-${alignments[columnIndex]}` : undefined} key={columnIndex} scope="col">
                      {inlineMarkdown(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              {rows.length > 0 ? (
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, columnIndex) => (
                        <td className={alignments[columnIndex] ? `align-${alignments[columnIndex]}` : undefined} key={columnIndex}>
                          {inlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>,
        )
        index = cursor - 1
        continue
      }
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={index}>{inlineMarkdown(heading[2])}</Tag>)
      continue
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unordered) {
      blocks.push(<div className="markdown-list-item" key={index}><i /> <span>{inlineMarkdown(unordered[1])}</span></div>)
      continue
    }
    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/)
    if (ordered) {
      blocks.push(<div className="markdown-list-item ordered" key={index}><b>{ordered[1]}.</b><span>{inlineMarkdown(ordered[2])}</span></div>)
      continue
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={index}>{inlineMarkdown(line.slice(2))}</blockquote>)
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={index} />)
      continue
    }
    blocks.push(<p key={index}>{inlineMarkdown(line)}</p>)
  }

  if (codeLines) blocks.push(<pre key="code-final" data-language={codeLanguage}><code>{codeLines.join('\n')}</code></pre>)
  return <div className="markdown-content">{blocks}</div>
}
