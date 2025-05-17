// main.js

let devices = [];
let sensors = [];
let selectedDeviceId = null;
let devicesDataTable = null; // DataTable örneğini saklamak için

async function loadData() {
    console.log("loadData CALLED");
    try {
        const devicesPromise = fetch('/api/devices').then(r => r.json());
        const sensorsPromise = fetch('/api/sensors').then(r => r.json());

        [devices, sensors] = await Promise.all([devicesPromise, sensorsPromise]);
        console.log("loadData: Devices fetched", devices);
        console.log("loadData: Sensors fetched", sensors);

        if (devicesDataTable) {
            console.log("loadData: Destroying existing DataTable");
            devicesDataTable.destroy();
        }
        $("#devicesTable tbody").empty();

        console.log("loadData: Initializing DataTable");
        devicesDataTable = $('#devicesTable').DataTable({
            pageLength: 8,
            data: devices.map(device => {
                if (!device || !device.id || !device.position || device.position.x === undefined || device.position.y === undefined) {
                    console.error("Malformed device object in devices array for DataTable:", device);
                    return {
                        id_display: `<span class="text-danger">Error</span>`,
                        x_pos: 'N/A',
                        y_pos: 'N/A',
                        id_hidden: 'error-id-' + Math.random().toString(36).substr(2, 9)
                    };
                }
                return {
                    id_display: `<span class="text-primary fw-bold" style="cursor:pointer;">${device.id.slice(-8)}</span>`,
                    x_pos: device.position.x.toFixed(2),
                    y_pos: device.position.y.toFixed(2),
                    id_hidden: device.id
                };
            }),
            columns: [
                { data: 'id_display', title: 'Device ID' },
                { data: 'x_pos', title: 'X (m)' },
                { data: 'y_pos', title: 'Y (m)' }
            ],
            createdRow: function(row, data, dataIndex) {
                if (data && data.id_hidden) {
                    $(row).attr('data-id', data.id_hidden);
                } else {
                    console.warn("Could not set data-id for row, id_hidden missing in data:", data);
                }
            }
        });
        console.log("loadData: DataTable initialized/reinitialized");

        const sensorTraces = sensors.map(sensor => ({
            x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
            name: sensor.id, text: [sensor.id], textposition: 'bottom right',
            marker: { symbol: 'triangle-up', size: 18, color: '#dc3545' }
        }));

        const deviceTraces = devices.map(device => {
            if (!device || !device.id || !device.position || device.position.x === undefined || device.position.y === undefined) {
                console.error("Malformed device object for map trace:", device);
                return { x: [], y: [], mode: 'markers', type: 'scatter', name: 'Error Device' };
            }
            return {
                x: [device.position.x], y: [device.position.y], mode: 'markers+text', type: 'scatter',
                name: device.id, text: [device.id.slice(-6)], textposition: 'top center',
                marker: { size: 12, color: '#0d6efd' }
            };
        });

        const layout = {
            margin: { t: 10, b: 50, l: 50, r: 10 },
            xaxis: { title: 'X Location (m)' },
            yaxis: { title: 'Y Location (m)', scaleanchor: "x", scaleratio: 1 },
            showlegend: false, hovermode: 'closest',
            plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa',
            font: { family: 'Inter, Arial, sans-serif' }
        };

        Plotly.react('map', [...sensorTraces, ...deviceTraces.filter(t => t.x.length > 0)], layout, { responsive: true, displaylogo: false });
        console.log("loadData: Map updated");

    } catch (error) {
        console.error("Error in loadData:", error);
    }
}

function showDeviceDetails(deviceId) {
    console.log("showDeviceDetails CALLED for deviceId:", deviceId);
    selectedDeviceId = deviceId;
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
        console.warn("Device not found in showDeviceDetails:", deviceId, "Current devices:", devices);
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('deviceModal'));
        if (modalInstance) modalInstance.hide();
        return;
    }
    console.log("Device found for details:", device);

    document.getElementById("manualX").value = device.real_position.x.toFixed(2);
    document.getElementById("manualY").value = device.real_position.y.toFixed(2);

    let html = `
        <div class="row g-3">
            <div class="col-md-6">
                <div class="card border-primary">
                    <div class="card-body">
                        <h6 class="card-title text-primary">Device ID</h6>
                        <p class="mb-1"><code>${device.id}</code></p>
                        <h6 class="card-title text-success mt-3">Real Location</h6>
                        <p>(${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})</p>
                        <h6 class="card-title text-primary mt-3">Estimated Location</h6>
                        <p>(${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})</p>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card border-info">
                    <div class="card-body">
                        <h6 class="card-title text-info">Sensor Measurements</h6>
                        <table class="table table-sm table-bordered mb-0">
                            <thead class="table-light"><tr><th>Sensor</th><th>RSSI (dBm)</th><th>Distance (m)</th></tr></thead>
                            <tbody>
                                ${device.measurements.map(m => `
                                    <tr><td>${m.sensor_id}</td><td>${m.rssi.toFixed(1)}</td><td>${m.distance.toFixed(2)}</td></tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('#deviceDetails').html(html);
    console.log("showDeviceDetails: Modal HTML updated");

    // Trilateration grafiğini güncellemek için setTimeout
    setTimeout(() => {
        if (document.getElementById('trilaterationPlot')) {
            showTrilaterationPlotly(device);
        } else {
            console.error("trilaterationPlot element not found for Plotly.");
        }
    }, 100); // DOM'un güncellenmesi için kısa bir gecikme

    const modalEl = document.getElementById('deviceModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modalInstance.show();
    console.log("showDeviceDetails: Modal shown");
}

async function updateDeviceLocation() {
    console.log("updateDeviceLocation CALLED");
    const xVal = document.getElementById("manualX").value;
    const yVal = document.getElementById("manualY").value;
    const x = parseFloat(xVal);
    const y = parseFloat(yVal);

    console.log(`Selected Device ID: ${selectedDeviceId}, X: ${xVal} (${x}), Y: ${yVal} (${y})`);

    if (!selectedDeviceId || isNaN(x) || isNaN(y)) {
        alert("Invalid position input. Please ensure a device is selected and X, Y are valid numbers.");
        console.error("Invalid input for update:", {selectedDeviceId, x, y});
        return;
    }

    try {
        const res = await fetch('/api/update_position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: selectedDeviceId, x: x, y: y })
        });
        console.log("Update position response status:", res.status);

        if (!res.ok) {
            const errorData = await res.text();
            alert(`Update failed. Server responded with ${res.status}: ${errorData}`);
            console.error("Update position failed:", res.status, errorData);
            return;
        }
        console.log("Update position successful");

        console.log("Calling loadData to refresh main page UI");
        await loadData(); // Bu, /api/devices'ı çağıracak ve global 'devices'ı güncelleyecek

        const updatedDevice = devices.find(d => d.id === selectedDeviceId);
        if (!updatedDevice) {
            alert("Device not found after update and data reload. This is unexpected.");
            console.error("Device not found in global 'devices' after loadData. Selected ID:", selectedDeviceId, "Current devices:", devices);
            const modalInstance = bootstrap.Modal.getInstance(document.getElementById('deviceModal'));
            if (modalInstance) modalInstance.hide();
            return;
        }
        console.log("Device found in reloaded data:", updatedDevice);

        console.log("Calling showDeviceDetails to refresh modal UI with updated device");
        showDeviceDetails(updatedDevice.id);

        console.log("Location updated and UI refreshed.");

    } catch (error) {
        console.error("Error in updateDeviceLocation:", error);
        alert("An error occurred during the update process. Check console for details.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event");
    loadData();
    
    $('#devicesTable tbody').on('click', 'tr', function () {
        const deviceId = $(this).attr('data-id');
        if (deviceId) {
            console.log("Row clicked, deviceId:", deviceId);
            showDeviceDetails(deviceId);
        } else {
            console.warn("Clicked row without a data-id attribute or data-id is undefined/null.");
        }
    });

    // setInterval(loadData, 10000); // Periyodik güncellemeyi test ederken devre dışı bırakın
});

function showTrilaterationPlotly(device) {
    console.log("showTrilaterationPlotly CALLED for device:", device);
    if (!device || !device.position || !device.real_position || !device.measurements) {
        console.error("Invalid device object passed to showTrilaterationPlotly:", device);
        $('#trilaterationPlot').html('<p class="text-danger">Error: Insufficient device data for plot.</p>');
        return;
    }
    if (!sensors || sensors.length === 0) {
        console.warn("Sensors data is not available for trilateration plot. Plotting device positions only.");
    }

    const infoHtml = `<b>Device:</b> <code>${device.id}</code><br>
                      <b>Estimated:</b> (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})<br>
                      <b>Real:</b> (${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})`;
    document.getElementById('deviceInfoOnChart').innerHTML = infoHtml;

    let traces = [];

    if (sensors && sensors.length > 0 && device.measurements) {
        device.measurements.forEach((m, idx) => {
            const sensor = sensors.find(s => s.id === m.sensor_id);
            if (!sensor) {
                console.warn(`Sensor with ID ${m.sensor_id} not found for measurement.`);
                return;
            }
            if (typeof m.distance !== 'number' || isNaN(m.distance)) {
                console.warn(`Invalid distance for sensor ${m.sensor_id}:`, m.distance);
                return;
            }

            traces.push({
                x: [sensor.position.x], y: [sensor.position.y], mode: 'markers+text', type: 'scatter',
                marker: { symbol: 'triangle-up', size: 16, color: '#dc3545' },
                text: [m.sensor_id], textposition: 'bottom right', name: `Sensor ${m.sensor_id}`,
                hovertemplate: `Sensor: ${m.sensor_id}<br>X: ${sensor.position.x.toFixed(2)}<br>Y: ${sensor.position.y.toFixed(2)}<extra></extra>`
            });

            const theta = Array.from({ length: 100 }, (_, i) => 2 * Math.PI * i / 100);
            const circleX = theta.map(t => sensor.position.x + m.distance * Math.cos(t));
            const circleY = theta.map(t => sensor.position.y + m.distance * Math.sin(t));
            traces.push({
                x: circleX, y: circleY, mode: 'lines', type: 'scatter',
                line: { color: `hsl(${idx * (360 / (device.measurements.length || 1))}, 70%, 60%)`, width: 2, dash: 'dot' },
                name: `Dist. to ${m.sensor_id}`, hoverinfo: 'skip', showlegend: false
            });
        });
    }

    traces.push({
        x: [device.position.x], y: [device.position.y], mode: 'markers+text', type: 'scatter',
        marker: { size: 18, color: '#0d6efd' }, text: ['Estimated'], textposition: 'top center', name: 'Estimated',
        hovertemplate: `Estimated<br>X: ${device.position.x.toFixed(2)}<br>Y: ${device.position.y.toFixed(2)}<extra></extra>`
    });

    traces.push({
        x: [device.real_position.x], y: [device.real_position.y], mode: 'markers+text', type: 'scatter',
        marker: { size: 18, color: '#198754' }, text: ['Real'], textposition: 'top right', name: 'Real',
        hovertemplate: `Real<br>X: ${device.real_position.x.toFixed(2)}<br>Y: ${device.real_position.y.toFixed(2)}<extra></extra>`
    });
    
    const allX = traces.flatMap(t => Array.isArray(t.x) ? t.x : (t.x !== undefined ? [t.x] : [])).filter(v => typeof v === 'number' && !isNaN(v));
    const allY = traces.flatMap(t => Array.isArray(t.y) ? t.y : (t.y !== undefined ? [t.y] : [])).filter(v => typeof v === 'number' && !isNaN(v));

    const layout = {
        margin: { t: 20, b: 40, l: 40, r: 20 },
        xaxis: { title: 'X (m)', zeroline: false, scaleanchor: 'y', scaleratio: 1 },
        yaxis: { title: 'Y (m)', zeroline: false },
        plot_bgcolor: '#f8f9fa', paper_bgcolor: '#f8f9fa',
        font: { family: 'Inter, Arial, sans-serif' },
        showlegend: true, height: 320,
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 }
    };

    if (allX.length > 0 && allY.length > 0) {
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = Math.min(...allY);
        const yMax = Math.max(...allY);
        const xRange = xMax - xMin;
        const yRange = yMax - yMin;
        const padding = Math.max(2, xRange * 0.1, yRange * 0.1);
        
        layout.xaxis.range = [xMin - padding, xMax + padding];
        layout.yaxis.range = [yMin - padding, yMax + padding];
    } else {
        layout.xaxis.range = [-10, 10];
        layout.yaxis.range = [-10, 10];
        if (traces.length === 0) { // Hiç trace yoksa, boş bir grafik alanı göster
             $('#trilaterationPlot').html('<p class="text-muted text-center">No data to display in trilateration plot.</p>');
             return; // Plotly.newPlot çağırma
        }
    }

   
    try {
        Plotly.newPlot('trilaterationPlot', traces, layout, { displayModeBar: false, responsive: true, displaylogo: false });
        console.log("showTrilaterationPlotly: Plot updated/created.");
    } catch(e) {
        console.error("Error creating/updating trilateration plot with Plotly:", e);
        $('#trilaterationPlot').html(`<p class="text-danger">Plotly error: ${e.message}</p>`);
    }}