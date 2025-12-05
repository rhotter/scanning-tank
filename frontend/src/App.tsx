import { useEffect, useState, useCallback, useRef } from 'react'

interface Position {
  x: number
  y: number
  z: number
}

interface Port {
  device: string
  description: string
}

function App() {
  const [ports, setPorts] = useState<Port[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [printerConnected, setPrinterConnected] = useState(false)
  const [ad3Connected, setAd3Connected] = useState(false)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0, z: 180 })
  const [pressure, setPressure] = useState<number | null>(null)
  const [stepSize, setStepSize] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 5000)
  }

  const refreshPorts = async () => {
    try {
      const res = await fetch('/api/ports')
      const data = await res.json()
      setPorts(data)
    } catch {
      showError('Failed to list ports')
    }
  }

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'position') {
        setPosition(data.position)
      } else if (data.type === 'pressure') {
        setPressure(data.pressure)
      } else if (data.type === 'error') {
        showError(data.message)
      }
    }

    ws.onclose = () => {
      setTimeout(connectWebSocket, 1000)
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    refreshPorts()
    connectWebSocket()
    return () => wsRef.current?.close()
  }, [connectWebSocket])

  const togglePrinter = async () => {
    if (printerConnected) {
      await fetch('/api/disconnect/printer', { method: 'POST' })
      setPrinterConnected(false)
    } else {
      if (!selectedPort) {
        showError('Please select a port')
        return
      }
      const res = await fetch(`/api/connect/printer?port=${encodeURIComponent(selectedPort)}`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'connected') {
        setPrinterConnected(true)
        if (data.position) {
          setPosition(data.position)
        }
      } else {
        showError(data.message)
      }
    }
  }

  const toggleAD3 = async () => {
    if (ad3Connected) {
      await fetch('/api/disconnect/ad3', { method: 'POST' })
      setAd3Connected(false)
    } else {
      const res = await fetch('/api/connect/ad3', { method: 'POST' })
      const data = await res.json()
      if (data.status === 'connected') {
        setAd3Connected(true)
      } else {
        showError(data.message)
      }
    }
  }

  const move = useCallback((direction: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'move', direction, step: stepSize }))
    }
  }, [stepSize])

  const home = async () => {
    const res = await fetch('/api/home', { method: 'POST' })
    const data = await res.json()
    if (data.status === 'ok') {
      setPosition(data.position)
    } else {
      showError(data.message)
    }
  }

  const readPressure = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'read_pressure' }))
    }
  }

  useEffect(() => {
    const keyMap: Record<string, string> = {
      w: 'forward', W: 'forward',
      s: 'backward', S: 'backward',
      a: 'left', A: 'left',
      d: 'right', D: 'right',
      q: 'down', Q: 'down',
      e: 'up', E: 'up',
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'h' || e.key === 'H') {
        home()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        readPressure()
        return
      }
      const direction = keyMap[e.key]
      if (direction) {
        e.preventDefault()
        move(direction)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [move])

  return (
    <div className="min-h-screen bg-black text-white antialiased">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-b from-black via-black to-neutral-950" />

      <div className="relative max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-2xl font-semibold tracking-tight">Hydrophone Controller</h1>
          <p className="text-neutral-500 text-sm mt-1">Control your scanning tank</p>
        </div>

        {/* Connections */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">Connections</h2>

          <div className="space-y-3">
            {/* Printer */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${printerConnected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-sm font-medium">Printer</span>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="bg-transparent text-sm text-neutral-400 border border-neutral-800 rounded-md px-3 py-1.5 focus:outline-none focus:border-neutral-600"
                >
                  <option value="" className="bg-neutral-900">Select port...</option>
                  {ports.map((p) => (
                    <option key={p.device} value={p.device} className="bg-neutral-900">{p.device}</option>
                  ))}
                </select>
                <button
                  onClick={refreshPorts}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={togglePrinter}
                  className={`text-sm px-4 py-1.5 rounded-md font-medium transition-all ${
                    printerConnected
                      ? 'bg-neutral-800 text-white hover:bg-neutral-700'
                      : 'bg-white text-black hover:bg-neutral-200'
                  }`}
                >
                  {printerConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>

            {/* AD3 */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${ad3Connected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-sm font-medium">AD3</span>
                <span className="text-xs text-neutral-600">WaveForms SDK</span>
              </div>
              <button
                onClick={toggleAD3}
                className={`text-sm px-4 py-1.5 rounded-md font-medium transition-all ${
                  ad3Connected
                    ? 'bg-neutral-800 text-white hover:bg-neutral-700'
                    : 'bg-white text-black hover:bg-neutral-200'
                }`}
              >
                {ad3Connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </section>

        {/* Pressure */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">Pressure</h2>

          <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-6xl font-light tabular-nums tracking-tighter">
                {pressure !== null ? pressure.toFixed(1) : '--'}
              </span>
              <span className="text-neutral-500 text-lg">kPa</span>
            </div>
            <div className="flex justify-center mt-6">
              <button
                onClick={readPressure}
                className="text-sm px-6 py-2 rounded-md bg-white text-black font-medium hover:bg-neutral-200 transition-colors"
              >
                Read Pressure
              </button>
            </div>
          </div>
        </section>

        {/* Position */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">Position</h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 text-center">
              <div className="text-xs text-neutral-500 mb-1">X</div>
              <div className="text-2xl font-light tabular-nums">{position.x.toFixed(2)}</div>
              <div className="text-xs text-neutral-600">mm</div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 text-center">
              <div className="text-xs text-neutral-500 mb-1">Y</div>
              <div className="text-2xl font-light tabular-nums">{position.y.toFixed(2)}</div>
              <div className="text-xs text-neutral-600">mm</div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 text-center">
              <div className="text-xs text-neutral-500 mb-1">Z</div>
              <div className="text-2xl font-light tabular-nums">{position.z.toFixed(2)}</div>
              <div className="text-xs text-neutral-600">mm</div>
            </div>
          </div>
        </section>

        {/* Controls */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4">Controls</h2>

          <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50">
            <div className="flex flex-col items-center gap-2">
              {/* Y- */}
              <button
                onClick={() => move('forward')}
                className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
              >
                Y-
              </button>

              {/* X- Home X+ */}
              <div className="flex gap-2">
                <button
                  onClick={() => move('left')}
                  className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
                >
                  X-
                </button>
                <button
                  onClick={home}
                  className="w-12 h-12 rounded-lg border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 transition-all flex items-center justify-center text-xs font-medium"
                >
                  HOME
                </button>
                <button
                  onClick={() => move('right')}
                  className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
                >
                  X+
                </button>
              </div>

              {/* Y+ */}
              <button
                onClick={() => move('backward')}
                className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
              >
                Y+
              </button>

              {/* Z controls */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-800">
                <button
                  onClick={() => move('up')}
                  className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
                >
                  Z+
                </button>
                <button
                  onClick={() => move('down')}
                  className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-600 transition-all flex items-center justify-center text-sm font-medium"
                >
                  Z-
                </button>
              </div>
            </div>

            {/* Step size */}
            <div className="flex items-center justify-center gap-3 mt-6 pt-6 border-t border-neutral-800">
              <span className="text-xs text-neutral-500">Step</span>
              <input
                type="number"
                value={stepSize}
                onChange={(e) => setStepSize(parseFloat(e.target.value) || 1)}
                min="0.1"
                max="50"
                step="0.1"
                className="w-20 bg-neutral-800 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-center focus:outline-none focus:border-neutral-600"
              />
              <span className="text-xs text-neutral-500">mm</span>
            </div>

            {/* Keyboard hints */}
            <div className="text-center text-neutral-600 text-xs mt-6">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono">W</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono ml-1">A</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono ml-1">S</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono ml-1">D</kbd>
              <span className="mx-2">X/Y</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono">Q</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono ml-1">E</kbd>
              <span className="mx-2">Z</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono">H</kbd>
              <span className="mx-2">Home</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono">Space</kbd>
              <span className="ml-2">Pressure</span>
            </div>
          </div>
        </section>

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
