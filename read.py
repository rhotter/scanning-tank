import matplotlib.pyplot as plt
import dwfpy as dwf
import numpy as np

print(f"DWF Version: {dwf.Application.get_version()}")

with dwf.Device() as device:
    print(f"Found device: {device.name} ({device.serial_number})")

    scope = device.analog_input

    print("Starting oscilloscope...")
    scope[0].setup(range=0.5)
    scope.setup_edge_trigger(
        mode="normal",
        channel=0,
        slope="rising",
        level=0.005,
        hysteresis=0.01,
        position=-1e-6,
    )
    recorder = scope.record(sample_rate=100e6, length=10e-6, configure=True, start=True)

    if recorder.lost_samples > 0:
        print("Samples lost, reduce sample rate.")
    if recorder.corrupted_samples > 0:
        print("Samples corrupted, reduce sample rate.")

    print(
        f"Processed {recorder.total_samples} samples total, "
        f"received {len(recorder.channels[0].data_samples)} samples."
    )

    channels = recorder.channels

# Create time array for x-axis
time_ms = np.linspace(0, 2, len(channels[0].data_samples))

# Plot each channel
channel = channels[0]
plt.plot(time_ms, channel.data_samples)

plt.xlabel("Time (ms)")
plt.ylabel("Voltage (V)")
plt.title("Oscilloscope Data")
plt.grid(True)
plt.show()
