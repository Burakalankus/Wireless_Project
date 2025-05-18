# app.py (Sadece /api/devices fonksiyonu güncellendi)

from flask import Flask, render_template, jsonify, request
from flask_bootstrap import Bootstrap
from src.reader import RSSIDataReader
from src.rssi_to_distance import RSSIConverter
from src.trilateration import TrilaterationEngine
import os
import json
import csv
from datetime import datetime
import pandas as pd # Eğer zaten import edilmediyse
import glob # Eğer zaten import edilmediyse

app = Flask(__name__)
bootstrap = Bootstrap(app)

# Initialize components
reader = RSSIDataReader("data")
sensor_positions = reader.get_sensor_positions()
# RSSIConverter'ı başlatırken parametreleri buradan ayarlayabilirsiniz
# Örneğin: rssi_converter = RSSIConverter(path_loss_exponent=2.5, shadowing_std_dev_dB=4.0)
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

    devices_list = [] # 'devices' adını değiştirdim, Flask'ın 'devices' ile çakışmaması için
    for device_id, device_data in overrides.items(): # Artık 'pos' yerine 'device_data' alıyoruz
        x = device_data.get("x") # .get() kullanarak anahtar yoksa hata almayız
        y = device_data.get("y")
        device_type = device_data.get("type", "unknown") # 'type' alanını al, yoksa 'unknown' ata

        if x is None or y is None:
            print(f"Warning: Device {device_id} in overrides.json is missing x or y coordinates.")
            continue # Bu cihazı atla

        rssi_dict = rssi_converter.simulate_rssi_from_position((x, y))
        distances = {sid: rssi_converter.rssi_to_distance(rssi) for sid, rssi in rssi_dict.items()}
        
        # Trilaterasyon için en az 3 geçerli mesafe olmalı
        valid_distances = {k: v for k, v in distances.items() if v is not None and not (isinstance(v, float) and pd.isna(v))}
        
        estimated_pos_tuple = (None, None) # Varsayılan
        if len(valid_distances) >= 3 : # Genellikle trilaterasyon için en az 3 nokta gerekir
            try:
                # TrilaterationEngine'a sadece değerleri (mesafeleri) gönder
                estimated_pos_tuple = trilateration_engine.estimate_position(list(valid_distances.values()))
            except ValueError as e:
                print(f"Trilateration error for device {device_id}: {e}")
            except Exception as e:
                print(f"Unexpected error during trilateration for device {device_id}: {e}")
        else:
            print(f"Not enough valid distances for trilateration for device {device_id}. Found {len(valid_distances)} valid distances.")


        # estimated_pos_tuple'ın None olup olmadığını kontrol et
        est_x = estimated_pos_tuple[0] if estimated_pos_tuple and estimated_pos_tuple[0] is not None else None
        est_y = estimated_pos_tuple[1] if estimated_pos_tuple and estimated_pos_tuple[1] is not None else None


        device_info = {
            'id': device_id,
            'real_position': {'x': x, 'y': y},
            'position': {'x': est_x, 'y': est_y}, # Tahmini konum
            'type': device_type,  # YENİ: Cihaz türünü ekle
            'measurements': [
                {
                    'sensor_id': sid,
                    'rssi': rssi_dict.get(sid), # .get() ile anahtar yoksa None döner
                    'distance': distances.get(sid)
                }
                # Sadece rssi_dict'te olan sensörler için ölçüm ekle
                for sid in rssi_dict 
            ]
        }
        devices_list.append(device_info)

    return jsonify(devices_list)


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

    # Cihazın mevcut 'type' bilgisini koru, eğer varsa
    current_type = "unknown" # Varsayılan
    if device_id in overrides and "type" in overrides[device_id]:
        current_type = overrides[device_id]["type"]
    
    overrides[device_id] = {"x": x, "y": y, "type": current_type} # 'type' bilgisini de kaydet

    with open(override_path, "w") as f:
        json.dump(overrides, f, indent=2)

    # ... (loglama kısmı aynı kalır) ...
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

@app.route('/api/device_rssi_logs/<device_id>')
def get_device_rssi_logs(device_id):
    # ... (bu fonksiyon bir önceki yanıttaki gibi kalır) ...
    log_dir = os.path.join("data", "logs")
    all_sensor_logs = {}
    if not os.path.exists(log_dir): return jsonify({"error": "Logs directory not found"}), 404
    log_files = glob.glob(os.path.join(log_dir, "*.csv"))
    for log_file in log_files:
        sensor_id_from_filename = os.path.basename(log_file).replace(".csv", "")
        try:
            df = pd.read_csv(log_file)
            if not {'timestamp', 'device_id', 'rssi'}.issubset(df.columns): continue
            device_specific_logs = df[df['device_id'] == device_id]
            if not device_specific_logs.empty:
                sensor_data = device_specific_logs.sort_values(by='timestamp')[['timestamp', 'rssi']].to_dict(orient='records')
                all_sensor_logs[sensor_id_from_filename] = sensor_data
        except Exception as e: print(f"Error processing {log_file}: {e}")
    return jsonify(all_sensor_logs if all_sensor_logs else {})


if __name__ == '__main__':
    app.run(debug=True)