"""
Visualization module for indoor positioning results.
"""

from typing import List, Tuple, Optional
import matplotlib.pyplot as plt
import numpy as np
from .utils import calculate_mean_error

class PositionVisualizer:
    """Handles visualization of positions and sensor locations."""
    
    def __init__(self, sensor_positions: List[Tuple[float, float]]):
        """
        Initialize the visualizer.
        
        Args:
            sensor_positions: List of (x, y) coordinates for each sensor
        """
        self.sensor_positions = np.array(sensor_positions)
    
    def plot_positions(self, 
                      estimated_positions: List[Tuple[float, float]],
                      ground_truth: Optional[List[Tuple[float, float]]] = None,
                      title: str = "Indoor Positioning Results",
                      show_error: bool = True) -> None:
        """
        Plot estimated positions and sensor locations.
        
        Args:
            estimated_positions: List of estimated (x, y) positions
            ground_truth: Optional list of ground truth (x, y) positions
            title: Plot title
            show_error: Whether to show error metrics if ground truth is available
        """
        plt.figure(figsize=(10, 8))
        
        # Plot sensor positions
        plt.scatter(self.sensor_positions[:, 0], self.sensor_positions[:, 1],
                   c='red', marker='^', s=100, label='Sensors')
        
        # Plot estimated positions
        estimated_positions = np.array(estimated_positions)
        plt.scatter(estimated_positions[:, 0], estimated_positions[:, 1],
                   c='blue', marker='o', label='Estimated Positions')
        
        # Plot ground truth if available
        if ground_truth is not None:
            ground_truth = np.array(ground_truth)
            plt.scatter(ground_truth[:, 0], ground_truth[:, 1],
                       c='green', marker='x', label='Ground Truth')
            
            if show_error:
                # Calculate and display error metrics
                mean_error = calculate_mean_error(estimated_positions, ground_truth)
                max_error = np.max([np.linalg.norm(est - true) 
                                  for est, true in zip(estimated_positions, ground_truth)])
                plt.title(f"{title}\nMean Error: {mean_error:.2f}m, Max Error: {max_error:.2f}m")
            else:
                plt.title(title)
        else:
            plt.title(title)
        
        plt.xlabel('X Position (m)')
        plt.ylabel('Y Position (m)')
        plt.grid(True)
        plt.legend()
        plt.axis('equal')
        plt.show()
    
    def plot_error_histogram(self, 
                           estimated_positions: List[Tuple[float, float]],
                           ground_truth: List[Tuple[float, float]],
                           title: str = "Positioning Error Distribution") -> None:
        """
        Plot histogram of positioning errors.
        
        Args:
            estimated_positions: List of estimated (x, y) positions
            ground_truth: List of ground truth (x, y) positions
            title: Plot title
        """
        errors = [np.linalg.norm(np.array(est) - np.array(true))
                 for est, true in zip(estimated_positions, ground_truth)]
        
        plt.figure(figsize=(10, 6))
        plt.hist(errors, bins=20, edgecolor='black')
        plt.title(f"{title}\nMean Error: {np.mean(errors):.2f}m")
        plt.xlabel('Error (m)')
        plt.ylabel('Frequency')
        plt.grid(True)
        plt.show() 