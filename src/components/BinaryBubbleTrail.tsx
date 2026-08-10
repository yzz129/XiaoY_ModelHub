import { useEffect, useRef } from 'react'

const binaryTokens = ['01', '10', '0101', '1010', '0', '1']
const collisionSelector = [
  '.public-hero-visual',
  '.public-capability-card',
  '.public-model-marketplace',
  '.marketplace-head',
  '.marketplace-filters',
  '.catalog-card',
  '.auth-mascot-stage',
  '.auth-card',
  '.auth-capability-icons > span',
].join(',')

type Bubble = {
  element: HTMLSpanElement
  x: number
  y: number
  radius: number
  velocityX: number
  velocityY: number
  bornAt: number
  phase: number
  directBreakAt: number | null
}

type Debris = {
  element: HTMLElement
  x: number
  y: number
  previousY: number
  velocityX: number
  velocityY: number
  gravity: number
  rotation: number
  spin: number
  kind: 'code' | 'shard' | 'drop'
  settledAt: number | null
  settleLife: number
  fadingAt: number | null
  fadeLife: number
  restingOn: HTMLElement | null
  restingOffsetX: number
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function BinaryBubbleTrail() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const bubbles: Bubble[] = []
    const debris: Debris[] = []
    let animationFrame = 0
    let previousFrame = performance.now()
    let disposed = false

    function elementCardAt(x: number, y: number) {
      const element = document.elementFromPoint(x, y)
      return element?.closest<HTMLElement>(collisionSelector) ?? null
    }

    function cardTouchingBubble(bubble: Bubble) {
      const diagonal = bubble.radius * .72
      const samples = [
        [bubble.x, bubble.y],
        [bubble.x, bubble.y - bubble.radius],
        [bubble.x + bubble.radius, bubble.y],
        [bubble.x, bubble.y + bubble.radius],
        [bubble.x - bubble.radius, bubble.y],
        [bubble.x + diagonal, bubble.y - diagonal],
        [bubble.x - diagonal, bubble.y - diagonal],
      ]

      for (const [x, y] of samples) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
        const card = elementCardAt(x, y)
        if (card) return card
      }
      return null
    }

    function removeBubble(bubble: Bubble) {
      const index = bubbles.indexOf(bubble)
      if (index >= 0) bubbles.splice(index, 1)
      bubble.element.remove()
    }

    function removeDebris(piece: Debris) {
      const index = debris.indexOf(piece)
      if (index >= 0) debris.splice(index, 1)
      piece.element.remove()
    }

    function addImpact(x: number, y: number, card: HTMLElement | null) {
      const impact = document.createElement('span')
      impact.className = 'binary-bubble-impact'
      impact.style.left = `${x}px`
      impact.style.top = `${y}px`
      layer!.appendChild(impact)
      impact.addEventListener('animationend', () => impact.remove(), { once: true })

      if (card) {
        card.classList.remove('binary-card-touched')
        void card.offsetWidth
        card.classList.add('binary-card-touched')
        window.setTimeout(() => card.classList.remove('binary-card-touched'), 620)
      }
    }

    function addLandingSpark(x: number, y: number) {
      const spark = document.createElement('span')
      spark.className = 'binary-bubble-landing-spark'
      spark.style.left = `${x}px`
      spark.style.top = `${y}px`
      layer!.appendChild(spark)
      spark.addEventListener('animationend', () => spark.remove(), { once: true })
    }

    function createDebrisElement(kind: 'code' | 'shard' | 'drop', token: string, index: number) {
      const element = document.createElement(kind === 'code' ? 'b' : 'i')
      element.className = `binary-bubble-debris debris-${kind}`
      if (kind === 'code') element.textContent = token
      if (kind === 'shard') {
        element.style.setProperty('--shard-width', `${randomBetween(8, 16)}px`)
        element.style.setProperty('--shard-height', `${randomBetween(10, 22)}px`)
        element.style.setProperty('--shard-cut', `${randomBetween(28, 68)}%`)
      }
      if (kind === 'drop') {
        const dropSize = randomBetween(4, 8)
        element.style.setProperty('--drop-size', `${dropSize}px`)
        element.style.setProperty('--drop-height', `${dropSize * 1.35}px`)
      }
      element.style.setProperty('--piece-delay', `${index * 12}ms`)
      layer!.appendChild(element)
      return element
    }

    function shatterBubble(bubble: Bubble, card: HTMLElement | null) {
      const token = bubble.element.dataset.token ?? '01'
      addImpact(bubble.x, bubble.y, card)
      removeBubble(bubble)

      const pieceKinds: Array<'code' | 'shard' | 'drop'> = [
        'code', 'shard', 'shard', 'shard', 'shard', 'shard', 'shard', 'shard', 'drop', 'drop', 'drop',
      ]

      pieceKinds.forEach((kind, index) => {
        const angle = randomBetween(-Math.PI * .92, -Math.PI * .08)
        const speed = kind === 'code' ? randomBetween(80, 128) : randomBetween(64, 174)
        const element = createDebrisElement(kind, token, index)
        const piece: Debris = {
          element,
          x: bubble.x + randomBetween(-5, 5),
          y: bubble.y + randomBetween(-3, 5),
          previousY: bubble.y,
          velocityX: Math.cos(angle) * speed + bubble.velocityX * .35,
          velocityY: Math.sin(angle) * speed + randomBetween(-34, 18),
          gravity: kind === 'drop' ? randomBetween(510, 660) : randomBetween(410, 560),
          rotation: randomBetween(-30, 30),
          spin: randomBetween(-280, 280),
          kind,
          settledAt: null,
          settleLife: kind === 'code' ? randomBetween(11000, 14000) : kind === 'shard' ? randomBetween(4800, 6200) : randomBetween(3200, 4600),
          fadingAt: null,
          fadeLife: kind === 'code' ? 1800 : 720,
          restingOn: null,
          restingOffsetX: 0,
        }
        debris.push(piece)
      })

      while (debris.length > 100) removeDebris(debris[0])
    }

    function settleDebris(piece: Debris, card: HTMLElement, now: number) {
      const rect = card.getBoundingClientRect()
      piece.restingOn = card
      piece.restingOffsetX = piece.x - rect.left
      piece.y = rect.top
      piece.velocityX = 0
      piece.velocityY = 0
      piece.settledAt = now
      piece.element.classList.add('is-settled')
      const settleRotation = randomBetween(-16, 16)
      piece.element.style.setProperty('--settle-rotate', `${settleRotation}deg`)
      piece.element.style.setProperty('--settle-rebound', `${settleRotation * -.45}deg`)
      piece.element.style.setProperty('--piece-fade-duration', `${piece.fadeLife}ms`)
      addLandingSpark(piece.x, rect.top)

      card.classList.remove('binary-card-landed')
      void card.offsetWidth
      card.classList.add('binary-card-landed')
      window.setTimeout(() => card.classList.remove('binary-card-landed'), 520)
    }

    function updateBubble(bubble: Bubble, now: number, delta: number) {
      const age = now - bubble.bornAt
      const wobble = Math.sin(age * .004 + bubble.phase) * 12
      bubble.x += (bubble.velocityX + wobble) * delta
      bubble.y += bubble.velocityY * delta
      bubble.element.style.left = `${bubble.x}px`
      bubble.element.style.top = `${bubble.y}px`
      bubble.element.style.setProperty('--bubble-wobble', `${Math.sin(age * .003 + bubble.phase) * 5}deg`)

      const card = cardTouchingBubble(bubble)
      if (card) {
        shatterBubble(bubble, card)
        return
      }

      if (bubble.directBreakAt !== null && now >= bubble.directBreakAt) {
        shatterBubble(bubble, null)
        return
      }

      if (bubble.y < -bubble.radius * 1.5 || bubble.x < -90 || bubble.x > window.innerWidth + 90) {
        bubble.element.classList.add('is-evaporating')
        removeBubble(bubble)
      }
    }

    function updateDebris(piece: Debris, now: number, delta: number) {
      if (piece.restingOn && piece.settledAt !== null) {
        if (!piece.restingOn.isConnected) {
          removeDebris(piece)
          return
        }
        const rect = piece.restingOn.getBoundingClientRect()
        piece.x = rect.left + piece.restingOffsetX
        piece.y = rect.top
        piece.element.style.left = `${piece.x}px`
        piece.element.style.top = `${piece.y}px`

        if (piece.fadingAt !== null) {
          if (now - piece.fadingAt >= piece.fadeLife) removeDebris(piece)
          return
        }
        if (now - piece.settledAt >= piece.settleLife) {
          piece.fadingAt = now
          piece.element.classList.add('is-fading')
        }
        return
      }

      piece.previousY = piece.y
      piece.velocityY += piece.gravity * delta
      piece.x += piece.velocityX * delta
      piece.y += piece.velocityY * delta
      piece.rotation += piece.spin * delta
      piece.element.style.left = `${piece.x}px`
      piece.element.style.top = `${piece.y}px`
      piece.element.style.transform = `translate3d(-50%, -50%, 0) rotate(${piece.rotation}deg)`

      if (piece.velocityY > 0 && piece.x >= 0 && piece.x <= window.innerWidth && piece.y >= 0 && piece.y <= window.innerHeight) {
        const card = elementCardAt(piece.x, piece.y + 2)
        if (card) {
          const rect = card.getBoundingClientRect()
          if (piece.previousY <= rect.top + 2 && piece.y >= rect.top - 3) {
            settleDebris(piece, card, now)
            return
          }
        }
      }

      if (piece.y > window.innerHeight + 120 || piece.x < -120 || piece.x > window.innerWidth + 120) {
        removeDebris(piece)
      }
    }

    function tick(now: number) {
      if (disposed) return
      const frameDelta = Math.min((now - previousFrame) / 1000, .5)
      previousFrame = now

      const steps = Math.max(1, Math.ceil(frameDelta / .028))
      const delta = frameDelta / steps
      for (let step = 0; step < steps; step += 1) {
        for (const bubble of [...bubbles]) updateBubble(bubble, now, delta)
        for (const piece of [...debris]) updateDebris(piece, now, delta)
      }

      animationFrame = bubbles.length || debris.length ? requestAnimationFrame(tick) : 0
    }

    function ensureAnimation() {
      if (animationFrame) return
      previousFrame = performance.now()
      animationFrame = requestAnimationFrame(tick)
    }

    function spawnBubble(x: number, y: number, energy = 1, forceDirectBreak = false) {
      if (reducedMotion.matches) return
      while (bubbles.length >= 18) removeBubble(bubbles[0])

      const token = binaryTokens[Math.floor(Math.random() * binaryTokens.length)]
      const size = Math.round(randomBetween(40, 58) * Math.min(energy, 1.16))
      const element = document.createElement('span')
      element.className = 'binary-physics-bubble'
      element.dataset.tone = Math.random() > .78 ? 'ice' : 'violet'
      element.dataset.token = token
      element.style.left = `${x}px`
      element.style.top = `${y}px`
      element.style.setProperty('--bubble-size', `${size}px`)
      element.style.setProperty('--bubble-code-size', `${Math.max(9, Math.min(13, size * .23))}px`)
      element.innerHTML = `<span class="binary-orb-shadow"></span><span class="binary-orb-shell"><i class="binary-orb-refraction"></i><b class="binary-orb-code">${token}</b></span>`
      layer!.appendChild(element)

      const bornAt = performance.now()
      const directBreak = forceDirectBreak || Math.random() < .2
      if (directBreak) element.classList.add('will-break-directly')

      bubbles.push({
        element,
        x,
        y,
        radius: size / 2,
        velocityX: randomBetween(-7, 7),
        velocityY: randomBetween(-46, -29),
        bornAt,
        phase: randomBetween(0, Math.PI * 2),
        directBreakAt: directBreak ? bornAt + randomBetween(90, 240) : null,
      })
      ensureAnimation()
    }

    function handlePointerDown(event: PointerEvent) {
      spawnBubble(event.clientX, event.clientY)
    }

    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    return () => {
      disposed = true
      window.removeEventListener('pointerdown', handlePointerDown)
      if (animationFrame) cancelAnimationFrame(animationFrame)
      layer.replaceChildren()
    }
  }, [])

  return <div ref={layerRef} className="binary-bubble-layer" aria-hidden="true" />
}
