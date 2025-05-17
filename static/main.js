// main.js (Tüm Özelliklerle Tam Sürüm)

let devices = []; // Her cihaz objesi şunları içerecek:
                  // - position_history: tahmini konumlar [{x,y}, ...]
                  // - real_position_history: gerçek konumlar [{x,y}, ...]
                  // - rssi_along_path_history: [ { step: N, real_pos: {x,y}, rssi_values: {sensorId: rssi, ...} }, ... ]
let sensors = [];
let selectedDeviceId = null;
let devicesDataTable = null;

async function loadData() {
    console.log("loadData CALLED");
    try {
        const devicesPromise = fetch('/api/devices').then(r => r.json());
        const sensorsPromise = fetch('/api/sensors').then(r => r.json());
        const [newDevicesData, newSensorsData] = await Promise.all([devicesPromise, sensorsPromise]);

        sensors = newSensorsData;
        console.log("loadData: Sensors fetched", sensors);

        const updatedDevices = newDevicesData.map(newDevice => {
            const existingDevice = devices.find(d => d.id === newDevice.id);
            let estHist = [], realHist = [], rssiPathHist = [];

            if (existingDevice) {
                estHist = existingDevice.position_history || [];
                realHist = existingDevice.real_position_history || [];
                rssiPathHist = existingDevice.rssi_along_path_history || [];
            }

            if (estHist.length === 0 && newDevice.position && typeof newDevice.position.x === 'number') {
                 estHist.push({ ...newDevice.position });
            }
            if (realHist.length === 0 && newDevice.real_position && typeof newDevice.real_position.x === 'number') {
                 realHist.push({ ...newDevice.real_position });
            }
            // rssi_along_path_history, updateDeviceLocation'da aktif olarak doldurulacak.
            // loadData'da sadece var olanı koruyoruz.

            return {
                ...newDevice,
                position_history: estHist,
                real_position_history: realHist,
                rssi_along_path_history: rssiPathHist
            };
        });
        devices = updatedDevices;
        console.log("loadData: Global devices array updated", JSON.parse(JSON.stringify(devices)));

        if (devicesDataTable) { devicesDataTable.destroy(); }
        $("#devicesTable tbody").empty();
        devicesDataTable = $('#devicesTable').DataTable({
            pageLength: 8,
            data: devices.map(device => {
                if (!device || !device.id || !device.position || typeof device.position.x !== 'number') {
                    return { id_display: `<span class="text-danger">Error</span>`, x_pos: 'N/A', y_pos: 'N/A', id_hidden: 'error-' + Math.random().toString(36).substr(2,9) };
                }
                return {
                    id_display: `<span class="text-primary fw-bold" style="cursor:pointer;">${device.id.slice(-8)}</span>`,
                    x_pos: device.position.x.toFixed(2),
                    y_pos: device.position.y.toFixed(2),
                    id_hidden: device.id
                };
            }),
            columns: [
                { data: 'id_display', title: 'Device ID' }, { data: 'x_pos', title: 'X (m)' }, { data: 'y_pos', title: 'Y (m)' }
            ],
            createdRow: function(row, data, dataIndex) {
                if (data && data.id_hidden) $(row).attr('data-id', data.id_hidden);
            }
        });

        const sensorMapTraces = sensors.map(sensor => ({
            x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
            name: sensor.id, text: [sensor.id], textposition: 'bottom right',
            marker: { symbol: 'triangle-up', size: 18, color: '#dc3545' }
        }));
        let deviceMapTraces = [];
        devices.forEach(device => {
            if (device && device.position && typeof device.position.x === 'number') {
                deviceMapTraces.push({
                    x: [device.position.x], y: [device.position.y], mode: 'markers+text', type: 'scatter',
                    name: device.id, text: [device.id.slice(-6)], textposition: 'top center',
                    marker: { size: 12, color: '#0d6efd' }
                });
                // Ana haritaya son hareketi gösteren yol (isteğe bağlı)
                if (device.position_history && device.position_history.length >= 2) {
                    const lastPos = device.position_history[device.position_history.length - 1];
                    const prevPos = device.position_history[device.position_history.length - 2];
                    if (prevPos && lastPos && (prevPos.x !== lastPos.x || prevPos.y !== lastPos.y)) {
                        deviceMapTraces.push({
                            x: [prevPos.x, lastPos.x], y: [prevPos.y, lastPos.y],
                            mode: 'lines', type: 'scatter', line: { color: '#0d6efd', width: 2, dash: 'dot' },
                            hoverinfo: 'skip', showlegend: false
                        });
                    }
                }
            }
        });
        const mapLayout = {
            margin: { t: 40, b: 50, l: 60, r: 10 },
            xaxis: { title: 'X Location (m)' }, yaxis: { title: 'Y Location (m)', scaleanchor: "x", scaleratio: 1 },
            showlegend: false, hovermode: 'closest', plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa',
            font: { family: 'Inter, Arial, sans-serif' }
        };
        Plotly.react('map', [...sensorMapTraces, ...deviceMapTraces], mapLayout, { responsive: true, displaylogo: false });
        console.log("loadData: Main map updated");

    } catch (error) { console.error("Error in loadData:", error); }
}

async function updateDeviceLocation() {
    console.log("updateDeviceLocation CALLED");
    const xVal = document.getElementById("manualX").value;
    const yVal = document.getElementById("manualY").value;
    const newRealX = parseFloat(xVal);
    const newRealY = parseFloat(yVal);

    if (!selectedDeviceId || isNaN(newRealX) || isNaN(newRealY)) {
        alert("Invalid position input."); return;
    }

    try {
        const res = await fetch('/api/update_position', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: selectedDeviceId, x: newRealX, y: newRealY })
        });
        if (!res.ok) { alert(`Update failed: ${await res.text()}`); return; }
        console.log("Backend real_position update successful.");

        const updatedDevicesResponse = await fetch('/api/devices');
        if (!updatedDevicesResponse.ok) { alert("Failed to fetch updated device data."); return; }
        const newApiDeviceData = await updatedDevicesResponse.json();
        console.log("Fetched new API data after update:", newApiDeviceData);

        devices = devices.map(existingDevice => {
            const updatedDataForThisDevice = newApiDeviceData.find(nd => nd.id === existingDevice.id);
            if (updatedDataForThisDevice && updatedDataForThisDevice.id === selectedDeviceId) { // Sadece güncellenen cihaz için geçmişi değiştir
                let estHistory = existingDevice.position_history || [];
                if (updatedDataForThisDevice.position && typeof updatedDataForThisDevice.position.x === 'number' && (estHistory.length === 0 ||
                    (estHistory[estHistory.length - 1].x !== updatedDataForThisDevice.position.x ||
                     estHistory[estHistory.length - 1].y !== updatedDataForThisDevice.position.y))) {
                    estHistory = [...estHistory, { ...updatedDataForThisDevice.position }];
                }

                let realHist = existingDevice.real_position_history || [];
                if (updatedDataForThisDevice.real_position && typeof updatedDataForThisDevice.real_position.x === 'number' && (realHist.length === 0 ||
                    (realHist[realHist.length-1].x !== updatedDataForThisDevice.real_position.x ||
                     realHist[realHist.length-1].y !== updatedDataForThisDevice.real_position.y)) ){
                    realHist = [...realHist, {...updatedDataForThisDevice.real_position}];
                }

                let rssiPathHist = existingDevice.rssi_along_path_history || [];
                const currentStep = rssiPathHist.length + 1;
                const newRssiMeasurements = {};
                if (updatedDataForThisDevice.measurements) {
                    updatedDataForThisDevice.measurements.forEach(m => {
                        if (typeof m.rssi === 'number') newRssiMeasurements[m.sensor_id] = m.rssi;
                    });
                }
                if (Object.keys(newRssiMeasurements).length > 0 && updatedDataForThisDevice.real_position) {
                     rssiPathHist.push({
                        step: currentStep,
                        real_pos: { ...updatedDataForThisDevice.real_position },
                        rssi_values: newRssiMeasurements
                    });
                }
                // const MAX_HISTORY = 20;
                // if (estHistory.length > MAX_HISTORY) estHistory = estHistory.slice(-MAX_HISTORY);
                // if (realHist.length > MAX_HISTORY) realHist = realHist.slice(-MAX_HISTORY);
                // if (rssiPathHist.length > MAX_HISTORY) rssiPathHist = rssiPathHist.slice(-MAX_HISTORY);

                return { ...updatedDataForThisDevice, position_history: estHistory, real_position_history: realHist, rssi_along_path_history: rssiPathHist };
            }
            return existingDevice; // Diğer cihazların geçmişini koru
        });
        const updatedDeviceForLog = devices.find(d => d.id === selectedDeviceId);
        console.log("Global device updated with histories:", JSON.parse(JSON.stringify(updatedDeviceForLog)));

        await loadData(); // loadData şimdi güncellenmiş 'devices' dizisini kullanacak

        const deviceForModal = devices.find(d => d.id === selectedDeviceId);
        if (deviceForModal) {
            showDeviceDetails(deviceForModal.id);
        }
    } catch (error) { console.error("Error in updateDeviceLocation:", error); }
}

function showDeviceDetails(deviceId) {
    console.log("showDeviceDetails CALLED for deviceId:", deviceId);
    selectedDeviceId = deviceId;
    const device = devices.find(d => d.id === deviceId);
    if (!device) { console.warn("Device not found in showDeviceDetails:", deviceId); return; }

    const realX = (device.real_position && typeof device.real_position.x === 'number') ? device.real_position.x.toFixed(2) : 'N/A';
    const realY = (device.real_position && typeof device.real_position.y === 'number') ? device.real_position.y.toFixed(2) : 'N/A';
    const estX = (device.position && typeof device.position.x === 'number') ? device.position.x.toFixed(2) : 'N/A';
    const estY = (device.position && typeof device.position.y === 'number') ? device.position.y.toFixed(2) : 'N/A';

    document.getElementById("manualX").value = (device.real_position && typeof device.real_position.x === 'number') ? device.real_position.x.toFixed(2) : "";
    document.getElementById("manualY").value = (device.real_position && typeof device.real_position.y === 'number') ? device.real_position.y.toFixed(2) : "";

    $('#deviceDetails').html(`
        <div class="row g-3">
            <div class="col-md-6">
                <div class="card border-primary"><div class="card-body">
                    <h6 class="card-title text-primary">Device ID</h6><p class="mb-1"><code>${device.id}</code></p>
                    <h6 class="card-title text-success mt-3">Real Location</h6><p>(${realX}, ${realY})</p>
                    <h6 class="card-title text-primary mt-3">Estimated Location</h6><p>(${estX}, ${estY})</p>
                </div></div>
            </div>
            <div class="col-md-6">
                <div class="card border-info"><div class="card-body">
                    <h6 class="card-title text-info">Sensor Measurements</h6>
                    <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Sensor</th><th>RSSI (dBm)</th><th>Distance (m)</th></tr></thead><tbody>
                        ${(device.measurements || []).map(m => `<tr><td>${m.sensor_id}</td><td>${typeof m.rssi === 'number' ? m.rssi.toFixed(1) : 'N/A'}</td><td>${typeof m.distance === 'number' ? m.distance.toFixed(2) : 'N/A'}</td></tr>`).join('')}
                    </tbody></table>
                </div></div>
            </div>
        </div>`);

    setTimeout(() => {
        if (document.getElementById('trilaterationPlot')) showTrilaterationPlotly(device);
        if (document.getElementById('devicePathPlot')) showDevicePathHistoryPlot(device);
        if (document.getElementById('rssiAlongPathPlot')) showRssiAlongPathPlot(device);
    }, 100);

    const modalEl = document.getElementById('deviceModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modalInstance.show();
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event");
    loadData();
    $('#devicesTable tbody').on('click', 'tr', function () {
        const deviceId = $(this).attr('data-id');
        if (deviceId) showDeviceDetails(deviceId);
    });
    // setInterval(loadData, 30000); // Test ederken kapalı tutun
});

// TRILATERASYON GRAFİĞİ FONKSİYONU (Sizin sağladığınız ve biraz düzenlenmiş hali)
function showTrilaterationPlotly(device) {
    console.log("showTrilaterationPlotly CALLED for device:", device.id);
    const plotDiv = document.getElementById('trilaterationPlot');
    if (!plotDiv) { console.error("trilaterationPlot element not found."); return; }
    try { Plotly.purge(plotDiv); } catch(e) {}

    if (!device || !device.position || !device.real_position || !device.measurements ||
        typeof device.position.x !== 'number' || typeof device.real_position.x !== 'number') {
        plotDiv.innerHTML = '<p class="text-danger">Error: Insufficient or invalid data for trilateration plot.</p>';
        document.getElementById('deviceInfoOnChart').innerHTML = '';
        return;
    }

    const infoHtml = `<b>Device:</b> <code>${device.id}</code><br>
                      <b>Estimated:</b> (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})<br>
                      <b>Real:</b> (${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})`;
    document.getElementById('deviceInfoOnChart').innerHTML = infoHtml;

    let traces = [];
    (device.measurements || []).forEach((m, idx) => {
        const sensor = sensors.find(s => s.id === m.sensor_id);
        if (!sensor || !sensor.position || typeof sensor.position.x !== 'number' || typeof m.distance !== 'number') return;
        traces.push({
            x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
            marker: { symbol: 'triangle-up', size: 16, color: '#dc3545' }, text: [m.sensor_id],
            textposition: 'bottom right', name: `Sensor ${m.sensor_id}`,
            hovertemplate: `${m.sensor_id}<br>X: ${sensor.position.x.toFixed(2)}<br>Y: ${sensor.position.y.toFixed(2)}<extra></extra>`
        });
        const theta = Array.from({ length: 100 }, (_, i) => 2 * Math.PI * i / 100);
        traces.push({
            x: theta.map(t => sensor.position.x + m.distance * Math.cos(t)),
            y: theta.map(t => sensor.position.y + m.distance * Math.sin(t)),
            mode: 'lines', type: 'scatter',
            line: { color: `hsl(${idx * (360 / (device.measurements.length || 1))},70%,60%)`, width: 2, dash: 'dot' },
            name: `Dist to ${m.sensor_id}`, hoverinfo: 'text', showlegend: true
        });
    });
    traces.push({
        x: [device.position.x], y: [device.position.y], mode: 'markers+text', type: 'scatter',
        marker: { size: 18, color: '#0d6efd' }, text: ['Estimated'], textposition: 'top center', name: 'Estimated',
        hovertemplate: `Est: (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})<extra></extra>`
    });
    // traces.push({
    //     x: [device.real_position.x], y: [device.real_position.y], mode: 'markers+text', type: 'scatter',
    //     marker: { size: 18, color: '#198754' }, text: ['Real'], textposition: 'top right', name: 'Real',
    //     hovertemplate: `Real: (${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})<extra></extra>`
    // });

    let allX = [], allY = [];
    traces.forEach(trace => {
        if (trace.x) allX.push(...(Array.isArray(trace.x) ? trace.x : [trace.x]).filter(v => typeof v === 'number' && !isNaN(v)));
        if (trace.y) allY.push(...(Array.isArray(trace.y) ? trace.y : [trace.y]).filter(v => typeof v === 'number' && !isNaN(v)));
    });
    const layoutTrilateration = {
        margin: { t: 20, b: 40, l: 40, r: 20 },
        xaxis: { title: 'X (m)', zeroline: false, scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (m)', zeroline: false },
        plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa', font: { family: 'Inter, Arial, sans-serif' },
        showlegend: false, height: 320, legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 }
    };
    if (allX.length > 0) {
        const xMin = Math.min(...allX), xMax = Math.max(...allX), yMin = Math.min(...allY), yMax = Math.max(...allY);
        const xR = xMax - xMin, yR = yMax - yMin;
        const pad = Math.max(2, xR * 0.15, yR * 0.15);
        layoutTrilateration.xaxis.range = [xMin - pad, xMax + pad];
        layoutTrilateration.yaxis.range = [yMin - pad, yMax + pad];
    } else { layoutTrilateration.xaxis.range = [-10, 10]; layoutTrilateration.yaxis.range = [-10, 10]; }
    Plotly.newPlot(plotDiv, traces, layoutTrilateration, { displayModeBar: false, responsive: true, displaylogo: false });
}

// MATLAB STİLİ CİHAZ YOLU GRAFİĞİ FONKSİYONU
function showDevicePathHistoryPlot(device) {
    console.log("showDevicePathHistoryPlot (MATLAB Style) CALLED for device:", device.id);
    const pathPlotDiv = document.getElementById('devicePathPlot');
    if (!pathPlotDiv) { console.error("devicePathPlot element not found."); return; }
    try { Plotly.purge(pathPlotDiv); } catch(e) {}

    const estHistory = device.position_history; const realHistory = device.real_position_history;
    if ( (!estHistory || estHistory.length < 1) && (!realHistory || realHistory.length < 1) ) {
        pathPlotDiv.innerHTML = '<p class="text-muted text-center">No position history to draw.</p>'; return;
    }
    let plotTraces = [];
        if (sensors && sensors.length > 0) {
        const MAX_HEATMAP_RADIUS = 50; const NUM_HEATMAP_CIRCLES = 5;
        sensors.forEach(sensor => {
            if (sensor.position && typeof sensor.position.x === 'number') {
                for (let i = 1; i <= NUM_HEATMAP_CIRCLES; i++) {
                    const radius = (MAX_HEATMAP_RADIUS / NUM_HEATMAP_CIRCLES) * i;
                    const opacity = 1.0 - ( (i-1) / NUM_HEATMAP_CIRCLES ) * 0.85;
                    const color = `rgba(255, 0, 0, ${opacity * 0.15})`; // Daha saydam kırmızı
                    const theta = Array.from({ length: 50 }, (_, k) => 2 * Math.PI * k / 50); // Daha az nokta
                    plotTraces.push({
                        x: theta.map(t => sensor.position.x + radius * Math.cos(t)),
                        y: theta.map(t => sensor.position.y + radius * Math.sin(t)),
                        mode: 'lines', type: 'scatter', line: { color: color, width: 1 },
                        fill: 'toself', fillcolor: color, hoverinfo: 'skip', showlegend: false
                    });
                }
                plotTraces.push({ // Sensör marker'ı heatmap üzerinde
                    x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
                    name: `Sensor ${sensor.id.slice(-4)}`, text: [sensor.id.slice(-4)], textposition: 'bottom right',
                    marker: { symbol: 'triangle-up', size: 12, color: 'red', line: {color: 'white', width:1} },
                    customdata: [`S: ${sensor.id}\n(${sensor.position.x.toFixed(1)},${sensor.position.y.toFixed(1)})`],
                    hovertemplate: '%{customdata}<extra></extra>'
                });
            }
        });
    }
    if (realHistory && realHistory.length >= 1) {
        plotTraces.push({
            x: realHistory.map(p => p.x), y: realHistory.map(p => p.y),
            mode: realHistory.length >=2 ? 'lines+markers' : 'markers', type: 'scatter', name: 'Real Location',
            line: { color: 'blue', width: 2 }, marker: { color: 'blue', size: 5 }
        });
    }
    if (estHistory && estHistory.length >= 1) {
        plotTraces.push({
            x: estHistory.map(p => p.x), y: estHistory.map(p => p.y),
            mode: 'markers', type: 'scatter', name: 'Estimated Positions',
            marker: { color: 'green', size: 7, symbol: 'circle-open', line: { color: 'green', width: 1 }},
            text: estHistory.map((p, i) => `Estimation ${i+1}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`), hoverinfo: 'text'
        });
    }
    if (sensors && sensors.length > 0) {
        sensors.forEach(sensor => {
            if (sensor.position && typeof sensor.position.x === 'number') {
                plotTraces.push({
                    x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
                    name: `${sensor.id.slice(-7)}`, text: '', textposition: 'bottom right',
                    marker: { symbol: 'triangle-up', size: 12, color: 'red' }
                });
            }
        });
    }
    if (plotTraces.length === 0) { pathPlotDiv.innerHTML = '<p class="text-muted text-center">No data to plot.</p>'; return; }
    const layoutPath = {
        margin: { t: 30, b: 40, l: 50, r: 20 },
        xaxis: { title: 'X (m)', zeroline: true, showgrid: true, scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (m)', zeroline: true, showgrid: true },
        plot_bgcolor: 'white', paper_bgcolor: 'white', font: { family: 'Arial, sans-serif', size: 10 },
        showlegend: false, legend: { x: 1, y: 1, xanchor: 'right', yanchor: 'top', bgcolor: 'rgba(255,255,255,0.7)' }, height: 280
    };
    let allXForRange = [], allYForRange = [];
    plotTraces.forEach(trace => {
        if (trace.x) allXForRange.push(...(Array.isArray(trace.x) ? trace.x : [trace.x]).filter(v => typeof v === 'number' && !isNaN(v)));
        if (trace.y) allYForRange.push(...(Array.isArray(trace.y) ? trace.y : [trace.y]).filter(v => typeof v === 'number' && !isNaN(v)));
    });
    if (allXForRange.length > 0) {
        const xMin = Math.min(...allXForRange), xMax = Math.max(...allXForRange);
        const yMin = Math.min(...allYForRange), yMax = Math.max(...allYForRange);
        const xR = xMax - xMin, yR = yMax - yMin;
        const xP = xR > 0.1 ? xR * 0.15 : 1, yP = yR > 0.1 ? yR * 0.15 : 1;
        layoutPath.xaxis.range = [xMin - Math.max(1,xP), xMax + Math.max(1,xP)];
        layoutPath.yaxis.range = [yMin - Math.max(1,yP), yMax + Math.max(1,yP)];
    } else { layoutPath.xaxis.range = [-10, 10]; layoutPath.yaxis.range = [-10, 10]; }
    Plotly.newPlot(pathPlotDiv, plotTraces, layoutPath, { displayModeBar: true, responsive: true, displaylogo: false });
    
}

// RSSI ALONG PATH GRAFİĞİ FONKSİYONU
function showRssiAlongPathPlot(device) {
    console.log("showRssiAlongPathPlot CALLED for device:", device.id);
    const plotDiv = document.getElementById('rssiAlongPathPlot');
    if (!plotDiv) { console.error("rssiAlongPathPlot element not found."); return; }
    try { Plotly.purge(plotDiv); } catch(e) {}

    const history = device.rssi_along_path_history;
    if (!history || !Array.isArray(history) || history.length < 1) {
        plotDiv.innerHTML = '<p class="text-muted text-center">No RSSI history along path available.</p>'; return;
    }
    let plotTraces = []; const steps = history.map(h => h.step);
    if (sensors && sensors.length > 0) {
        sensors.forEach(sensor => {
            const sensorId = sensor.id;
            const rssiValuesForSensor = history.map(h => h.rssi_values && h.rssi_values[sensorId] !== undefined ? h.rssi_values[sensorId] : null);
            if (rssiValuesForSensor.some(val => val !== null)) {
                plotTraces.push({ x: steps, y: rssiValuesForSensor, mode: 'lines', type: 'scatter', name: `Sensor ${sensorId.slice(-4)}` });
            }
        });
    }
    if (plotTraces.length === 0) { plotDiv.innerHTML = '<p class="text-muted text-center">No RSSI data for sensors yet.</p>'; return; }
    const layoutRssi = {
        title: 'RSSI from each Sensor along Device Path', margin: { t: 40, b: 50, l: 50, r: 20 },
        xaxis: { title: 'Path Step' }, yaxis: { title: 'RSSI (dBm)' },
        plot_bgcolor: 'white', paper_bgcolor: 'white', showlegend: false,
        legend: { x: 1, y: 1, xanchor: 'right', yanchor: 'top' }, height: 300
    };
    Plotly.newPlot(plotDiv, plotTraces, layoutRssi, { responsive: true, displaylogo: false });
}