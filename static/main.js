let devices = [];
let sensors = [];
let selectedDeviceId = null;

async function loadData() {
    [devices, sensors] = await Promise.all([
        fetch('/api/devices').then(r => r.json()),
        fetch('/api/sensors').then(r => r.json())
    ]);

    const tbody = $("#devicesTable tbody");
    tbody.empty();
    devices.forEach(device => {
        tbody.append(`
            <tr data-id="${device.id}">
                <td><span class="text-primary fw-bold" style="cursor:pointer;">${device.id.slice(-8)}</span></td>
                <td>${device.position.x.toFixed(2)}</td>
                <td>${device.position.y.toFixed(2)}</td>
            </tr>
        `);
    });
    $('#devicesTable').DataTable({ destroy: true, pageLength: 8 });

    $('#devicesTable tbody').on('click', 'tr', function () {
        const deviceId = $(this).data('id');
        showDeviceDetails(deviceId);
    });

    const sensorTraces = sensors.map(sensor => ({
        x: [sensor.position.x],
        y: [sensor.position.y],
        mode: 'markers+text',
        type: 'scatter',
        name: sensor.id,
        text: [sensor.id],
        textposition: 'bottom right',
        marker: {
            symbol: 'triangle-up',
            size: 18,
            color: '#dc3545'
        }
    }));
    const deviceTraces = devices.map(device => ({
        x: [device.position.x],
        y: [device.position.y],
        mode: 'markers+text',
        type: 'scatter',
        name: device.id,
        text: [device.id.slice(-6)],
        textposition: 'top center',
        marker: {
            size: 12,
            color: '#0d6efd'
        }
    }));
    const layout = {
        margin: { t: 40 },
        xaxis: { title: 'X Position (m)' },
        yaxis: { title: 'Y Position (m)' },
        showlegend: false,
        hovermode: 'closest',
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#f8f9fa',
        font: { family: 'Inter, Arial, sans-serif' }
    };

    Plotly.react('map', [...sensorTraces, ...deviceTraces], layout, { responsive: true, displaylogo: false });
}

function showDeviceDetails(deviceId) {
    selectedDeviceId = deviceId;
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    document.getElementById("manualX").value = device.position.x.toFixed(2);
    document.getElementById("manualY").value = device.position.y.toFixed(2);

    let html = `
        <div class="row g-3">
            <div class="col-md-6">
                <div class="card border-primary">
                    <div class="card-body">
                        <h6 class="card-title text-primary">Device ID</h6>
                        <p class="mb-1"><code>${device.id}</code></p>
                        <h6 class="card-title text-primary mt-3">Estimated Position</h6>
                        <p>(${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})</p>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card border-info">
                    <div class="card-body">
                        <h6 class="card-title text-info">Sensor Measurements</h6>
                        <table class="table table-sm table-bordered mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Sensor</th>
                                    <th>RSSI (dBm)</th>
                                    <th>Distance (m)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${device.measurements.map(m => `
                                    <tr>
                                        <td>${m.sensor_id}</td>
                                        <td>${m.rssi.toFixed(1)}</td>
                                        <td>${m.distance.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('#deviceDetails').html(html);
    setTimeout(() => showTrilaterationPlotly(device), 250);
    const modal = new bootstrap.Modal(document.getElementById('deviceModal'));
    modal.show();
}

function updateDevicePosition() {
    const x = parseFloat(document.getElementById("manualX").value);
    const y = parseFloat(document.getElementById("manualY").value);

    if (!selectedDeviceId || isNaN(x) || isNaN(y)) {
        alert("Invalid position input.");
        return;
    }

    fetch('/api/update_position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: selectedDeviceId, x: x, y: y })
    }).then(res => {
        if (res.ok) {
            alert("Position updated.");
            loadData();
        } else {
            alert("Update failed.");
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setInterval(loadData, 10000); // otomatik güncelleme (10 saniye)
});
function showTrilaterationPlotly(device) {
    const infoHtml = `<b>Device:</b> <code>${device.id}</code> | <b>Estimated Position:</b> (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})`;
    document.getElementById('deviceInfoOnChart').innerHTML = infoHtml;

    let traces = [];

    device.measurements.forEach((m, idx) => {
        const sensor = sensors.find(s => s.id === m.sensor_id);
        if (!sensor) return;

        // sensor noktası
        traces.push({
            x: [sensor.position.x],
            y: [sensor.position.y],
            mode: 'markers+text',
            type: 'scatter',
            marker: { symbol: 'triangle-up', size: 16, color: '#dc3545' },
            text: [m.sensor_id],
            textposition: 'bottom right',
            name: m.sensor_id,
            hovertemplate: `Sensor: ${m.sensor_id}<br>X: ${sensor.position.x.toFixed(2)}<br>Y: ${sensor.position.y.toFixed(2)}<extra></extra>`
        });

        // çember (mesafe)
        const theta = Array.from({length: 100}, (_, i) => 2 * Math.PI * i / 100);
        const circleX = theta.map(t => sensor.position.x + m.distance * Math.cos(t));
        const circleY = theta.map(t => sensor.position.y + m.distance * Math.sin(t));
        traces.push({
            x: circleX,
            y: circleY,
            mode: 'lines',
            line: { color: `hsl(${idx * 90},70%,60%)`, width: 2, dash: 'dot' },
            name: `Distance to ${m.sensor_id}`,
            hoverinfo: 'skip',
            showlegend: false
        });
    });

    // cihaz noktası
    traces.push({
        x: [device.position.x],
        y: [device.position.y],
        mode: 'markers+text',
        type: 'scatter',
        marker: { size: 18, color: '#0d6efd' },
        text: ['Device'],
        textposition: 'top center',
        name: 'Device',
        hovertemplate: `Device<br>X: ${device.position.x.toFixed(2)}<br>Y: ${device.position.y.toFixed(2)}<extra></extra>`
    });

    const allX = traces.flatMap(t => t.x);
    const allY = traces.flatMap(t => t.y);

    const layout = {
        margin: { t: 20, b: 20, l: 40, r: 20 },
        xaxis: {
            title: 'X (m)',
            zeroline: false,
            range: [Math.min(...allX) - 2, Math.max(...allX) + 2],
            scaleanchor: 'y',
            scaleratio: 1
        },
        yaxis: {
            title: 'Y (m)',
            zeroline: false,
            range: [Math.min(...allY) - 2, Math.max(...allY) + 2]
        },
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#f8f9fa',
        font: { family: 'Inter, Arial, sans-serif' },
        showlegend: false,
        height: 320
    };

    Plotly.newPlot('trilaterationPlot', traces, layout, {
        displayModeBar: false,
        responsive: true,
        displaylogo: false
    });
}
let draggingDeviceId = null;
let currentDeviceTraces = [];  // güncel trace'ları frontendde güncellemek için

document.getElementById('map').on('plotly_click', function (event) {
    const point = event.points[0];
    const clickedId = point.data.name;

    // Tıklanan cihaz ise: taşıma moduna geç
    const clickedDevice = devices.find(d => d.id === clickedId);
    if (clickedDevice) {
        draggingDeviceId = clickedDevice.id;
        alert(`Selected device ${clickedId.slice(-6)}.\nClick another spot on the map to move it.`);
        return;
    }

    // Taşıma modundaysa ve tıklanan yer cihaz değilse: frontend'de taşı
    if (draggingDeviceId) {
        const newX = point.x;
        const newY = point.y;

        const deviceIndex = devices.findIndex(d => d.id === draggingDeviceId);
        if (deviceIndex === -1) return;

        // frontend verisini güncelle
        devices[deviceIndex].position.x = newX;
        devices[deviceIndex].position.y = newY;

        // sadece cihazları yeniden çiz (sensör sabit kalır)
        const deviceTraces = devices.map(device => ({
            x: [device.position.x],
            y: [device.position.y],
            mode: 'markers+text',
            type: 'scatter',
            name: device.id,
            text: [device.id.slice(-6)],
            textposition: 'top center',
            marker: {
                size: 12,
                color: '#0d6efd'
            }
        }));

        // sensor trace'ları önceden saklandıysa kullan, yoksa baştan oluştur
        if (currentDeviceTraces.length === 0) {
            currentDeviceTraces = sensors.map(sensor => ({
                x: [sensor.position.x],
                y: [sensor.position.y],
                mode: 'markers+text',
                type: 'scatter',
                name: sensor.id,
                text: [sensor.id],
                textposition: 'bottom right',
                marker: {
                    symbol: 'triangle-up',
                    size: 18,
                    color: '#dc3545'
                }
            }));
        }

        Plotly.react('map', [...currentDeviceTraces, ...deviceTraces], {
            margin: { t: 40 },
            xaxis: { title: 'X Position (m)' },
            yaxis: { title: 'Y Position (m)' },
            showlegend: false,
            hovermode: 'closest',
            plot_bgcolor: '#f8f9fa',
            paper_bgcolor: '#f8f9fa',
            font: { family: 'Inter, Arial, sans-serif' }
        });

        draggingDeviceId = null; // taşıma bitti
    }
});

