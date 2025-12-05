import { useEffect, useState, useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'

function Water({ width, depth, height }: { width: number; depth: number; height: number }) {
  const waterLevel = 0.8 // 80% full
  const waterHeight = height * waterLevel
  const waterY = -height / 2 + waterHeight / 2
  const surfaceY = waterY + waterHeight / 2

  return (
    <group>
      {/* Water volume */}
      <mesh position={[0, waterY, 0]}>
        <boxGeometry args={[width, waterHeight, depth]} />
        <meshBasicMaterial color="#0066aa" opacity={0.35} transparent />
      </mesh>
      {/* Water surface */}
      <mesh position={[0, surfaceY + 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#4da6cc" opacity={0.5} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Scanner bounds (x=0,y=0 centered, z up)
const BOUNDS = {
  x: { min: -35, max: 35 },
  y: { min: -40, max: 40 },
  z: { min: 150, max: 220 },
}

function PositionViewer({ position }: { position: { x: number; y: number; z: number } }) {
  // Normalize position to center the box at origin for better viewing
  const centerX = (BOUNDS.x.min + BOUNDS.x.max) / 2
  const centerY = (BOUNDS.y.min + BOUNDS.y.max) / 2
  const centerZ = (BOUNDS.z.min + BOUNDS.z.max) / 2

  const sizeX = BOUNDS.x.max - BOUNDS.x.min
  const sizeY = BOUNDS.y.max - BOUNDS.y.min
  const sizeZ = BOUNDS.z.max - BOUNDS.z.min

  // Normalized position relative to box center
  // Swap Y and Z so Z points up in Three.js (which uses Y-up by default)
  const normPos = {
    x: position.x - centerX,
    y: position.z - centerZ,  // Z becomes Y (up)
    z: -(position.y - centerY),  // Y becomes -Z (depth)
  }

  // Box corners for wireframe (swapped so Z is up)
  const corners = [
    [-sizeX/2, -sizeZ/2, -sizeY/2],
    [sizeX/2, -sizeZ/2, -sizeY/2],
    [sizeX/2, -sizeZ/2, sizeY/2],
    [-sizeX/2, -sizeZ/2, sizeY/2],
    [-sizeX/2, sizeZ/2, -sizeY/2],
    [sizeX/2, sizeZ/2, -sizeY/2],
    [sizeX/2, sizeZ/2, sizeY/2],
    [-sizeX/2, sizeZ/2, sizeY/2],
  ] as [number, number, number][]

  const edges: [[number, number, number], [number, number, number]][] = [
    // Bottom face
    [corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]],
    // Top face
    [corners[4], corners[5]], [corners[5], corners[6]], [corners[6], corners[7]], [corners[7], corners[4]],
    // Vertical edges
    [corners[0], corners[4]], [corners[1], corners[5]], [corners[2], corners[6]], [corners[3], corners[7]],
  ]

  return (
    <>
      {/* Animated water surface */}
      <Water width={sizeX} depth={sizeY} height={sizeZ} />

      {/* Wireframe box */}
      {edges.map((edge, i) => (
        <Line key={i} points={edge} color="#404040" lineWidth={1} />
      ))}

      {/* Needle hydrophone */}
      <group position={[normPos.x, normPos.y, normPos.z]}>
        {/* Gold tip (cylinder) - top at measurement position */}
        <mesh position={[0, -3, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 6, 16]} />
          <meshBasicMaterial color="#B8860B" />
        </mesh>
        {/* Needle body (gray cylinder) */}
        <mesh position={[0, -11, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 10, 16]} />
          <meshBasicMaterial color="#808080" />
        </mesh>
      </group>
    </>
  )
}

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
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
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
      w: 'backward', W: 'backward',
      s: 'forward', S: 'forward',
      a: 'left', A: 'left',
      d: 'right', D: 'right',
      q: 'down', Q: 'down',
      e: 'up', E: 'up',
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      const key = e.key.toLowerCase()
      setPressedKeys(prev => new Set(prev).add(key))

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

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      setPressedKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [move])

  return (
    <div className="h-screen w-screen bg-black text-white antialiased overflow-hidden">
      {/* Full-screen 3D Position Viewer */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 60, 120], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <PositionViewer position={position} />
          <OrbitControls enablePan={false} />
        </Canvas>
      </div>

      {/* Top-left: Title & Instructions */}
      <div className="absolute top-4 left-6">
        <h1 className="text-sm font-medium text-white tracking-tight">Hydrophone Scanning Tank</h1>
        <p className="text-xs text-neutral-500 mt-1">Use WASD to move, E/Q for height, Space to read pressure</p>
      </div>

      {/* Top-right: Settings & Pressure */}
      <div className="absolute top-4 right-4 flex items-start gap-2">
        {/* Pressure display */}
        <div
          onClick={readPressure}
          className="flex items-baseline gap-1 px-3 py-2 rounded-lg bg-black/70 backdrop-blur border border-neutral-800 cursor-pointer hover:bg-black/80 transition-colors"
        >
          <span className="text-2xl font-light tabular-nums">
            {pressure !== null ? pressure.toFixed(1) : '--'}
          </span>
          <span className="text-xs text-neutral-500">kPa</span>
        </div>

        {/* Settings */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-2 rounded-lg bg-black/70 backdrop-blur border border-neutral-800 hover:bg-black/80 transition-colors"
          >
            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Settings dropdown */}
          {settingsOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setSettingsOpen(false)} />
              <div className="absolute top-full right-0 mt-2 p-3 rounded-lg bg-black/90 backdrop-blur border border-neutral-800 min-w-[200px] space-y-3">
              {/* Printer */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${printerConnected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-xs text-neutral-300">Printer</span>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="flex-1 bg-neutral-800 text-xs text-neutral-400 border border-neutral-700 rounded px-2 py-1 focus:outline-none"
                >
                  <option value="">Port...</option>
                  {ports.map((p) => (
                    <option key={p.device} value={p.device}>{p.device}</option>
                  ))}
                </select>
                <button
                  onClick={refreshPorts}
                  className="p-1 text-neutral-500 hover:text-white transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={togglePrinter}
                  className={`text-xs px-2 py-1 rounded font-medium transition-all ${
                    printerConnected
                      ? 'bg-neutral-700 text-white hover:bg-neutral-600'
                      : 'bg-white text-black hover:bg-neutral-200'
                  }`}
                >
                  {printerConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>

              <div className="border-t border-neutral-800" />

              {/* AD3 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${ad3Connected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                  <span className="text-xs text-neutral-300">AD3</span>
                </div>
                <button
                  onClick={toggleAD3}
                  className={`text-xs px-2 py-1 rounded font-medium transition-all ${
                    ad3Connected
                      ? 'bg-neutral-700 text-white hover:bg-neutral-600'
                      : 'bg-white text-black hover:bg-neutral-200'
                  }`}
                >
                  {ad3Connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom-left: Controls (video game style) */}
      <div className="absolute bottom-6 left-6">
        <div className="flex gap-4 p-4 rounded-lg bg-black/70 backdrop-blur border border-neutral-800">
          {/* XY Controls */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => move('backward')}
              className={`w-10 h-10 rounded border transition-all flex flex-col items-center justify-center ${
                pressedKeys.has('w')
                  ? 'bg-white border-white text-black'
                  : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="text-[10px]">▲</span>
              <span className="text-xs font-medium">W</span>
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => move('left')}
                className={`w-10 h-10 rounded border transition-all flex items-center justify-center gap-0.5 ${
                  pressedKeys.has('a')
                    ? 'bg-white border-white text-black'
                    : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                <span className="text-[10px]">◀</span>
                <span className="text-xs font-medium">A</span>
              </button>
              <button
                onClick={home}
                className={`w-10 h-10 rounded border transition-all flex items-center justify-center ${
                  pressedKeys.has('h')
                    ? 'bg-white border-white text-black'
                    : 'border-neutral-600 bg-neutral-700/50 hover:bg-neutral-600 text-neutral-500'
                }`}
              >
                <span className="text-xs">H</span>
              </button>
              <button
                onClick={() => move('right')}
                className={`w-10 h-10 rounded border transition-all flex items-center justify-center gap-0.5 ${
                  pressedKeys.has('d')
                    ? 'bg-white border-white text-black'
                    : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-medium">D</span>
                <span className="text-[10px]">▶</span>
              </button>
            </div>
            <button
              onClick={() => move('forward')}
              className={`w-10 h-10 rounded border transition-all flex flex-col items-center justify-center ${
                pressedKeys.has('s')
                  ? 'bg-white border-white text-black'
                  : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="text-xs font-medium">S</span>
              <span className="text-[10px]">▼</span>
            </button>
          </div>

          {/* Z Controls */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => move('up')}
              className={`w-10 h-10 rounded border transition-all flex flex-col items-center justify-center ${
                pressedKeys.has('e')
                  ? 'bg-white border-white text-black'
                  : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="text-[10px]">↑</span>
              <span className="text-xs font-medium">E</span>
            </button>
            <button
              onClick={() => move('down')}
              className={`w-10 h-10 rounded border transition-all flex flex-col items-center justify-center ${
                pressedKeys.has('q')
                  ? 'bg-white border-white text-black'
                  : 'border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="text-xs font-medium">Q</span>
              <span className="text-[10px]">↓</span>
            </button>
          </div>

          {/* Step size */}
          <div className="flex flex-col justify-end">
            <select
              value={stepSize}
              onChange={(e) => setStepSize(parseFloat(e.target.value))}
              className="bg-neutral-800/80 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value={1}>1 mm</option>
              <option value={0.1}>0.1 mm</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg bg-red-500/10 backdrop-blur border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

export default App
