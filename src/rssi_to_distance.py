"""
RSSI to distance conversion module using the log-distance path loss model.
"""

from typing import List, Dict
import numpy as np

class RSSIConverter:
    """Converts RSSI measurements to distances using the log-distance path loss model."""
    
    def __init__(self, p0: float = -32.0, n: float = 2.3):
        """
        Initialize the RSSI converter.
        
        Args:
            p0: Reference power at 1m distance (dBm)
            n: Path loss exponent
        """
        self.p0 = p0
        self.n = n
    
    def rssi_to_distance(self, rssi: float) -> float:
        """
        Convert RSSI to distance using the log-distance path loss model.
        
        Args:
            rssi: Received signal strength in dBm
            
        Returns:
            Estimated distance in meters
        """
        return 10 ** ((self.p0 - rssi) / (10 * self.n))
    
    def convert_measurements(self, measurements: Dict[str, float]) -> Dict[str, float]:
        """
        Convert multiple RSSI measurements to distances.
        
        Args:
            measurements: Dictionary mapping sensor IDs to RSSI values
            
        Returns:
            Dictionary mapping sensor IDs to estimated distances
        """
        return {sensor_id: self.rssi_to_distance(rssi) 
                for sensor_id, rssi in measurements.items()}
    
    def calibrate_model(self, known_distances: List[float], 
                       measured_rssi: List[float]) -> None:
        """
        Calibrate the path loss model using known distances and RSSI measurements.
        
        Args:
            known_distances: List of known distances in meters
            measured_rssi: List of corresponding RSSI measurements in dBm
        """
        if len(known_distances) != len(measured_rssi):
            raise ValueError("Number of distances must match number of RSSI measurements")
        
        # Calculate path loss exponent using linear regression
        x = np.log10(known_distances)
        y = measured_rssi
        
        # Linear regression: y = mx + b
        m, b = np.polyfit(x, y, 1)
        
        # Update model parameters
        self.n = -m / 10
        self.p0 = b 