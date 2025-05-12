"""
Data loading and preprocessing module for RSSI measurements.
"""

import pandas as pd
import os
from typing import Dict, List, Tuple
import numpy as np
import glob

class RSSIDataReader:
    """Handles loading and preprocessing of RSSI data from CSV files."""
    
    def __init__(self, data_dir: str = "data"):
        """
        Initialize the RSSI data reader.
        
        Args:
            data_dir: Directory containing the RSSI data files
        """
        self.data_dir = data_dir
        self.sensor_positions = {}
        self.data = {}
        
    def load_all_data(self) -> Dict[str, pd.DataFrame]:
        """
        Load RSSI data from all CSV files in the data directory.
        
        Returns:
            Dictionary mapping sensor IDs to their respective DataFrames
        """
        # Find all CSV files in the data directory
        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        
        for file_path in csv_files:
            # Extract sensor position from filename
            filename = os.path.basename(file_path)
            if "Konum_" in filename:
                position_str = filename.split("Konum_")[1].split(")")[0]
                x, y = map(float, position_str.split(","))
                sensor_id = filename.split("(")[1].split(" - ")[0]
                self.sensor_positions[sensor_id] = (x, y)
            
            # Read the CSV file
            with open(file_path, 'r') as f:
                lines = f.readlines()
            
            # Find the line that separates BSSID and Station data
            separator_line = None
            for i, line in enumerate(lines):
                if line.strip() == '':
                    separator_line = i
                    break
            
            if separator_line is not None:
                # Read only the Station data part
                station_data = pd.read_csv(file_path, skiprows=separator_line + 1)
                
                # Clean column names by stripping whitespace
                station_data.columns = station_data.columns.str.strip()
                
                # Create a clean DataFrame with required columns
                clean_data = pd.DataFrame({
                    'timestamp': pd.to_datetime(station_data['First time seen'].str.strip()),
                    'device_id': station_data['Station MAC'].str.strip(),
                    'sensor_id': sensor_id,
                    'rssi': station_data['Power'].astype(float)
                })
                
                self.data[sensor_id] = clean_data
        
        return self.data
    
    def get_sensor_positions(self) -> Dict[str, Tuple[float, float]]:
        """
        Get the positions of all sensors.
        
        Returns:
            Dictionary mapping sensor IDs to their (x, y) positions
        """
        if not self.sensor_positions:
            self.load_all_data()
        return self.sensor_positions
    
    def get_device_measurements(self, device_id: str) -> Dict[str, List[float]]:
        """
        Get RSSI measurements for a specific device from all sensors.
        
        Args:
            device_id: MAC address of the device
            
        Returns:
            Dictionary containing sensor IDs and their RSSI measurements
        """
        if not self.data:
            self.load_all_data()
            
        measurements = {}
        for sensor_id, df in self.data.items():
            device_data = df[df['device_id'] == device_id]
            if not device_data.empty:
                measurements[sensor_id] = device_data['rssi'].tolist()
            
        return measurements
    
    def get_latest_measurements(self, device_id: str) -> Dict[str, float]:
        """
        Get the latest RSSI measurements for a specific device from all sensors.
        
        Args:
            device_id: MAC address of the device
            
        Returns:
            Dictionary containing sensor IDs and their latest RSSI measurements
        """
        if not self.data:
            self.load_all_data()
            
        latest_measurements = {}
        for sensor_id, df in self.data.items():
            device_data = df[df['device_id'] == device_id]
            if not device_data.empty:
                latest_measurements[sensor_id] = device_data['rssi'].iloc[-1]
            
        return latest_measurements 