"""
RSSI-Distance conversion and RSSI simulation using log-distance path loss model.
"""

import numpy as np
from typing import Dict, Tuple

class RSSIConverter:
    def __init__(self,
                 tx_power_dBm: float = 20.0,
                 PL_d0_dB: float = 40.0,
                 d0: float = 1.0,
                 path_loss_exponent: float = 2.0,
                 shadowing_std_dev_dB: float = 0.1,
                 noise_floor_dBm: float = -90.0):
        """
        Initialize the converter with model parameters.
        """
        self.tx_power_dBm = tx_power_dBm
        self.PL_d0_dB = PL_d0_dB
        self.d0 = d0
        self.path_loss_exponent = path_loss_exponent
        self.shadowing_std_dev_dB = shadowing_std_dev_dB
        self.noise_floor_dBm = noise_floor_dBm

        self.sensor_positions: Dict[str, Tuple[float, float]] = {}

    def set_sensor_positions(self, sensor_positions: Dict[str, Tuple[float, float]]):
        """
        Set the positions of sensors.
        """
        self.sensor_positions = sensor_positions

    def rssi_to_distance(self, rssi_dBm: float) -> float:
        """
        Estimate distance from RSSI.
        """
        path_loss_dB = self.tx_power_dBm - rssi_dBm
        if path_loss_dB <= self.PL_d0_dB:
            return self.d0
        else:
            return self.d0 * 10 ** ((path_loss_dB - self.PL_d0_dB) / (10 * self.path_loss_exponent))

    def simulate_rssi_from_position(self, device_pos: Tuple[float, float]) -> Dict[str, float]:
        """
        Simulate RSSI from a given device position to each sensor.
        
        Returns:
            A dict: {sensor_id: rssi}
        """
        simulated_rssi = {}
        for sensor_id, ap_pos in self.sensor_positions.items():
            distance = np.linalg.norm(np.array(device_pos) - np.array(ap_pos))
            if distance < 0.1:
                distance = 0.1

            if distance <= self.d0:
                path_loss_dB = self.PL_d0_dB
            else:
                path_loss_dB = self.PL_d0_dB + 10 * self.path_loss_exponent * np.log10(distance / self.d0)

            # Add log-normal shadowing
            shadowing_dB = np.random.normal(0, self.shadowing_std_dev_dB)
            total_loss_dB = path_loss_dB + shadowing_dB
            rssi = self.tx_power_dBm - total_loss_dB
            simulated_rssi[sensor_id] = max(rssi, self.noise_floor_dBm)

        return simulated_rssi
