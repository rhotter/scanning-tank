import dwfpy as dwf
import numpy as np


class PressureReader:
    """Object for reading pressure data from hydrophone via oscilloscope."""

    def __init__(self, kpa_per_mv: float = 6.31):
        self.hydrophone_kpa_per_mv = kpa_per_mv  # look up in your datasheet, might need to convert from dB re 1V/µPa
        self.device = None

    def __enter__(self):
        self.device = dwf.Device()
        self.device.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.device:
            self.device.__exit__(exc_type, exc_val, exc_tb)

    def read_max_pressure(
        self,
        sample_rate_hz: float = 100e6,
        length_s: float = 10e-6,
        trigger_position_s: float = -1e-6,
        trigger_level_v: float = 0.005,
        trigger_hysteresis_v: float = 0.01,
        channel_range_v: float = 0.5,
    ) -> float:
        """Read the maximum pressure from the hydrophone."""
        waveform = self.read_waveform(
            sample_rate_hz,
            length_s,
            trigger_position_s,
            trigger_level_v,
            trigger_hysteresis_v,
            channel_range_v,
        )
        return np.max(np.abs(waveform))

    def read_waveform(
        self,
        sample_rate_hz: float = 100e6,
        length_s: float = 10e-6,
        trigger_position_s: float = -1e-6,
        trigger_level_v: float = 0.005,
        trigger_hysteresis_v: float = 0.01,
        channel_range_v: float = 0.5,
    ) -> np.ndarray:
        """
        Read pressure waveform from the hydrophone.

        Returns:
            The pressure waveform in kPa.
        """
        if not self.device:
            raise RuntimeError(
                "Device not initialized. Use PressureReader as a context manager."
            )

        scope = self.device.analog_input
        scope[0].setup(range=channel_range_v)
        scope.setup_edge_trigger(
            mode="auto",
            channel=0,
            slope="rising",
            level=trigger_level_v,
            hysteresis=trigger_hysteresis_v,
            position=trigger_position_s,
        )
        recorder = scope.record(
            sample_rate=sample_rate_hz,
            length=length_s,
            configure=True,
            start=True,
        )
        channels = recorder.channels

        return self.hydrophone_kpa_per_mv * 1e3 * channels[0].data_samples
