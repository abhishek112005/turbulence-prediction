import TurbulenceCanvas from './TurbulenceCanvas'

export default function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="hero-scene__aurora hero-scene__aurora--left" />
      <div className="hero-scene__aurora hero-scene__aurora--right" />
      <div className="hero-scene__stars" />
      <div className="hero-scene__grid" />

      <div className="hero-scene__stage">
        <div className="hero-scene__halo" />
        <div className="hero-scene__ring hero-scene__ring--outer" />
        <div className="hero-scene__ring hero-scene__ring--mid" />
        <div className="hero-scene__ring hero-scene__ring--inner" />

        <div className="hero-scene__panel hero-scene__panel--main">
          <TurbulenceCanvas />
        </div>

        <div className="hero-scene__panel hero-scene__panel--top">
          <span>Telemetry</span>
          <strong>LIVE INGEST</strong>
        </div>

        <div className="hero-scene__panel hero-scene__panel--left">
          <span>Prediction</span>
          <strong>ML CURRENT + FUTURE</strong>
        </div>

        <div className="hero-scene__panel hero-scene__panel--right">
          <span>Validation</span>
          <strong>NOAA CROSS-CHECK</strong>
        </div>

        <div className="hero-scene__panel hero-scene__panel--bottom">
          <span>Alert Surface</span>
          <strong>PILOT + COMMON DISPLAY</strong>
        </div>
      </div>
    </div>
  )
}
