#!/usr/bin/env python3
"""
Main module for the Wi-Fi indoor positioning system.
"""

import sys
from PyQt5.QtWidgets import QApplication
from src.reader import RSSIDataReader
from src.rssi_to_distance import RSSIConverter
from src.trilateration import TrilaterationEngine
from src.gui import MainWindow

def main():
    # Initialize components
    reader = RSSIDataReader("data")
    rssi_converter = RSSIConverter()
    
    # Load sensor positions first
    sensor_positions = reader.get_sensor_positions()
    sensor_pos_list = list(sensor_positions.values())
    
    # Initialize trilateration engine with sensor positions
    trilateration_engine = TrilaterationEngine(sensor_pos_list)
    
    # Create and show GUI
    app = QApplication(sys.argv)
    window = MainWindow(reader, rssi_converter, trilateration_engine)
    window.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main() 