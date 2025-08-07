import numpy as np
import time
from typing import Tuple, Optional, Dict, Any
from src.scanner import Scanner, X_MIN, X_MAX, Y_MIN, Y_MAX, Z_MIN, Z_MAX
from src.pressure_reader import PressureReader


class GradientDescentPeakFinder:
    """Gradient descent optimizer for finding pressure field peaks."""

    def __init__(
        self,
        scanner: Scanner,
        pressure_reader: PressureReader,
        learning_rate: float = 0.5,
        epsilon: float = 0.1,
        settle_time: float = 0.02,
    ):
        self.scanner = scanner
        self.pressure_reader = pressure_reader
        self.learning_rate = learning_rate
        self.epsilon = epsilon  # Step size for gradient estimation
        self.settle_time = settle_time

    def _bounds_check(self, x: float, y: float, z: float) -> Tuple[float, float, float]:
        """Ensure coordinates are within scanner bounds."""
        x = np.clip(x, X_MIN, X_MAX)
        y = np.clip(y, Y_MIN, Y_MAX)
        z = np.clip(z, Z_MIN, Z_MAX)
        return x, y, z

    def _measure_pressure(self, x: float, y: float, z: float) -> float:
        """Move to position and measure pressure."""
        x, y, z = self._bounds_check(x, y, z)
        self.scanner.move_to(x, y, z)
        time.sleep(self.settle_time)
        return self.pressure_reader.read_max_pressure()

    def _estimate_gradient(
        self, x: float, y: float, z: float
    ) -> Tuple[float, float, float]:
        """Estimate gradient using 5-point finite difference for noise reduction."""
        
        # X gradient using 5-point stencil: [-2h, -h, 0, +h, +2h]
        p_x_minus2 = self._measure_pressure(x - 2*self.epsilon, y, z)
        p_x_minus1 = self._measure_pressure(x - self.epsilon, y, z)
        p_x_plus1 = self._measure_pressure(x + self.epsilon, y, z)
        p_x_plus2 = self._measure_pressure(x + 2*self.epsilon, y, z)
        grad_x = (-p_x_plus2 + 8*p_x_plus1 - 8*p_x_minus1 + p_x_minus2) / (12 * self.epsilon)
        
        # Y gradient using 5-point stencil
        p_y_minus2 = self._measure_pressure(x, y - 2*self.epsilon, z)
        p_y_minus1 = self._measure_pressure(x, y - self.epsilon, z)
        p_y_plus1 = self._measure_pressure(x, y + self.epsilon, z)
        p_y_plus2 = self._measure_pressure(x, y + 2*self.epsilon, z)
        grad_y = (-p_y_plus2 + 8*p_y_plus1 - 8*p_y_minus1 + p_y_minus2) / (12 * self.epsilon)
        
        # Z gradient using 5-point stencil
        p_z_minus2 = self._measure_pressure(x, y, z - 2*self.epsilon)
        p_z_minus1 = self._measure_pressure(x, y, z - self.epsilon)
        p_z_plus1 = self._measure_pressure(x, y, z + self.epsilon)
        p_z_plus2 = self._measure_pressure(x, y, z + 2*self.epsilon)
        grad_z = (-p_z_plus2 + 8*p_z_plus1 - 8*p_z_minus1 + p_z_minus2) / (12 * self.epsilon)

        return grad_x, grad_y, grad_z

    def find_peak(
        self,
        start_x: float,
        start_y: float,
        start_z: float,
        max_iterations: int = 200,
        convergence_threshold: float = 0.01,
    ) -> Dict[str, Any]:
        """
        Find pressure field peak using gradient descent.

        Args:
            start_x, start_y, start_z: Starting coordinates
            max_iterations: Maximum optimization iterations
            convergence_threshold: Stop when gradient magnitude < threshold

        Returns:
            Dict with peak coordinates, pressure, and optimization info
        """
        x, y, z = self._bounds_check(start_x, start_y, start_z)

        history = {
            "positions": [(x, y, z)],
            "pressures": [],
            "gradients": [],
            "iterations": 0,
        }

        print(f"Starting peak search from ({x:.2f}, {y:.2f}, {z:.2f})")

        for iteration in range(max_iterations):
            # Measure current pressure
            current_pressure = self._measure_pressure(x, y, z)
            history["pressures"].append(current_pressure)

            # Estimate gradient
            grad_x, grad_y, grad_z = self._estimate_gradient(x, y, z)
            gradient_magnitude = np.sqrt(grad_x**2 + grad_y**2 + grad_z**2)
            history["gradients"].append((grad_x, grad_y, grad_z))

            print(
                f"Iter {iteration+1}: pos=({x:.2f},{y:.2f},{z:.2f}), "
                f"pressure={current_pressure:.2f} kPa, grad_mag={gradient_magnitude:.4f}"
            )

            # Check convergence
            # if gradient_magnitude < convergence_threshold:
            #     print(f"Converged after {iteration+1} iterations")
            #     break

            # Update position using gradient ascent (maximize pressure)
            new_x = x + self.learning_rate * grad_x
            new_y = y + self.learning_rate * grad_y
            new_z = z + self.learning_rate * grad_z

            x, y, z = self._bounds_check(new_x, new_y, new_z)
            history["positions"].append((x, y, z))

        history["iterations"] = iteration + 1

        # Final measurement
        final_pressure = self._measure_pressure(x, y, z)

        return {
            "peak_position": (x, y, z),
            "peak_pressure": final_pressure,
            "history": history,
            "converged": gradient_magnitude < convergence_threshold,
        }


def find_pressure_peak(
    start_x: float = 0.0,
    start_y: float = -60.0,
    start_z: float = 180.0,
    learning_rate: float = 0.5,
    epsilon: float = 0.1,
) -> Dict[str, Any]:
    """
    Convenience function to find pressure field peak.

    Args:
        start_x, start_y, start_z: Starting coordinates (mm)
        learning_rate: Gradient descent step size
        epsilon: Finite difference step size for gradient estimation

    Returns:
        Peak finding results
    """
    with Scanner() as scanner, PressureReader() as pressure_reader:
        # Home first
        print("Homing scanner...")
        scanner.home()
        scanner.move_to(start_x, start_y, start_z)
        time.sleep(2)

        # Initialize optimizer
        optimizer = GradientDescentPeakFinder(
            scanner=scanner,
            pressure_reader=pressure_reader,
            learning_rate=learning_rate,
            epsilon=epsilon,
        )

        # Find peak
        results = optimizer.find_peak(start_x, start_y, start_z)

        print(
            f"\nPeak found at: ({results['peak_position'][0]:.2f}, "
            f"{results['peak_position'][1]:.2f}, {results['peak_position'][2]:.2f})"
        )
        print(f"Peak pressure: {results['peak_pressure']:.2f} kPa")
        print(f"Iterations: {results['history']['iterations']}")
        print(f"Converged: {results['converged']}")

        return results


if __name__ == "__main__":
    # Example usage
    results = find_pressure_peak(
        start_x=12.7, start_y=-67.4, start_z=188.7, learning_rate=0.003, epsilon=0.1
    )
