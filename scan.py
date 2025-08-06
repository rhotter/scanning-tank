import time
import serial

# import pyvisa as visa

# --- Configuration ---
PRINTER_PORT = "/dev/cu.usbserial-10"
PRINTER_BAUD = 115200

# OSC_VISA_ADDR = "USB0::0x0699::0x0363::C102220::INSTR"  # replace with your scope's ID
# OSC_CHANNEL = 1

# Scan parameters (in mm)
# X_RANGE_MM = [10, 30]
Y_RANGE_MM = [50, 150]
Z_MM = 180
STEP_MM = 0.1

# --- Initialize connections ---
ser = serial.Serial(PRINTER_PORT, PRINTER_BAUD, timeout=1)
# rm = visa.ResourceManager()
# scope = rm.open_resource(OSC_VISA_ADDR)


def send_gcode(cmd):
    ser.write((cmd + "\n").encode())
    ser.flush()
    # wait for acknowledgment
    while True:
        line = ser.readline().decode().strip()
        if "ok" in line.lower():
            break


def move_to(x, y, z):
    """
    Move the printer head to the specified coordinates.

    Args:
        x (float): X position in millimeters.
        y (float): Y position in millimeters.
        z (float): Z position in millimeters.

    Units: All coordinates are in millimeters (mm).
    """
    send_gcode(f"G1 X{x:.2f} Y{y:.2f} Z{z:.2f} F3000")


def read_waveform():
    return [0]
    # # set acquisition to single-shot
    # scope.write(":SINGLE")
    # # wait for acquisition
    # scope.query("*OPC?")
    # # fetch data from channel
    # data = scope.query_binary_values(
    #     f":WAVEFORM:DATA? CHANNEL{OSC_CHANNEL}", datatype="f", container=list
    # )
    # return data


def main():
    # home first
    # send_gcode("G28")
    # move_to(0, 10, 40)
    # time.sleep(2)
    x = 12

    for y in range(int(Y_RANGE_MM[0] / STEP_MM), int(Y_RANGE_MM[1] / STEP_MM) + 1):
        y_pos = y * STEP_MM
        # for x in range(X_RANGE_MM[0], X_RANGE_MM[1] + 1, STEP_MM):
        move_to(x, y_pos, Z_MM)
        time.sleep(0.01)  # let vibrations settle
        # wf = read_waveform()
        # results.append({"x": x, "y": y, "waveform": wf})
        # print(f"Scanned ({x}, {y}), got {len(wf)} points")
    # # Optionally: save to file

    # results = []
    # for y in range(Y_RANGE_MM[0], Y_RANGE_MM[1] + 1, STEP_MM):
    #     for x in range(X_RANGE_MM[0], X_RANGE_MM[1] + 1, STEP_MM):
    #         move_to(x, y, Z_MM)
    #         time.sleep(0.5)  # let vibrations settle
    #         wf = read_waveform()
    #         results.append({"x": x, "y": y, "waveform": wf})
    #         print(f"Scanned ({x}, {y}), got {len(wf)} points")
    # # # Optionally: save to file
    # # import json

    # with open("scan_data.json", "w") as f:
    #     json.dump(results, f)
    # print("Scan complete. Data saved to scan_data.json")


if __name__ == "__main__":
    main()
    # move_to(0, 0, 200)
