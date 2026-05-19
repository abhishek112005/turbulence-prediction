import { useEffect, useRef } from 'react'

export default function TurbulenceCanvas() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    // Pre-generate particle seeds for deterministic placement
    const NUM = 110
    const particles = Array.from({ length: NUM }, (_, i) => ({
      x0: ((i * 137.508) % 1),
      y0: ((i * 73.919) % 1),
      phase: i * 0.29,
    }))

    function draw(ts) {
      const t = ts / 1000
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight

      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W
        canvas.height = H
      }

      // Background with deeper atmosphere
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#02050d')
      bg.addColorStop(0.45, '#07111f')
      bg.addColorStop(1, '#04101b')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Depth glow
      const glow = ctx.createRadialGradient(W * 0.52, H * 0.35, 0, W * 0.52, H * 0.35, W * 0.46)
      glow.addColorStop(0, 'rgba(72, 198, 255, 0.18)')
      glow.addColorStop(0.4, 'rgba(113, 92, 255, 0.08)')
      glow.addColorStop(1, 'rgba(4, 16, 27, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, W, H)

      // Horizon sweep
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(0, H * 0.48, W, 1)

      // Atmospheric zones  (top = severe/red → bottom = calm/cyan)
      const zoneH = H / 4
      const zoneDefs = [
        { color: '239,68,68',   label: 'Severe'   },
        { color: '249,115,22',  label: 'Moderate' },
        { color: '250,204,21',  label: 'Light'    },
        { color: '34,211,238',  label: 'Calm'     },
      ]
      zoneDefs.forEach(({ color }, i) => {
        const g = ctx.createLinearGradient(0, i * zoneH, W, i * zoneH + zoneH)
        g.addColorStop(0, `rgba(${color},0.13)`)
        g.addColorStop(1, `rgba(${color},0.04)`)
        ctx.fillStyle = g
        ctx.fillRect(0, i * zoneH, W, zoneH)
      })

      // Dashed separator lines
      ctx.setLineDash([4, 10])
      ;['rgba(239,68,68,0.22)', 'rgba(249,115,22,0.18)', 'rgba(250,204,21,0.15)'].forEach((c, i) => {
        const y = (i + 1) * zoneH
        ctx.strokeStyle = c
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      })
      ctx.setLineDash([])

      // Zone labels (right edge)
      ctx.textAlign = 'right'
      ctx.font = `bold ${Math.max(10, W * 0.028)}px system-ui, sans-serif`
      zoneDefs.forEach(({ color, label }, i) => {
        ctx.fillStyle = `rgba(${color}, 0.75)`
        ctx.fillText(label, W - 10, (i + 0.5) * zoneH + 5)
      })

      // Micro stars / distant sensor points
      for (let i = 0; i < 36; i += 1) {
        const sx = ((i * 97.73) % 1) * W
        const sy = (((i + 7) * 53.17) % 1) * H * 0.55
        const twinkle = 0.2 + ((Math.sin(t * 1.3 + i) + 1) * 0.5) * 0.45
        ctx.fillStyle = `rgba(210,235,255,${twinkle})`
        ctx.fillRect(sx, sy, 1.6, 1.6)
      }

      // Particles
      particles.forEach(p => {
        const bx = p.x0 * W
        const by = p.y0 * H
        const x  = bx + Math.sin(t * 0.4 + p.phase + by * 0.025) * W * 0.06
        const y  = by + Math.cos(t * 0.35 + p.phase + bx * 0.018) * H * 0.06

        const frac = p.y0
        let r, g, b
        if      (frac < 0.25) { r = 239; g = 68;  b = 68  }
        else if (frac < 0.5)  { r = 249; g = 115; b = 22  }
        else if (frac < 0.75) { r = 250; g = 204; b = 21  }
        else                  { r = 34;  g = 211; b = 238 }

        const alpha = 0.45 + Math.sin(t * 0.9 + p.phase) * 0.2
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.arc(((x % W) + W) % W, ((y % H) + H) % H, 2.4, 0, Math.PI * 2)
        ctx.fill()
      })

      // Scan arcs
      ctx.save()
      ctx.translate(W * 0.5, H * 0.52)
      ctx.rotate(-0.18)
      for (let r = 1; r <= 3; r += 1) {
        ctx.strokeStyle = `rgba(76, 210, 255, ${0.08 + r * 0.05})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(0, 0, 70 * r, Math.PI * 0.12, Math.PI * 0.92)
        ctx.stroke()
      }
      ctx.restore()

      // Aircraft silhouette
      const scale = Math.max(0.55, Math.min(1, W / 380))
      const ax = W * 0.5  + Math.sin(t * 0.42) * W * 0.055
      const ay = H * 0.42 + Math.sin(t * 1.82) * H * 0.065 + Math.sin(t * 3.5) * H * 0.02
      const roll = Math.sin(t * 2.1) * 0.09

      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(roll)
      ctx.scale(scale, scale)

      // Glow
      ctx.shadowColor = 'rgba(180, 220, 255, 0.55)'
      ctx.shadowBlur = 14

      // Fuselage
      ctx.fillStyle = '#cce0f8'
      ctx.beginPath()
      ctx.moveTo(58, 0)
      ctx.bezierCurveTo(58, -9, 28, -11, 0, -10)
      ctx.lineTo(-46, -8)
      ctx.bezierCurveTo(-54, -5, -54, 5, -46, 8)
      ctx.lineTo(0, 10)
      ctx.bezierCurveTo(28, 11, 58, 9, 58, 0)
      ctx.closePath()
      ctx.fill()

      // Main wing (downward)
      ctx.fillStyle = '#9cbce0'
      ctx.beginPath()
      ctx.moveTo(12, 8)
      ctx.lineTo(-8, 36)
      ctx.lineTo(-22, 36)
      ctx.lineTo(-16, 8)
      ctx.closePath()
      ctx.fill()

      // Winglet
      ctx.beginPath()
      ctx.moveTo(-8, 36)
      ctx.lineTo(-5, 47)
      ctx.lineTo(-14, 47)
      ctx.lineTo(-16, 36)
      ctx.closePath()
      ctx.fill()

      // Tail fin (top)
      ctx.beginPath()
      ctx.moveTo(-40, -8)
      ctx.lineTo(-48, -25)
      ctx.lineTo(-43, -25)
      ctx.lineTo(-34, -8)
      ctx.closePath()
      ctx.fill()

      // Horizontal stabilizer (lower rear)
      ctx.beginPath()
      ctx.moveTo(-36, 5)
      ctx.lineTo(-42, 18)
      ctx.lineTo(-49, 18)
      ctx.lineTo(-46, 5)
      ctx.closePath()
      ctx.fill()

      // Engine pod
      ctx.fillStyle = '#88a8c8'
      ctx.beginPath()
      ctx.ellipse(-4, 24, 5, 10, 0, 0, Math.PI * 2)
      ctx.fill()

      // Windows
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(140, 210, 255, 0.75)'
      for (let w = 0; w < 6; w++) {
        ctx.beginPath()
        ctx.ellipse(-4 + w * 10, -3, 3.5, 4.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()

      // Foreground glass reflection
      const reflection = ctx.createLinearGradient(0, 0, W, H)
      reflection.addColorStop(0, 'rgba(255,255,255,0.08)')
      reflection.addColorStop(0.18, 'rgba(255,255,255,0.01)')
      reflection.addColorStop(0.52, 'rgba(255,255,255,0)')
      reflection.addColorStop(0.74, 'rgba(255,255,255,0.03)')
      reflection.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = reflection
      ctx.fillRect(0, 0, W, H)

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
