"""
Utility functions for the Wi-Fi indoor positioning system.
"""

from typing import List, Tuple
import numpy as np

def calculate_distance(point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
    """
    Calculate Euclidean distance between two points.
    
    Args:
        point1: First point coordinates (x, y)
        point2: Second point coordinates (x, y)
        
    Returns:
        Distance between points in meters
    """
    return np.sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def calculate_mean_error(estimated_positions: List[Tuple[float, float]], 
                        ground_truth: List[Tuple[float, float]]) -> float:
    """
    Calculate mean positioning error.
    
    Args:
        estimated_positions: List of estimated (x, y) positions
        ground_truth: List of ground truth (x, y) positions
        
    Returns:
        Mean error in meters
    """
    errors = [calculate_distance(est, true) 
             for est, true in zip(estimated_positions, ground_truth)]
    return np.mean(errors)

def validate_sensor_positions(sensor_positions: List[Tuple[float, float]]) -> bool:
    """
    Validate sensor positions.
    
    Args:
        sensor_positions: List of (x, y) coordinates for each sensor
        
    Returns:
        True if positions are valid, False otherwise
    """
    if len(sensor_positions) < 3:
        return False
    
    # Check for duplicate positions
    positions_set = set(sensor_positions)
    if len(positions_set) != len(sensor_positions):
        return False
    
    return True 