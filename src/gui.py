"""
GUI module for the Wi-Fi indoor positioning system.
"""

from PyQt5.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                           QPushButton, QTableWidget, QTableWidgetItem, QLabel,
                           QComboBox, QTextEdit, QTabWidget, QSplitter)
from PyQt5.QtCore import Qt
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from typing import Dict, List, Tuple
import numpy as np
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import os

class PositionCanvas(FigureCanvas):
    """Matplotlib canvas for displaying positions."""
    
    def __init__(self, parent=None, width=5, height=4, dpi=100):
        self.fig = Figure(figsize=(width, height), dpi=dpi)
        self.axes = self.fig.add_subplot(111)
        super().__init__(self.fig)
        self.setParent(parent)
    
    def plot_positions(self, sensor_positions: List[Tuple[float, float]],
                      device_positions: Dict[str, Tuple[float, float]]):
        """Plot sensor and device positions."""
        self.axes.clear()
        
        # Plot sensor positions
        sensor_pos = np.array(sensor_positions)
        self.axes.scatter(sensor_pos[:, 0], sensor_pos[:, 1],
                         c='red', marker='^', s=100, label='Sensors')
        
        # Plot device positions with custom icon
        if device_positions:
            from matplotlib import image as mpimg
            img_path = os.path.join('src', 'images', 'responsive.png')
            
            # Create custom marker from PNG
            custom_marker = mpimg.imread(img_path)
            
            # Extract device positions
            device_xs = [pos[0] for pos in device_positions.values()]
            device_ys = [pos[1] for pos in device_positions.values()]
            
            # Plot devices with blue dots (temporary, for now)
            self.axes.scatter(device_xs, device_ys, c='green', marker='o', s=200, label='Devices')
            
            # Add device labels
            for device_id, pos in device_positions.items():
                self.axes.annotate(device_id[-6:],  # Show last 6 chars of MAC
                                 (pos[0], pos[1]),
                                 xytext=(5, 5),
                                 textcoords='offset points')
        
        self.axes.set_xlabel('X Position (m)')
        self.axes.set_ylabel('Y Position (m)')
        self.axes.grid(True)
        self.axes.legend()
        self.axes.axis('equal')
        self.fig.tight_layout()
        self.draw()

class MainWindow(QMainWindow):
    """Main window for the positioning system GUI."""
    
    def __init__(self, reader, rssi_converter, trilateration_engine):
        super().__init__()
        self.reader = reader
        self.rssi_converter = rssi_converter
        self.trilateration_engine = trilateration_engine
        
        self.setWindowTitle("Wi-Fi Indoor Positioning System")
        self.setGeometry(100, 100, 1200, 800)
        
        # Create main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QHBoxLayout(main_widget)
        
        # Create splitter for resizable sections
        splitter = QSplitter(Qt.Horizontal)
        layout.addWidget(splitter)
        
        # Left panel for controls and device list
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        # Device selection
        device_layout = QHBoxLayout()
        device_layout.addWidget(QLabel("Select Device:"))
        self.device_combo = QComboBox()
        device_layout.addWidget(self.device_combo)
        left_layout.addLayout(device_layout)
        
        # Device details table
        self.details_table = QTableWidget()
        self.details_table.setColumnCount(3)
        self.details_table.setHorizontalHeaderLabels(["Sensor", "RSSI (dBm)", "Distance (m)"])
        left_layout.addWidget(self.details_table)
        
        # Position information
        self.position_label = QLabel("Estimated Position: ")
        left_layout.addWidget(self.position_label)
        
        # Add left panel to splitter
        splitter.addWidget(left_panel)
        
        # Right panel for visualization
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        # Create matplotlib canvas
        self.canvas = PositionCanvas(right_panel)
        right_layout.addWidget(self.canvas)
        
        # Add right panel to splitter
        splitter.addWidget(right_panel)
        
        # Set initial splitter sizes
        splitter.setSizes([400, 800])
        
        # Initialize data
        self.load_data()
        
        # Connect signals
        self.device_combo.currentTextChanged.connect(self.update_device_details)
    
    def load_data(self):
        """Load and process all data."""
        # Load data
        self.data = self.reader.load_all_data()
        self.sensor_positions = self.reader.get_sensor_positions()
        self.sensor_pos_list = list(self.sensor_positions.values())
        
        # Get all devices
        all_devices = set()
        for df in self.data.values():
            all_devices.update(df['device_id'].unique())
        
        # Process each device
        self.device_positions = {}
        self.device_measurements = {}
        
        for device_id in all_devices:
            measurements = self.reader.get_latest_measurements(device_id)
            if len(measurements) >= 3:
                self.device_measurements[device_id] = measurements
                distances = list(self.rssi_converter.convert_measurements(measurements).values())
                position = self.trilateration_engine.estimate_position(distances)
                self.device_positions[device_id] = position
        
        # Update UI
        self.device_combo.addItems(sorted(self.device_positions.keys()))
        self.update_visualization()
    
    def update_device_details(self, device_id):
        """Update device details when selection changes."""
        if not device_id:
            return
        
        measurements = self.device_measurements[device_id]
        position = self.device_positions[device_id]
        
        # Update position label
        self.position_label.setText(
            f"Estimated Position: ({position[0]:.2f}, {position[1]:.2f})"
        )
        
        # Update details table
        self.details_table.setRowCount(len(measurements))
        for i, (sensor_id, rssi) in enumerate(measurements.items()):
            distance = self.rssi_converter.rssi_to_distance(rssi)
            
            self.details_table.setItem(i, 0, QTableWidgetItem(sensor_id))
            self.details_table.setItem(i, 1, QTableWidgetItem(f"{rssi:.1f}"))
            self.details_table.setItem(i, 2, QTableWidgetItem(f"{distance:.2f}"))
        
        self.details_table.resizeColumnsToContents()
    
    def update_visualization(self):
        """Update the position visualization."""
        self.canvas.plot_positions(self.sensor_pos_list, self.device_positions) 