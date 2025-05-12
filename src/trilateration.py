"""
Position estimation module using trilateration.
"""

from typing import List, Tuple, Dict
import numpy as np
from scipy.optimize import minimize
from .utils import validate_sensor_positions

class TrilaterationEngine:
    """Implements trilateration-based position estimation."""
    
    def __init__(self, sensor_positions: List[Tuple[float, float]]):
        """
        Initialize the trilateration engine.
        
        Args:
            sensor_positions: List of (x, y) coordinates for each sensor
        """
        if not validate_sensor_positions(sensor_positions):
            raise ValueError("Invalid sensor positions")
        
        self.sensor_positions = np.array(sensor_positions)
    
    def _calculate_error(self, point: np.ndarray, distances: np.ndarray) -> float:
        """
        Calculate the error between estimated and measured distances.
        
        Args:
            point: Current position estimate (x, y)
            distances: Measured distances to each sensor
            
        Returns:
            Sum of squared errors
        """
        estimated_distances = np.sqrt(np.sum((self.sensor_positions - point) ** 2, axis=1))
        return np.sum((estimated_distances - distances) ** 2)
    
    def estimate_position(self, distances: List[float]) -> Tuple[float, float]:
        """
        Estimate position using trilateration with least squares optimization.
        
        Args:
            distances: List of distances to each sensor
            
        Returns:
            Estimated (x, y) position
        """
        if len(distances) != len(self.sensor_positions):
            raise ValueError("Number of distances must match number of sensors")
        
        distances = np.array(distances)
        initial_guess = np.mean(self.sensor_positions, axis=0)
        
        result = minimize(
            self._calculate_error,
            initial_guess,
            args=(distances,),
            method='Nelder-Mead'
        )
        
        return tuple(result.x)
    
    def estimate_multiple_positions(self, 
                                  distance_measurements: List[List[float]]) -> List[Tuple[float, float]]:
        """
        Estimate multiple positions from a list of distance measurements.
        
        Args:
            distance_measurements: List of distance measurements, where each measurement
                                 is a list of distances to each sensor
            
        Returns:
            List of estimated (x, y) positions
        """
        return [self.estimate_position(distances) for distances in distance_measurements] 