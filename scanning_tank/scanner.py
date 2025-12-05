import re
import time
import serial

Y_MIN = -75
Y_MAX = 0
X_MIN = -35
X_MAX = 35
Z_MIN = 150
Z_MAX = 195


class Scanner:
    """Object for controlling 3D printer movement for scanning."""

    def __init__(self, port: str = "/dev/cu.usbserial-10", baud: int = 115200):
        self.port = port
        self.baud = baud
        self.ser = serial.Serial(port, baud, timeout=2)
        time.sleep(0.5)  # Wait for printer to initialize
        # Clear any buffered data
        self.ser.reset_input_buffer()
        # Ensure we're in absolute positioning mode and mm units
        self.send_gcode("G90")  # Absolute positioning
        self.send_gcode("G21")  # Millimeters

    def get_position(self) -> dict[str, float]:
        """Query the current position from the printer."""
        self.ser.reset_input_buffer()
        self.ser.write(b"M114\n")
        self.ser.flush()

        pos = None
        # Read multiple lines to find position
        for _ in range(10):
            line = self.ser.readline().decode().strip()
            if not line:
                continue
            # Parse position from response like "X:0.00 Y:0.00 Z:180.00 E:0.00"
            match = re.search(r"X:([-\d.]+)\s+Y:([-\d.]+)\s+Z:([-\d.]+)", line)
            if match:
                pos = {
                    "x": float(match.group(1)),
                    "y": float(match.group(2)),
                    "z": float(match.group(3)),
                }
                return pos
            if "ok" in line.lower() and pos:
                return pos
        if pos:
            return pos
        return {"x": 0.0, "y": 0.0, "z": 180.0}  # Fallback

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self, "ser") and self.ser.is_open:
            self.ser.close()

    def send_gcode(self, cmd: str):
        """Send G-code command and wait for acknowledgment."""
        self.ser.write((cmd + "\n").encode())
        self.ser.flush()
        # wait for acknowledgment
        while True:
            line = self.ser.readline().decode().strip()
            if "ok" in line.lower():
                break

    def move_to(
        self,
        x: float,
        y: float,
        z: float,
        safety_check: bool = True,
        feedrate: int = 3000,
    ):
        """
        Move the printer head to the specified coordinates.

        Args:
            x: X position in millimeters
            y: Y position in millimeters
            z: Z position in millimeters
            feedrate: Movement speed in mm/min
        """
        # if safety_check and (
        #     x < X_MIN or x > X_MAX or y < Y_MIN or y > Y_MAX or z < Z_MIN or z > Z_MAX
        # ):
        #     raise ValueError(f"Position out of bounds: ({x:.2f}, {y:.2f}, {z:.2f})")
        self.send_gcode(f"G1 X{x:.2f} Y{y:.2f} Z{z:.2f} F{feedrate}")

    def home(self):
        """Home all axes."""
        self.move_to(0, 0, 180, safety_check=False)
        self.send_gcode("G28")

    def close(self):
        """Close the serial connection."""
        if self.ser.is_open:
            self.ser.close()
