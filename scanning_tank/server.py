from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import serial
import serial.tools.list_ports

from .pressure_reader import PressureReader
from .scanner import Scanner, X_MIN, X_MAX, Y_MIN, Y_MAX, Z_MIN, Z_MAX

# Global state
scanner: Scanner | None = None
pressure_reader: PressureReader | None = None
current_position = {"x": 0.0, "y": 0.0, "z": 180.0}
step_size = 1.0  # mm


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanup on shutdown
    global scanner, pressure_reader
    if scanner:
        scanner.close()
    if pressure_reader and pressure_reader.device:
        pressure_reader.device.__exit__(None, None, None)


app = FastAPI(lifespan=lifespan)

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/ports")
async def list_ports():
    """List available serial ports."""
    ports = serial.tools.list_ports.comports()
    return [{"device": p.device, "description": p.description} for p in ports]


@app.post("/api/connect/printer")
async def connect_printer(port: str):
    """Connect to the printer."""
    global scanner, current_position
    try:
        if scanner:
            scanner.close()
        scanner = Scanner(port=port)
        # Get the actual position from the printer
        current_position = scanner.get_position()
        return {"status": "connected", "port": port, "position": current_position}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/connect/ad3")
async def connect_ad3():
    """Connect to the AD3."""
    global pressure_reader
    try:
        if pressure_reader and pressure_reader.device:
            pressure_reader.device.__exit__(None, None, None)
        pressure_reader = PressureReader()
        pressure_reader.__enter__()
        return {"status": "connected"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/disconnect/printer")
async def disconnect_printer():
    """Disconnect the printer."""
    global scanner
    if scanner:
        scanner.close()
        scanner = None
    return {"status": "disconnected"}


@app.post("/api/disconnect/ad3")
async def disconnect_ad3():
    """Disconnect the AD3."""
    global pressure_reader
    if pressure_reader and pressure_reader.device:
        pressure_reader.device.__exit__(None, None, None)
        pressure_reader = None
    return {"status": "disconnected"}


@app.get("/api/position")
async def get_position():
    """Get current position."""
    return current_position


@app.post("/api/move")
async def move(x: float, y: float, z: float):
    """Move to absolute position."""
    global current_position
    if not scanner:
        return {"status": "error", "message": "Printer not connected"}
    try:
        scanner.move_to(x, y, z)
        current_position = {"x": x, "y": y, "z": z}
        return {"status": "ok", "position": current_position}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/move/relative")
async def move_relative(dx: float = 0, dy: float = 0, dz: float = 0):
    """Move relative to current position."""
    global current_position
    if not scanner:
        return {"status": "error", "message": "Printer not connected"}
    try:
        new_x = current_position["x"] + dx
        new_y = current_position["y"] + dy
        new_z = current_position["z"] + dz
        scanner.move_to(new_x, new_y, new_z)
        current_position = {"x": new_x, "y": new_y, "z": new_z}
        return {"status": "ok", "position": current_position}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/home")
async def home():
    """Home all axes."""
    global current_position
    if not scanner:
        return {"status": "error", "message": "Printer not connected"}
    try:
        scanner.home()
        current_position = scanner.get_position()
        return {"status": "ok", "position": current_position}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/pressure")
async def read_pressure():
    """Read current pressure."""
    if not pressure_reader:
        return {"status": "error", "message": "AD3 not connected"}
    try:
        pressure = pressure_reader.read_max_pressure()
        return {"status": "ok", "pressure": float(pressure)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/bounds")
async def get_bounds():
    """Get movement bounds."""
    return {
        "x": {"min": X_MIN, "max": X_MAX},
        "y": {"min": Y_MIN, "max": Y_MAX},
        "z": {"min": Z_MIN, "max": Z_MAX},
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "move":
                direction = data.get("direction")
                step = data.get("step", step_size)

                moves = {
                    "left": {"dx": -step},
                    "right": {"dx": step},
                    "forward": {"dy": -step},
                    "backward": {"dy": step},
                    "up": {"dz": step},
                    "down": {"dz": -step},
                }

                if direction in moves and scanner:
                    try:
                        move_params = moves[direction]
                        new_x = current_position["x"] + move_params.get("dx", 0)
                        new_y = current_position["y"] + move_params.get("dy", 0)
                        new_z = current_position["z"] + move_params.get("dz", 0)
                        scanner.move_to(new_x, new_y, new_z)
                        current_position["x"] = new_x
                        current_position["y"] = new_y
                        current_position["z"] = new_z
                        await websocket.send_json({
                            "type": "position",
                            "position": current_position
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })

            elif data.get("type") == "read_pressure":
                if pressure_reader:
                    try:
                        pressure = pressure_reader.read_max_pressure()
                        await websocket.send_json({
                            "type": "pressure",
                            "pressure": float(pressure)
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })

    except WebSocketDisconnect:
        pass


def main():
    import uvicorn
    uvicorn.run("scanning_tank.server:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
