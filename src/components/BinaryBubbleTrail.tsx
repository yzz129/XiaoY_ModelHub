import { useEffect, useRef } from 'react'

const binaryTokens = ['01', '10', '0101', '1010', '0', '1']

export function BinaryBubbleTrail() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let lastEmit = 0
    let lastX = 0
    let lastY = 0

    function spawnBubble(x: number, y: number, energy = 1, forceInstant = false) {
      if (reducedMotion.matches || !layer) return
      while (layer.childElementCount >= 22) layer.firstElementChild?.remove()

      const instant = forceInstant || Math.random() < .28
      const token = binaryTokens[Math.floor(Math.random() * binaryTokens.length)]
      const size = Math.round((34 + Math.random() * 18) * Math.min(energy, 1.18))
      const rise = 72 + Math.random() * 72
      const drift = -34 + Math.random() * 68
      const particle = document.createElement('span')
      particle.className = `binary-bubble-particle ${instant ? 'is-instant' : 'is-delayed'}`
      particle.dataset.tone = Math.random() > .76 ? 'ice' : 'violet'
      particle.style.left = `${x}px`
      particle.style.top = `${y}px`
      particle.style.setProperty('--bubble-size', `${size}px`)
      particle.style.setProperty('--bubble-code-size', `${Math.max(9, Math.min(13, size * 0.25))}px`)
      particle.style.setProperty('--bubble-rise', `${rise}px`)
      particle.style.setProperty('--bubble-rise-start', `${rise * .1}px`)
      particle.style.setProperty('--bubble-drift', `${drift}px`)
      particle.style.setProperty('--bubble-drift-start', `${drift * .08}px`)
      particle.style.setProperty('--bubble-drift-instant', `${drift * .25}px`)
      particle.style.setProperty('--bubble-tilt', `${-12 + Math.random() * 24}deg`)
      particle.style.setProperty('--bubble-life', `${instant ? 980 + Math.random() * 180 : 1700 + Math.random() * 420}ms`)

      const shell = document.createElement('span')
      shell.className = 'binary-bubble-shell'
      const code = document.createElement('b')
      code.className = 'binary-bubble-code'
      code.textContent = token
      shell.appendChild(code)
      particle.appendChild(shell)

      const fallingCode = document.createElement('b')
      fallingCode.className = 'binary-bubble-falling-code'
      fallingCode.textContent = token
      fallingCode.style.setProperty('--fragment-x', `${-18 + Math.random() * 36}px`)
      fallingCode.style.setProperty('--fragment-fall', `${82 + Math.random() * 74}px`)
      fallingCode.style.setProperty('--fragment-rotate', `${-45 + Math.random() * 90}deg`)
      particle.appendChild(fallingCode)

      for (let index = 0; index < 6; index += 1) {
        const fragment = document.createElement('i')
        fragment.className = 'binary-bubble-fragment'
        fragment.style.setProperty('--fragment-x', `${-55 + Math.random() * 110}px`)
        fragment.style.setProperty('--fragment-fall', `${62 + Math.random() * 115}px`)
        fragment.style.setProperty('--fragment-rotate', `${-150 + Math.random() * 300}deg`)
        fragment.style.setProperty('--fragment-delay', `${index * 16}ms`)
        fragment.style.setProperty('--fragment-scale', `${.48 + Math.random() * .62}`)
        particle.appendChild(fragment)
      }

      particle.addEventListener('animationend', (event) => {
        if (event.target === particle) particle.remove()
      })
      layer.appendChild(particle)
    }

    function handlePointerMove(event: PointerEvent) {
      const now = event.timeStamp
      const minInterval = event.pointerType === 'touch' ? 140 : 105
      const minDistance = event.pointerType === 'touch' ? 34 : 28
      if (now - lastEmit < minInterval || Math.hypot(event.clientX - lastX, event.clientY - lastY) < minDistance) return

      lastEmit = now
      lastX = event.clientX
      lastY = event.clientY
      spawnBubble(event.clientX, event.clientY, event.pointerType === 'touch' ? .86 : .78)
    }

    function handlePointerDown(event: PointerEvent) {
      for (let index = 0; index < 3; index += 1) {
        spawnBubble(
          event.clientX + (Math.random() - .5) * 24,
          event.clientY + (Math.random() - .5) * 18,
          1 + index * .08,
          index === 0,
        )
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      layer.replaceChildren()
    }
  }, [])

  return <div ref={layerRef} className="binary-bubble-layer" aria-hidden="true" />
}
