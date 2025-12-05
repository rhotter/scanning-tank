#!/usr/bin/env python3
"""Test script to check printer movement units."""

import serial
import serial.tools.list_ports
import time

# List available ports
print("Available ports:")
ports = serial.tools.list_ports.comports()
for i, p in enumerate(ports):
    print(f"  {i}: {p.device} - {p.description}")

if not ports:
    print("No ports found!")
    exit(1)

# Select port
port_idx = int(input("\nSelect port number: "))
port = ports[port_idx].device

print(f"\nConnecting to {port}...")
ser = serial.Serial(port, 115200, timeout=2)
time.sleep(2)  # Wait for printer to initialize

def send_gcode(cmd: str):
    """Send G-code and wait for ok."""
    print(f"  Sending: {cmd}")
    ser.write((cmd + "\n").encode())
    ser.flush()
    while True:
        line = ser.readline().decode().strip()
        if line:
            print(f"  Response: {line}")
        if "ok" in line.lower():
            break

# Get current position
print("\n1. Getting current position...")
send_gcode("M114")

input("\n2. Press Enter to move X by 1 (should be 1mm)...")
send_gcode("G91")  # Relative positioning
send_gcode("G1 X1 F500")
send_gcode("G90")  # Back to absolute
send_gcode("M114")

input("\n3. Press Enter to move X by -1 (back to start)...")
send_gcode("G91")
send_gcode("G1 X-1 F500")
send_gcode("G90")
send_gcode("M114")

input("\n4. Press Enter to move X by 0.1 (should be 0.1mm)...")
send_gcode("G91")
send_gcode("G1 X0.1 F500")
send_gcode("G90")
send_gcode("M114")

input("\n5. Press Enter to move X by -0.1 (back)...")
send_gcode("G91")
send_gcode("G1 X-0.1 F500")
send_gcode("G90")
send_gcode("M114")

print("\nDid the printer move the expected distances?")
print("  - Step 2: Should have moved 1mm")
print("  - Step 4: Should have moved 0.1mm")
print("\nIf it moved 1000x too much, the issue is in the printer firmware config.")
print("If it moved correctly, the issue is in our webapp code.")

ser.close()
print("\nDone!")
