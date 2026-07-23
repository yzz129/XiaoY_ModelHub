import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
        'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        alt?: string
        loading?: 'auto' | 'lazy' | 'eager'
        'camera-controls'?: string
        'auto-rotate'?: string
        'interaction-prompt'?: 'auto' | 'none'
        'shadow-intensity'?: string
        exposure?: string
      }
    }
  }
}
