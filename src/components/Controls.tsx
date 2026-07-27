import { forwardRef, useRef, useState } from 'react'
import { ImagePlus, Sparkles, Upload, X } from 'lucide-react'
import type { FrameAsset } from '../types/generation'
import { MAX_VIDEO_REFERENCE_IMAGES } from '../lib/video'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function readFrameAsset(file: File, minWidth?: number, minHeight?: number): Promise<FrameAsset> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('仅支持 JPG、PNG 或 WebP')
  if (file.size > MAX_FILE_SIZE) throw new Error('图片不能超过 10MB')
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
  if (width === sourceWidth && height === sourceHeight) {
    return { dataUrl: sourceDataUrl, name: file.name, mimeType: file.type, size: file.size, width, height }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片处理不可用')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, Math.round((width - sourceWidth) / 2), Math.round((height - sourceHeight) / 2))
  const dataUrl = canvas.toDataURL('image/png')
  return {
    dataUrl,
    name: `${file.name.replace(/\.[^.]+$/, '')}-padded.png`,
    mimeType: 'image/png',
    size: Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
    width,
    height,
  }
}

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
    try {
      onChange(await readFrameAsset(file, minWidth, minHeight))
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : '图片无法读取，请更换文件') }
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

interface ReferenceImageUploadProps {
  value: FrameAsset[]
  onChange: (value: FrameAsset[]) => void
  error?: string
}

export function ReferenceImageUpload({ value, onChange, error }: ReferenceImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState('')
  const [dragging, setDragging] = useState(false)
  const isFull = value.length >= MAX_VIDEO_REFERENCE_IMAGES
  const message = error || localError

  async function selectFiles(fileList?: FileList | File[]) {
    if (!fileList?.length || isFull) return
    setLocalError('')
    const remaining = MAX_VIDEO_REFERENCE_IMAGES - value.length
    const files = Array.from(fileList)
    if (files.length > remaining) setLocalError(`最多上传 ${MAX_VIDEO_REFERENCE_IMAGES} 张，已保留前 ${remaining} 张`)
    try {
      const assets = await Promise.all(files.slice(0, remaining).map((file) => readFrameAsset(file)))
      onChange([...value, ...assets])
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '图片无法读取，请更换文件')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`reference-upload ${dragging ? 'dragging' : ''} ${message ? 'invalid' : ''}`}>
      <div className="reference-upload-head">
        <div><strong>视频参考图</strong><small>按顺序对应提示词中的图1～图{value.length || 1}</small></div>
        <span>{value.length} / {MAX_VIDEO_REFERENCE_IMAGES}</span>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(event) => void selectFiles(event.target.files ?? undefined)} />
      <div className="reference-grid">
        {value.map((image, index) => (
          <div className="reference-card" key={`${image.name}-${image.size}-${index}`}>
            <img src={image.dataUrl} alt={`参考图 ${index + 1}`} />
            <span>图{index + 1}</span>
            <button type="button" aria-label={`移除参考图 ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
          </div>
        ))}
        {!isFull && <button type="button" className="reference-add" onClick={() => inputRef.current?.click()}
          onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFiles(event.dataTransfer.files) }}>
          <ImagePlus size={22} /><strong>{value.length ? '继续添加' : '选择参考图'}</strong><small>可多选 · 最多 {MAX_VIDEO_REFERENCE_IMAGES} 张</small>
        </button>}
      </div>
      {message && <small className="field-error" role="status">{message}</small>}
    </div>
  )
}

interface PromptBoxProps {
  value: string
  onChange: (value: string) => void
  onInspire: () => void
  maxLength: number
  error?: string
  threeD?: boolean
}

export const PromptBox = forwardRef<HTMLTextAreaElement, PromptBoxProps>(function PromptBox({ value, onChange, onInspire, maxLength, error, threeD }, ref) {
  return (
    <div className={`prompt-box ${error ? 'invalid' : ''}`}>
      <textarea ref={ref} id="generation-prompt" value={value} onChange={(event) => onChange(event.target.value)}
        placeholder={threeD ? '留空使用默认：--subdivisionlevel medium --fileformat glb' : '描述主体、场景、光线、镜头与情绪，让画面更接近你的想象…'} maxLength={maxLength}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'prompt-error' : 'prompt-count'} />
      <div className="prompt-toolbar">
        <span id="prompt-count">{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span>
        {!threeD && <button type="button" onClick={onInspire}><Sparkles size={16} /> 灵感扩写</button>}
      </div>
      {error && <small className="field-error" id="prompt-error">{error}</small>}
    </div>
  )
})
