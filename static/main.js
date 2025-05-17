// main.js (MATLAB Stili Path Grafiği ve Sizin Trilaterasyon Grafiğinizle Tam Sürüm)

let devices = [];
let sensors = []; // Bu değişkenin loadData içinde doldurulduğundan emin olun
let selectedDeviceId = null;
let devicesDataTable = null;

async function loadData() {
    console.log("loadData CALLED");
    try {
        const devicesPromise = fetch('/api/devices').then(r => r.json());
        const sensorsPromise = fetch('/api/sensors').then(r => r.json());
        const [newDevicesData, newSensorsData] = await Promise.all([devicesPromise, sensorsPromise]);

        sensors = newSensorsData; // sensors global değişkenini burada dolduruyoruz
        console.log("loadData: Sensors fetched", sensors);

        const updatedDevices = newDevicesData.map(newDevice => {
            const existingDevice = devices.find(d => d.id === newDevice.id);
            let estHistory = [];
            let realHistory = [];

            if (existingDevice) {
                estHistory = existingDevice.position_history || [];
                realHistory = existingDevice.real_position_history || [];
            }

            if (estHistory.length === 0 && newDevice.position && typeof newDevice.position.x === 'number') {
                 estHistory.push({ ...newDevice.position });
            }
            if (realHistory.length === 0 && newDevice.real_position && typeof newDevice.real_position.x === 'number') {
                 realHistory.push({ ...newDevice.real_position });
            }

            return {
                ...newDevice,
                position_history: estHistory,
                real_position_history: realHistory
            };
        });
        devices = updatedDevices;
        console.log("loadData: Global devices array updated", JSON.parse(JSON.stringify(devices)));

        if (devicesDataTable) {
            devicesDataTable.destroy();
        }
        $("#devicesTable tbody").empty();
        devicesDataTable = $('#devicesTable').DataTable({
            pageLength: 8,
            data: devices.map(device => {
                if (!device || !device.id || !device.position || device.position.x === undefined || device.position.y === undefined) {
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
            }
        });
        const mapLayout = {
            margin: { t: 40, b: 20, l: 60, r: 10 },
            xaxis: { title: 'X Location (m)' },
            yaxis: { title: 'Y Location (m)', scaleanchor: "x", scaleratio: 1 },
            showlegend: false, hovermode: 'closest',
            plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa',
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
        if (!res.ok) { alert(`Update failed: ${res.status}`); return; }
        console.log("Backend real_position update successful.");

        const updatedDevicesResponse = await fetch('/api/devices');
        if (!updatedDevicesResponse.ok) { alert("Failed to fetch updated device data."); return; }
        const newApiDeviceData = await updatedDevicesResponse.json();
        console.log("Fetched new API data after update:", newApiDeviceData);

        devices = devices.map(existingDevice => {
            const updatedDataForThisDevice = newApiDeviceData.find(nd => nd.id === existingDevice.id);
            if (updatedDataForThisDevice) {
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
                // const MAX_HISTORY = 20;
                // if (estHistory.length > MAX_HISTORY) estHistory = estHistory.slice(-MAX_HISTORY);
                // if (realHist.length > MAX_HISTORY) realHist = realHist.slice(-MAX_HISTORY);
                return { ...updatedDataForThisDevice, position_history: estHistory, real_position_history: realHist };
            }
            return existingDevice;
        });
        const updatedDeviceForLog = devices.find(d => d.id === selectedDeviceId);
        console.log("Global device updated with histories:", JSON.parse(JSON.stringify(updatedDeviceForLog)));

        await loadData();

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

    // API'den gelen device.real_position ve device.position'ın varlığından emin olalım
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
        if (document.getElementById('trilaterationPlot')) {
            showTrilaterationPlotly(device);
        }
        if (document.getElementById('devicePathPlot')) {
            showDevicePathHistoryPlot(device);
        }
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
    // setInterval(loadData, 30000);
});

// SİZİN SAĞLADIĞINIZ TRILATERASYON GRAFİĞİ FONKSİYONU
function showTrilaterationPlotly(device) {
    console.log("showTrilaterationPlotly CALLED for device:", device.id);
    const plotDiv = document.getElementById('trilaterationPlot');
    if (!plotDiv) { console.error("trilaterationPlot element not found."); return; }
    try { Plotly.purge(plotDiv); } catch(e) {}

    if (!device || !device.position || !device.real_position || !device.measurements ||
        typeof device.position.x !== 'number' || typeof device.real_position.x !== 'number') {
        plotDiv.innerHTML = '<p class="text-danger">Error: Insufficient or invalid data for trilateration plot.</p>';
        document.getElementById('deviceInfoOnChart').innerHTML = ''; // Bilgi alanını da temizle
        return;
    }

    const infoHtml = `<b>Device:</b> <code>${device.id}</code><br>
                      <b>Estimated:</b> (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})<br>
                      <b>Real:</b> (${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})`;
    document.getElementById('deviceInfoOnChart').innerHTML = infoHtml;

    let traces = [];

    device.measurements.forEach((m, idx) => {
        const sensor = sensors.find(s => s.id === m.sensor_id); // Global 'sensors' kullanılıyor
        if (!sensor || !sensor.position || typeof sensor.position.x !== 'number' || typeof m.distance !== 'number') {
            console.warn("Skipping measurement due to missing sensor, sensor position, or distance:", m);
            return;
        }

        traces.push({
            x: [sensor.position.x],
            y: [sensor.position.y],
            mode: 'markers+text',
            type: 'scatter',
            marker: { symbol: 'triangle-up', size: 16, color: '#dc3545' },
            text: [m.sensor_id],
            textposition: 'bottom right',
            name: `Sensor ${m.sensor_id}`, // Legend'da daha anlaşılır isim
            hovertemplate: `Sensor: ${m.sensor_id}<br>X: ${sensor.position.x.toFixed(2)}<br>Y: ${sensor.position.y.toFixed(2)}<extra></extra>`
        });

        const theta = Array.from({ length: 100 }, (_, i) => 2 * Math.PI * i / 100);
        const circleX = theta.map(t => sensor.position.x + m.distance * Math.cos(t));
        const circleY = theta.map(t => sensor.position.y + m.distance * Math.sin(t));
        traces.push({
            x: circleX,
            y: circleY,
            mode: 'lines',
            type: 'scatter', // scatter type olmalı
            line: { color: `hsl(${idx * (360 / device.measurements.length )},70%,60%)`, width: 2, dash: 'dot' }, // Renk dağılımını iyileştir
            name: `Distance to ${m.sensor_id}`,
            hoverinfo: 'skip',
            showlegend: false
        });
    });

    traces.push({
        x: [device.position.x], y: [device.position.y], mode: 'markers+text', type: 'scatter',
        marker: { size: 18, color: '#0d6efd' }, text: ['Estimated'], textposition: 'top center', name: 'Estimated',
        hovertemplate: `Estimated<br>X: ${device.position.x.toFixed(2)}<br>Y: ${device.position.y.toFixed(2)}<extra></extra>`
    });

    traces.push({
        x: [device.real_position.x], y: [device.real_position.y], mode: 'markers+text', type: 'scatter',
        marker: { size: 18, color: '#198754' }, text: ['Real'], textposition: 'top right', name: 'Real', // 'Real Position' yerine 'Real'
        hovertemplate: `Real<br>X: ${device.real_position.x.toFixed(2)}<br>Y: ${device.real_position.y.toFixed(2)}<extra></extra>`
    });

    const allX = traces.flatMap(t => Array.isArray(t.x) ? t.x : (t.x !== undefined ? [t.x] : [])).filter(v => typeof v === 'number' && !isNaN(v));
    const allY = traces.flatMap(t => Array.isArray(t.y) ? t.y : (t.y !== undefined ? [t.y] : [])).filter(v => typeof v === 'number' && !isNaN(v));

    const layoutTrilateration = {
        margin: { t: 20, b: 40, l: 40, r: 20 },
        xaxis: { title: 'X (m)', zeroline: false, scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (m)', zeroline: false },
        plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa',
        font: { family: 'Inter, Arial, sans-serif' },
        showlegend: true, height: 320,
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 }
    };

    if (allX.length > 0 && allY.length > 0) {
        const xMin = Math.min(...allX); const xMax = Math.max(...allX);
        const yMin = Math.min(...allY); const yMax = Math.max(...allY);
        const xRangeVal = xMax - xMin; const yRangeVal = yMax - yMin;
        const xPadding = xRangeVal > 0.1 ? xRangeVal * 0.15 : 2; // Padding'i biraz artırdım
        const yPadding = yRangeVal > 0.1 ? yRangeVal * 0.15 : 2;
        layoutTrilateration.xaxis.range = [xMin - Math.max(2,xPadding), xMax + Math.max(2,xPadding)];
        layoutTrilateration.yaxis.range = [yMin - Math.max(2,yPadding), yMax + Math.max(2,yPadding)];
    } else {
        layoutTrilateration.xaxis.range = [-10, 10]; layoutTrilateration.yaxis.range = [-10, 10];
    }

    Plotly.newPlot(plotDiv, traces, layoutTrilateration, { displayModeBar: false, responsive: true, displaylogo: false });
    console.log("showTrilaterationPlotly: Plot updated.");
}


function showDevicePathHistoryPlot(device) {
    console.log("showDevicePathHistoryPlot (MATLAB Style) CALLED for device:", device.id);
    const pathPlotDiv = document.getElementById('devicePathPlot');
    if (!pathPlotDiv) { console.error("devicePathPlot element not found."); return; }
    try { Plotly.purge(pathPlotDiv); } catch(e) { console.warn("Could not purge devicePathPlot:", e); }

    const estHistory = device.position_history;
    const realHistory = device.real_position_history;

    console.log(`Device ${device.id} - Est History (len ${estHistory ? estHistory.length : 0}):`, JSON.parse(JSON.stringify(estHistory)));
    console.log(`Device ${device.id} - Real History (len ${realHistory ? realHistory.length : 0}):`, JSON.parse(JSON.stringify(realHistory)));

    if ( (!estHistory || estHistory.length < 1) && (!realHistory || realHistory.length < 1) ) {
        pathPlotDiv.innerHTML = '<p class="text-muted text-center">No position history to draw.</p>'; return;
    }

    let plotTraces = [];

    if (realHistory && realHistory.length >= 1) {
        plotTraces.push({
            x: realHistory.map(p => p.x), y: realHistory.map(p => p.y),
            mode: realHistory.length >=2 ? 'lines+markers' : 'markers', type: 'scatter', name: 'Real Path',
            line: { color: 'blue', width: 2 }, marker: { color: 'blue', size: 5 }
        });
    }
    if (estHistory && estHistory.length >= 1) {
        plotTraces.push({
            x: estHistory.map(p => p.x), y: estHistory.map(p => p.y),
            mode: 'markers', type: 'scatter', name: 'Estimated Positions',
            marker: { color: 'green', size: 7, symbol: 'circle-open', line: { color: 'green', width: 1 }},
            text: estHistory.map((p, i) => `Est. ${i+1}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`), hoverinfo: 'text'
        });
    }
    if (window.sensors && window.sensors.length > 0) { // window.sensors yerine sadece sensors kullanabiliriz (aynı scopetayız)
        sensors.forEach(sensor => {
            if (sensor.position && typeof sensor.position.x === 'number') {
                plotTraces.push({
                    x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
                    name: `Sensor ${sensor.id.slice(-4)}`, text: [sensor.id.slice(-4)], textposition: 'bottom right',
                    marker: { symbol: 'triangle-up', size: 12, color: 'red' },
                    customdata: [`Sensor: ${sensor.id}\n(${sensor.position.x.toFixed(2)}, ${sensor.position.y.toFixed(2)})`],
                    hovertemplate: '%{customdata}<extra></extra>'
                });
            }
        });
    }

    if (plotTraces.length === 0) { pathPlotDiv.innerHTML = '<p class="text-muted text-center">No data to plot.</p>'; return; }

    const layoutPath = {
        margin: { t: 30, b: 40, l: 50, r: 20 },
        xaxis: { title: 'X (m)', zeroline: true, showgrid: true, scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (m)', zeroline: true, showgrid: true },
        plot_bgcolor: 'white', paper_bgcolor: 'white',
        font: { family: 'Arial, sans-serif', size: 10 }, showlegend: true,
        legend: { x: 1, y: 1, xanchor: 'right', yanchor: 'top', bgcolor: 'rgba(255,255,255,0.7)' }, height: 280
    };

    let allXForRange = []; let allYForRange = [];
    plotTraces.forEach(trace => {
        if (trace.x) allXForRange.push(...(Array.isArray(trace.x) ? trace.x : [trace.x]).filter(v => typeof v === 'number' && !isNaN(v)));
        if (trace.y) allYForRange.push(...(Array.isArray(trace.y) ? trace.y : [trace.y]).filter(v => typeof v === 'number' && !isNaN(v)));
    });

    if (allXForRange.length > 0) {
        const xMin = Math.min(...allXForRange); const xMax = Math.max(...allXForRange);
        const yMin = Math.min(...allYForRange); const yMax = Math.max(...allYForRange);
        const xRangeVal = xMax - xMin; const yRangeVal = yMax - yMin;
        const xPadding = xRangeVal > 0.1 ? xRangeVal * 0.15 : 1; // Padding'i %15 veya min 1 yaptım
        const yPadding = yRangeVal > 0.1 ? yRangeVal * 0.15 : 1;
        layoutPath.xaxis.range = [xMin - Math.max(1,xPadding), xMax + Math.max(1,xPadding)];
        layoutPath.yaxis.range = [yMin - Math.max(1,yPadding), yMax + Math.max(1,yPadding)];
    } else {
         layoutPath.xaxis.range = [-10, 10]; layoutPath.yaxis.range = [-10, 10];
    }

    Plotly.newPlot(pathPlotDiv, plotTraces, layoutPath, { displayModeBar: true, responsive: true, displaylogo: false });
    console.log("showDevicePathHistoryPlot: MATLAB style path plot updated.");
}