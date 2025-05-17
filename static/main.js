// main.js

let devices = [];
let sensors = [];
let selectedDeviceId = null;

async function loadData() {
    // Verileri yeniden yükle
    const devicesPromise = fetch('/api/devices').then(r => r.json());
    const sensorsPromise = fetch('/api/sensors').then(r => r.json());
    
    // Global değişkenleri güncelle
    [devices, sensors] = await Promise.all([devicesPromise, sensorsPromise]);

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

    // DataTable'ı yeniden başlatmadan önce yok et, yoksa uyarı verir
    if ($.fn.DataTable.isDataTable('#devicesTable')) {
        $('#devicesTable').DataTable().destroy();
    }
    $('#devicesTable').DataTable({ pageLength: 8, retrieve: true }); // retrieve: true yerine destroy: true daha güvenli olabilir

    // Click event handler'ını yeniden bağla (destroy sonrası gerekebilir)
    // Ancak tbody'ye delege etmek daha iyi, bu sayede tablo yeniden çizilse bile çalışır
    // Bu satır zaten doğru yerde, loadData içinde olmasına gerek yok, DOMContentLoaded'de bir kere yeterli.
    // $('#devicesTable tbody').off('click', 'tr').on('click', 'tr', function () { ... } );
    // Zaten aşağıdaki DOMContentLoaded içinde bir kere ayarlanıyor, bu yeterli.

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
        xaxis: { title: 'X Location (m)' },
        yaxis: { title: 'Y Location (m)' },
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
    if (!device) {
        console.warn("Device not found in showDeviceDetails:", deviceId);
        // Modal'ı kapatabilir veya hata mesajı gösterebilirsiniz
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('deviceModal'));
        if (modalInstance) {
            modalInstance.hide();
        }
        return;
    }

    // Modal içindeki inputları güncel 'real_position' ile doldur
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
    
    // Plotly grafiğini güncellemek için setTimeout biraz gecikme verir, bu da DOM'un güncellenmesine zaman tanır.
    setTimeout(() => showTrilaterationPlotly(device), 100); // Gecikmeyi azalttım, 250ms biraz fazla olabilir

    // Modal'ı göster (eğer zaten açık değilse)
    // Eğer bu fonksiyon sadece update sonrası çağrılıyorsa ve modal zaten açıksa, tekrar show() demeye gerek yok.
    // Ancak modal kapalıyken de çağrılabilir (örneğin tablodan ilk tıklamada).
    // Bu yüzden, modal örneğini alıp göstermek genellikle güvenlidir.
    const modalEl = document.getElementById('deviceModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modalInstance.show();
}


async function updateDeviceLocation() {
    console.log("Updating device location...");
    const x = parseFloat(document.getElementById("manualX").value);
    const y = parseFloat(document.getElementById("manualY").value);

    if (!selectedDeviceId || isNaN(x) || isNaN(y)) {
        alert("Invalid position input.");
        return;
    }

    try {
        // 1. Konumu backend'e güncelleme isteği gönder
        const res = await fetch('/api/update_position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: selectedDeviceId, x: x, y: y })
        });

        if (!res.ok) {
            alert(`Update failed. Server responded with ${res.status}`);
            return;
        }

        // 2. Backend'den güncel cihaz verilerini al (bu, /api/devices çağrısıdır)
        //    Bu çağrı, backend'in overrides.json'daki yeni konuma göre
        //    RSSI simülasyonunu ve trilaterasyonla tahmin edilen konumu yeniden hesaplamasını sağlar.
        const updatedDevicesResponse = await fetch('/api/devices');
        if (!updatedDevicesResponse.ok) {
            alert("Failed to fetch updated device data after update.");
            return;
        }
        const newDeviceData = await updatedDevicesResponse.json();
        
        // Global 'devices' dizisini güncelle
        devices = newDeviceData;

        // 3. Güncellenen spesifik cihazı bul
        const updatedDevice = devices.find(d => d.id === selectedDeviceId);
        if (!updatedDevice) {
            alert("Device not found in the updated list. This is unexpected.");
            // Belki modalı kapatmak veya başka bir işlem yapmak gerekebilir.
            return;
        }

        // 4. Modal içeriğini (inputlar, tablolar, grafik) güncel verilerle yenile
        // showDeviceDetails fonksiyonu, güncel 'updatedDevice' objesini kullanarak
        // modal'ı yeniden çizecek ve manualX/manualY inputlarını da güncelleyecektir.
        showDeviceDetails(updatedDevice.id); 

        // 5. Ana sayfadaki tabloyu ve haritayı da güncel verilerle yenile
        // loadData() fonksiyonu zaten /api/devices ve /api/sensors'ı yeniden çeker
        // ve ana UI'ı günceller.
        await loadData();

        // Opsiyonel: Kullanıcıya başarı mesajı (belki çok sık olursa rahatsız edici olabilir)
        // console.log("Location updated successfully and UI refreshed.");

    } catch (error) {
        console.error("Error updating device location:", error);
        alert("An error occurred during the update process.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadData(); // İlk yükleme
    
    // Tablodaki satırlara tıklama olayını burada bir kere tanımla (event delegation)
    $('#devicesTable tbody').on('click', 'tr', function () {
        const deviceId = $(this).data('id');
        showDeviceDetails(deviceId);
    });

    // Periyodik güncellemeyi de devam ettir
    setInterval(loadData, 10000); 
});

function showTrilaterationPlotly(device) {
    const infoHtml = `<b>Device:</b> <code>${device.id}</code><br>
                      <b>Estimated:</b> (${device.position.x.toFixed(2)}, ${device.position.y.toFixed(2)})<br>
                      <b>Real:</b> (${device.real_position.x.toFixed(2)}, ${device.real_position.y.toFixed(2)})`;
    document.getElementById('deviceInfoOnChart').innerHTML = infoHtml;

    let traces = [];

    device.measurements.forEach((m, idx) => {
        const sensor = sensors.find(s => s.id === m.sensor_id);
        if (!sensor) return;

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

        const theta = Array.from({ length: 100 }, (_, i) => 2 * Math.PI * i / 100);
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

    // Estimated position (blue)
    traces.push({
        x: [device.position.x],
        y: [device.position.y],
        mode: 'markers+text',
        type: 'scatter',
        marker: { size: 18, color: '#0d6efd' },
        text: ['Estimated'],
        textposition: 'top center',
        name: 'Estimated',
        hovertemplate: `Estimated<br>X: ${device.position.x.toFixed(2)}<br>Y: ${device.position.y.toFixed(2)}<extra></extra>`
    });

    // OPTIONAL: Real position (green) - Gerçek konumu da çizmek isterseniz
    traces.push({
        x: [device.real_position.x],
        y: [device.real_position.y],
        mode: 'markers+text',
        type: 'scatter',
        marker: { size: 18, color: '#198754' }, // Yeşil renk
        text: ['Real'],
        textposition: 'top right',
        name: 'Real Position',
        hovertemplate: `Real<br>X: ${device.real_position.x.toFixed(2)}<br>Y: ${device.real_position.y.toFixed(2)}<extra></extra>`
    });
    

    const allX = traces.flatMap(t => Array.isArray(t.x) ? t.x : [t.x]); // t.x tekil bir değer de olabilir
    const allY = traces.flatMap(t => Array.isArray(t.y) ? t.y : [t.y]);


    const layout = {
        margin: { t: 20, b: 40, l: 40, r: 20 }, // alt boşluğu artırdım
        xaxis: {
            title: 'X (m)',
            zeroline: false,
            // range: [Math.min(...allX) - 2, Math.max(...allX) + 2], // Otomatik range daha iyi olabilir
            scaleanchor: 'y',
            scaleratio: 1
        },
        yaxis: {
            title: 'Y (m)',
            zeroline: false,
            // range: [Math.min(...allY) - 2, Math.max(...allY) + 2] // Otomatik range
        },
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: '#f8f9fa',
        font: { family: 'Inter, Arial, sans-serif' },
        showlegend: true,
        height: 320,
        legend: {
            orientation: "h",
            yanchor: "bottom",
            y: 1.02, // Grafiğin biraz üstüne
            xanchor: "right",
            x: 1
        }
    };
    
    // X ve Y eksen aralıklarını belirle
    const xMin = Math.min(...allX.filter(v => !isNaN(v)));
    const xMax = Math.max(...allX.filter(v => !isNaN(v)));
    const yMin = Math.min(...allY.filter(v => !isNaN(v)));
    const yMax = Math.max(...allY.filter(v => !isNaN(v)));
    
    const padding = 2; // Kenarlara eklenecek boşluk
    layout.xaxis.range = [xMin - padding, xMax + padding];
    layout.yaxis.range = [yMin - padding, yMax + padding];


    Plotly.newPlot('trilaterationPlot', traces, layout, {
        displayModeBar: false,
        responsive: true,
        displaylogo: false
    });
}