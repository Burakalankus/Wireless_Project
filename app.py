from flask import Flask, render_template, jsonify, request
from flask_bootstrap import Bootstrap
from src.reader import RSSIDataReader
from src.rssi_to_distance import RSSIConverter
from src.trilateration import TrilaterationEngine
import os
import json
import csv
from datetime import datetime

app = Flask(__name__)
bootstrap = Bootstrap(app)

# Initialize components
reader = RSSIDataReader("data")
sensor_positions = reader.get_sensor_positions()
rssi_converter = RSSIConverter()
rssi_converter.set_sensor_positions(sensor_positions)
trilateration_engine = TrilaterationEngine(list(sensor_positions.values()))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/sensors')
def get_sensors():
    sensors = [{'id': sid, 'position': {'x': pos[0], 'y': pos[1]}} for sid, pos in sensor_positions.items()]
    return jsonify(sensors)

@app.route('/api/devices')
def get_devices():
    override_path = os.path.join("data", "overrides.json")
    if os.path.exists(override_path):
        with open(override_path, "r") as f:
            overrides = json.load(f)
    else:
        overrides = {}

    devices = []
    for device_id, pos in overrides.items():
        x, y = pos["x"], pos["y"]
        rssi_dict = rssi_converter.simulate_rssi_from_position((x, y))
        distances = {sid: rssi_converter.rssi_to_distance(rssi) for sid, rssi in rssi_dict.items()}
        estimated_pos = trilateration_engine.estimate_position(list(distances.values()))

        device_info = {
            'id': device_id,
            'real_position': {'x': x, 'y': y},
            'position': {'x': estimated_pos[0], 'y': estimated_pos[1]},
            'measurements': [
                {
                    'sensor_id': sid,
                    'rssi': rssi_dict[sid],
                    'distance': distances[sid]
                }
                for sid in rssi_dict
            ]
        }
        devices.append(device_info)

    return jsonify(devices)

@app.route('/api/update_position', methods=['POST'])
def update_position():
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

    rssi_dict = rssi_converter.simulate_rssi_from_position((x, y))

    timestamp = datetime.utcnow().isoformat()
    log_dir = os.path.join("data", "logs")
    os.makedirs(log_dir, exist_ok=True)

    for sensor_id, rssi in rssi_dict.items():
        log_file = os.path.join(log_dir, f"{sensor_id}.csv")
        file_exists = os.path.isfile(log_file)

        with open(log_file, "a", newline="") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["timestamp", "device_id", "x", "y", "rssi"])
            writer.writerow([timestamp, device_id, x, y, rssi])

    return '', 200
# app.py dosyanızın sonlarına doğru (if __name__ == '__main__': öncesi)

import pandas as pd # Eğer zaten import edilmediyse
import glob # Eğer zaten import edilmediyse

@app.route('/api/device_rssi_logs/<device_id>')
def get_device_rssi_logs(device_id):
    log_dir = os.path.join("data", "logs")
    all_sensor_logs = {}

    if not os.path.exists(log_dir):
        return jsonify({"error": "Logs directory not found"}), 404

    # Tüm sensor.csv dosyalarını bul
    log_files = glob.glob(os.path.join(log_dir, "*.csv"))

    for log_file in log_files:
        sensor_id_from_filename = os.path.basename(log_file).replace(".csv", "")
        try:
            df = pd.read_csv(log_file)
            # Gerekli kolonların varlığını kontrol et
            if not {'timestamp', 'device_id', 'rssi'}.issubset(df.columns):
                print(f"Skipping {log_file}, missing required columns.")
                continue

            # Belirli device_id için filtrele
            device_specific_logs = df[df['device_id'] == device_id]

            if not device_specific_logs.empty:
                # Timestamp'e göre sırala (isteğe bağlı ama genellikle iyi bir fikir)
                device_specific_logs = device_specific_logs.sort_values(by='timestamp')
                
                # Sadece timestamp ve rssi al
                sensor_data = device_specific_logs[['timestamp', 'rssi']].to_dict(orient='records')
                all_sensor_logs[sensor_id_from_filename] = sensor_data
        except pd.errors.EmptyDataError:
            print(f"Log file {log_file} is empty or unreadable, skipping.")
        except Exception as e:
            print(f"Error processing log file {log_file}: {e}")
            # Hata durumunda bu sensörü atlayabilir veya boş bir liste döndürebilirsiniz
            # all_sensor_logs[sensor_id_from_filename] = [] 

    if not all_sensor_logs:
        # Hiçbir log bulunamadıysa veya sadece hata oluştuysa
        # return jsonify({"message": f"No logs found for device_id: {device_id}"}), 404
        # Boş bir obje döndürmek frontend'de daha kolay işlenebilir
        return jsonify({})


    return jsonify(all_sensor_logs)
if __name__ == '__main__':
    app.run(debug=True)
