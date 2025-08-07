import time
import numpy as np
import matplotlib.pyplot as plt
from src.pressure_reader import PressureReader
from src.scanner import Scanner
from tqdm import tqdm

Y_MIN = -75
X_MIN = 35
X_MAX = 35
Z_MIN = 150


def scan_2d_plane(
    x_range_mm: tuple[float, float] = (-7, 15),
    y_range_mm: tuple[float, float] = (-70, -58),
    z_mm: float = 180,
    step_mm: float = 1.0,
    settle_time_s: float = 0.01,
):
    """
    Scan a 2D plane and return pressure measurements.

    Args:
        x_range_mm: (min, max) X range in mm
        y_range_mm: (min, max) Y range in mm
        z_mm: Z position in mm
        step_mm: Step size in mm
        settle_time_s: Time to wait for vibrations to settle

    Returns:
        dict with 'x_coords', 'y_coords', and 'pressure_data'
    """
    # Calculate grid points
    x_points = np.arange(x_range_mm[0], x_range_mm[1] + step_mm, step_mm)
    y_points = np.arange(y_range_mm[0], y_range_mm[1] + step_mm, step_mm)

    # Initialize data array
    pressure_data = np.zeros((len(y_points), len(x_points)))

    with Scanner() as scanner, PressureReader() as pressure_reader:
        # Home first
        print("Homing scanner...")
        scanner.home()
        time.sleep(2)

        print(f"Starting 2D scan: {len(x_points)} x {len(y_points)} points")
        scanner.move_to(x_points[0], y_points[0], z_mm)
        time.sleep(2)

        for i, y in tqdm(enumerate(y_points), desc="Scanning"):
            for j, x in enumerate(x_points):
                # Move to position
                scanner.move_to(x, y, z_mm)
                time.sleep(settle_time_s)

                if j == 0:
                    time.sleep(0.3)  # delay for each row
                    print("sleeping...")

                # Read pressure
                max_pressure = pressure_reader.read_max_pressure()
                pressure_data[i, j] = max_pressure

                print(f"Scanned ({x:.1f}, {y:.1f}): {max_pressure:.2f} kPa")

    return {"x_coords": x_points, "y_coords": y_points, "pressure_data": pressure_data}


def display_scan_image(scan_data):
    """Display the scanned pressure data as an image."""
    x_coords = scan_data["x_coords"]
    y_coords = scan_data["y_coords"]
    pressure_data = scan_data["pressure_data"]

    plt.figure(figsize=(10, 8))

    im = plt.imshow(
        pressure_data,
        extent=[x_coords[0], x_coords[-1], y_coords[0], y_coords[-1]],
        origin="lower",
        aspect="auto",
        cmap="viridis",
    )

    plt.colorbar(im, label="Pressure (kPa)")
    plt.xlabel("X Position (mm)")
    plt.ylabel("Y Position (mm)")
    plt.title("2D Pressure Scan")

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    # Run scan
    scan_data = scan_2d_plane(
        step_mm=1,  # Larger step for faster scanning
        settle_time_s=0.01,
    )

    # Display results
    display_scan_image(scan_data)

    # Save data
    np.savez("scan_2d_data.npz", **scan_data)
    print("Scan complete. Data saved to scan_2d_data.npz")
