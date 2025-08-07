from src.pressure_reader import PressureReader
import matplotlib.pyplot as plt
import numpy as np

with PressureReader() as pressure_reader:
    # pressure_reader = PressureReader()
    length_s = 10e-6
    waveform = pressure_reader.read_waveform(length_s=length_s)
max_pressure = np.max(waveform)
min_pressure = np.min(waveform)
peak_to_peak_pressure = max_pressure - min_pressure
print(f"Peak to peak pressure: {peak_to_peak_pressure:.2f} kPa")

# Plot
time_ms = np.linspace(0, length_s, len(waveform))
plt.plot(time_ms, waveform)

plt.xlabel("Time (ms)")
plt.ylabel("Pressure (kPa)")
plt.title("Hydrophone Data")
plt.grid(True)
plt.show()
