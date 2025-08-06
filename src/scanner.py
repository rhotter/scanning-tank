import serial


class Scanner:
    """Object for controlling 3D printer movement for scanning."""

    def __init__(self, port: str = "/dev/cu.usbserial-10", baud: int = 115200):
        self.port = port
        self.baud = baud
        self.ser = serial.Serial(port, baud, timeout=1)

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

    def move_to(self, x: float, y: float, z: float, feedrate: int = 3000):
        """
        Move the printer head to the specified coordinates.

        Args:
            x: X position in millimeters
            y: Y position in millimeters
            z: Z position in millimeters
            feedrate: Movement speed in mm/min
        """
        self.send_gcode(f"G1 X{x:.2f} Y{y:.2f} Z{z:.2f} F{feedrate}")

    def home(self):
        """Home all axes."""
        self.send_gcode("G28")

    def close(self):
        """Close the serial connection."""
        if self.ser.is_open:
            self.ser.close()
