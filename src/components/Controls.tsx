import { forwardRef, useRef, useState } from 'react'
import { ImagePlus, Sparkles, Upload, X } from 'lucide-react'
import type { FrameAsset } from '../types/generation'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface FrameUploadProps {
  label: string
  hint: string
  value?: FrameAsset
  onChange: (value?: FrameAsset) => void
  disabled?: boolean
  error?: string
  minWidth?: number
  minHeight?: number
}

export function FrameUpload({ label, hint, value, onChange, disabled, error, minWidth, minHeight }: FrameUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState('')
  const [dragging, setDragging] = useState(false)
  const message = error || localError

  async function selectFile(file?: File) {
    if (!file) return
    setLocalError('')
    if (!ALLOWED_TYPES.includes(file.type)) { setLocalError('仅支持 JPG、PNG 或 WebP'); return }
    if (file.size > MAX_FILE_SIZE) { setLocalError('图片不能超过 10MB'); return }
    try {
      const sourceDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(file)
      })
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image()
        image.onerror = reject
        image.onload = () => resolve(image)
        image.src = sourceDataUrl
      })
      const sourceWidth = image.naturalWidth
      const sourceHeight = image.naturalHeight
      const width = Math.max(sourceWidth, minWidth ?? sourceWidth)
      const height = Math.max(sourceHeight, minHeight ?? sourceHeight)
      let dataUrl = sourceDataUrl
      let name = file.name
      let mimeType = file.type
      let size = file.size
      if (width !== sourceWidth || height !== sourceHeight) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, Math.round((width - sourceWidth) / 2), Math.round((height - sourceHeight) / 2))
        dataUrl = canvas.toDataURL('image/png')
        name = `${file.name.replace(/\.[^.]+$/, '')}-padded.png`
        mimeType = 'image/png'
        size = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
      }
      onChange({ dataUrl, name, mimeType, size, width, height })
    } catch { setLocalError('图片无法读取，请更换文件') }
    finally { if (inputRef.current) inputRef.current.value = '' }
  }

  const hintId = `${label.replaceAll(' ', '-')}-hint`
  return (
    <div className={`frame-upload ${value ? 'has-image' : ''} ${dragging ? 'dragging' : ''} ${message ? 'invalid' : ''}`}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void selectFile(event.target.files?.[0])} />
      <button type="button" className="frame-select" disabled={disabled} aria-describedby={hintId} onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0]) }}>
        {value ? <img src={value.dataUrl} alt={`${label}预览`} /> : <span className="upload-icon"><Upload size={20} /></span>}
        <span className="frame-copy"><strong>{value?.name || label}</strong><small id={hintId}>{value ? `${value.width} × ${value.height}` : hint}</small></span>
        {!value && <ImagePlus size={18} />}
      </button>
      {value && <button type="button" className="frame-remove" aria-label={`移除${label}`} onClick={() => onChange(undefined)}><X size={16} /></button>}
      {message && <small className="field-error" role="status">{message}</small>}
    </div>
  )
}

interface PromptBoxProps {
  value: string
  onChange: (value: string) => void
  onInspire: () => void
  error?: string
  threeD?: boolean
}

export const PromptBox = forwardRef<HTMLTextAreaElement, PromptBoxProps>(function PromptBox({ value, onChange, onInspire, error, threeD }, ref) {
  return (
    <div className={`prompt-box ${error ? 'invalid' : ''}`}>
      <textarea ref={ref} id="generation-prompt" value={value} onChange={(event) => onChange(event.target.value)}
        placeholder={threeD ? '留空使用默认：--subdivisionlevel medium --fileformat glb' : '描述主体、场景、光线、镜头与情绪，让画面更接近你的想象…'} maxLength={1200}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'prompt-error' : 'prompt-count'} />
      <div className="prompt-toolbar">
        <span id="prompt-count">{value.length} / 1200</span>
        {!threeD && <button type="button" onClick={onInspire}><Sparkles size={16} /> 灵感扩写</button>}
      </div>
      {error && <small className="field-error" id="prompt-error">{error}</small>}
    </div>
  )
})
