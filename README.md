# Wi-Fi Indoor Positioning System

A Python-based indoor positioning system that uses Wi-Fi RSSI (Received Signal Strength Indicator) measurements to estimate device positions in indoor environments.

## Features

- RSSI to distance conversion using the log-distance path loss model
- Trilateration-based position estimation with noise resilience
- Visualization of estimated positions and sensor locations
- Support for ground truth comparison and error calculation
- Modular and extensible architecture

## Project Structure

```
wireless_project/
├── data/                  # For storing RSSI data files
├── src/                   # Source code
│   ├── __init__.py
│   ├── data_loader.py     # Data input handling
│   ├── rssi_processor.py  # RSSI to distance conversion
│   ├── localization.py    # Position estimation algorithms
│   └── visualization.py   # Plotting functions
├── tests/                 # Unit tests
├── main.py               # Main application entry point
├── requirements.txt      # Project dependencies
└── README.md            # Project documentation
```

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Usage

1. Prepare your RSSI data in CSV format with the following columns:

   - timestamp
   - device_id
   - sensor_id
   - rssi

2. Run the main script:

```bash
python main.py
```

## Configuration

The system can be configured by modifying the following parameters in `main.py`:

- `p0`: Reference power at 1m distance (default: -40 dBm)
- `n`: Path loss exponent (default: 2.0)
- Sensor positions: Modify the `sensor_positions` list in the `main()` function

## Extending the System

The modular architecture allows for easy extension:

1. Add new RSSI processing algorithms by extending the `RSSIProcessor` class
2. Implement alternative localization methods in the `LocalizationEngine` class
3. Create custom visualizations by extending the `Visualizer` class
4. Add support for different data formats in the `DataLoader` class

## License

MIT License
