import { Fragment, type ReactNode } from 'react'

interface MarkdownContentProps {
  content: string
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

  lines.forEach((line, index) => {
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
      return
    }
    if (codeLines) {
      codeLines.push(line)
      return
    }
    if (!line.trim()) {
      blocks.push(<span className="markdown-gap" key={`gap-${index}`} />)
      return
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={index}>{inlineMarkdown(heading[2])}</Tag>)
      return
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unordered) {
      blocks.push(<div className="markdown-list-item" key={index}><i /> <span>{inlineMarkdown(unordered[1])}</span></div>)
      return
    }
    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/)
    if (ordered) {
      blocks.push(<div className="markdown-list-item ordered" key={index}><b>{ordered[1]}.</b><span>{inlineMarkdown(ordered[2])}</span></div>)
      return
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={index}>{inlineMarkdown(line.slice(2))}</blockquote>)
      return
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={index} />)
      return
    }
    blocks.push(<p key={index}>{inlineMarkdown(line)}</p>)
  })

  if (codeLines) blocks.push(<pre key="code-final" data-language={codeLanguage}><code>{codeLines.join('\n')}</code></pre>)
  return <div className="markdown-content">{blocks}</div>
}
