"""
Main Flask application for the Wi-Fi indoor positioning system.
"""

from flask import Flask, render_template, jsonify, request
from flask_bootstrap import Bootstrap
from src.reader import RSSIDataReader
from src.rssi_to_distance import RSSIConverter
from src.trilateration import TrilaterationEngine
import os
import json

app = Flask(__name__)
bootstrap = Bootstrap(app)

# Initialize components
reader = RSSIDataReader("data")
rssi_converter = RSSIConverter()
sensor_positions = reader.get_sensor_positions()
sensor_pos_list = list(sensor_positions.values())
trilateration_engine = TrilaterationEngine(sensor_pos_list)

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/api/devices')
def get_devices():
    """Get all devices with their positions and measurements."""
    data = reader.load_all_data()

    # Load overrides if exist
    override_path = os.path.join("data", "overrides.json")
    overrides = {}
    if os.path.exists(override_path):
        with open(override_path, "r") as f:
            overrides = json.load(f)

    # Get all device IDs from the dataset
    all_devices = set()
    for df in data.values():
        all_devices.update(df['device_id'].unique())

    devices = []
    for device_id in all_devices:
        measurements = reader.get_latest_measurements(device_id)
        if len(measurements) >= 3:
            distances = list(rssi_converter.convert_measurements(measurements).values())
            position = trilateration_engine.estimate_position(distances)

            # Apply override if available
            if device_id in overrides:
                position = (overrides[device_id]["x"], overrides[device_id]["y"])

            device_info = {
                'id': device_id,
                'position': {'x': position[0], 'y': position[1]},
                'measurements': [
                    {
                        'sensor_id': sensor_id,
                        'rssi': rssi,
                        'distance': rssi_converter.rssi_to_distance(rssi)
                    }
                    for sensor_id, rssi in measurements.items()
                ]
            }
            devices.append(device_info)

    return jsonify(devices)

@app.route('/api/sensors')
def get_sensors():
    """Get all sensor positions."""
    sensors = [
        {'id': sensor_id, 'position': {'x': pos[0], 'y': pos[1]}}
        for sensor_id, pos in sensor_positions.items()
    ]
    return jsonify(sensors)

@app.route('/api/update_position', methods=['POST'])
def update_position():
    """Update the position of a specific device and store it."""
    data = request.get_json()
    device_id = data['device_id']
    x = data['x']
    y = data['y']

    override_path = os.path.join("data", "overrides.json")
    overrides = {}

    if os.path.exists(override_path):
        with open(override_path, "r") as f:
            overrides = json.load(f)

    overrides[device_id] = {"x": x, "y": y}

    with open(override_path, "w") as f:
        json.dump(overrides, f, indent=2)

    return '', 200

if __name__ == '__main__':
    app.run(debug=True)
