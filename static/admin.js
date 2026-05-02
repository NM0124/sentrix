/**
 * Sentrix Admin Dashboard Logic
 * Handles Chart.js initialization and Data Table rendering/filtering
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- State ---
    let tableData = [];
    let threatChartInstance = null;
    let riskChartInstance = null;

    // --- Chart.js Configuration ---

    // Common Chart Options
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    font: { family: "'Inter', sans-serif" },
                    usePointStyle: true,
                    padding: 20
                }
            }
        }
    };

    function updateThreatTrendsChart(range, logs) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        let labels = [];
        let highRiskData = [];
        let warningData = [];

        if (range === '7D') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
                highRiskData.push(0);
                warningData.push(0);
            }
            logs.forEach(l => {
                const logDate = new Date(l.time);
                const diffDays = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays < 7) {
                    const idx = 6 - diffDays;
                    if (l.risk_level === 'High Risk') highRiskData[idx]++;
                    if (l.risk_level === 'Warning') warningData[idx]++;
                }
            });
        } else if (range === '1M') {
            labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
            highRiskData = [0, 0, 0, 0];
            warningData = [0, 0, 0, 0];
            logs.forEach(l => {
                const logDate = new Date(l.time);
                const diffDays = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays < 28) {
                    const weekIdx = 3 - Math.floor(diffDays / 7);
                    if (l.risk_level === 'High Risk') highRiskData[weekIdx]++;
                    if (l.risk_level === 'Warning') warningData[weekIdx]++;
                }
            });
        } else if (range === '1Y') {
            for (let i = 11; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
                highRiskData.push(0);
                warningData.push(0);
            }
            logs.forEach(l => {
                const logDate = new Date(l.time);
                const diffMonths = (today.getFullYear() - logDate.getFullYear()) * 12 + (today.getMonth() - logDate.getMonth());
                if (diffMonths >= 0 && diffMonths < 12) {
                    const idx = 11 - diffMonths;
                    if (l.risk_level === 'High Risk') highRiskData[idx]++;
                    if (l.risk_level === 'Warning') warningData[idx]++;
                }
            });
        } else if (range === '5Y') {
            for (let i = 4; i >= 0; i--) {
                labels.push((today.getFullYear() - i).toString());
                highRiskData.push(0);
                warningData.push(0);
            }
            logs.forEach(l => {
                const logDate = new Date(l.time);
                const diffYears = today.getFullYear() - logDate.getFullYear();
                if (diffYears >= 0 && diffYears < 5) {
                    const idx = 4 - diffYears;
                    if (l.risk_level === 'High Risk') highRiskData[idx]++;
                    if (l.risk_level === 'Warning') warningData[idx]++;
                }
            });
        }

        const threatCtx = document.getElementById('threatTrendsChart');
        if (threatCtx) {
            if (threatChartInstance) threatChartInstance.destroy();
            threatChartInstance = new Chart(threatCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'High Risk',
                            data: highRiskData,
                            borderColor: '#d4183d',
                            backgroundColor: 'rgba(212, 24, 61, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Warnings',
                            data: warningData,
                            borderColor: '#f59e0b',
                            backgroundColor: 'transparent',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    ...commonOptions,
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [2, 4], color: '#ececf0' }, ticks: { stepSize: 1 } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    }

    function updateCategoryBreakdownChart(logs) {
        const counts = {
            'Safe': 0,
            'Threat': 0,
            'Potential Fake News': 0,
            'Harmful / Hate': 0,
            'Suspicious': 0
        };

        logs.forEach(l => {
            const intent = l.intent || 'Safe';
            if (counts[intent] !== undefined) {
                counts[intent]++;
            } else {
                counts['Safe']++;
            }
        });

        const riskCtx = document.getElementById('riskBreakdownChart');
        if (riskCtx) {
            if (riskChartInstance) riskChartInstance.destroy();
            riskChartInstance = new Chart(riskCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(counts),
                    datasets: [{
                        data: Object.values(counts),
                        backgroundColor: [
                            '#10b981', // Safe
                            '#d4183d', // Threat
                            '#f59e0b', // Potential Fake News
                            '#8b5cf6', // Harmful / Hate
                            '#3b82f6'  // Suspicious
                        ],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    ...commonOptions,
                    cutout: '75%'
                }
            });
        }
    }

    function initCharts(stats, logs = []) {
        const rangeFilter = document.getElementById('chartRangeFilter');
        const range = rangeFilter ? rangeFilter.value : '7D';

        updateThreatTrendsChart(range, logs);
        updateCategoryBreakdownChart(logs);

        if (rangeFilter) {
            // Avoid adding multiple listeners if initCharts is called repeatedly
            const newFilter = rangeFilter.cloneNode(true);
            rangeFilter.parentNode.replaceChild(newFilter, rangeFilter);
            newFilter.addEventListener('change', (e) => {
                updateThreatTrendsChart(e.target.value, tableData);
            });
        }
    }

    // --- Alerts Logic ---
    function renderRecentAlerts(logs) {
        const container = document.getElementById('recent-alerts-container');
        if (!container) return;

        container.innerHTML = '';

        const alerts = logs.filter(l => l.risk_level === 'High Risk' || l.risk_level === 'Warning').slice(0, 4);

        if (alerts.length === 0) {
            container.innerHTML = `<p class="text-sm text-muted py-4 text-center">No recent alerts found.</p>`;
            return;
        }

        alerts.forEach(alert => {
            const isHigh = alert.risk_level === 'High Risk';
            const bgColor = isHigh ? '#fee2e2' : '#fef3c7';
            const fgColor = isHigh ? 'var(--destructive)' : 'var(--warning)';
            const icon = isHigh ? 'alert-triangle' : 'book-x';

            const timeObj = new Date(alert.time);
            const diffMins = Math.floor((new Date() - timeObj) / 60000);
            const timeStr = diffMins < 60 ? `${diffMins} mins ago` : (diffMins < 1440 ? `${Math.floor(diffMins / 60)} hours ago` : timeObj.toLocaleDateString());

            const item = document.createElement('div');
            item.className = 'alert-item';
            item.innerHTML = `
                <div class="alert-icon" style="background-color: ${bgColor}; color: ${fgColor};">
                    <i data-lucide="${icon}" style="width: 16px;"></i>
                </div>
                <div>
                    <p class="text-sm font-medium" style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${alert.content}">${alert.intent} detected</p>
                    <p class="text-xs text-muted">ID: ${alert.id} • ${timeStr}</p>
                </div>
            `;
            container.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // --- Modal Logic ---
    const reviewModal = document.getElementById('reviewModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            reviewModal.classList.remove('active');
        });
    }

    const successModal = document.getElementById('escalationSuccessModal');
    const closeSuccessBtn = document.getElementById('closeSuccessModalBtn');

    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', () => {
            successModal.classList.remove('active');
        });
    }

    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                successModal.classList.remove('active');
            }
        });
    }

    // Handle Escape key for all modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (reviewModal && reviewModal.classList.contains('active')) reviewModal.classList.remove('active');
            if (successModal && successModal.classList.contains('active')) successModal.classList.remove('active');
        }
    });

    // Review Actions Logic
    document.querySelectorAll('.review-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetStatus = btn.getAttribute('data-status');
            const docId = reviewModal.dataset.docid;

            if (!docId) return;

            const allButtons = document.querySelectorAll('.review-action-btn');
            allButtons.forEach(b => b.disabled = true);
            const originalText = btn.innerText;
            btn.innerText = 'Updating...';

            try {
                const res = await fetch(`/api/logs/${docId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: targetStatus })
                });

                if (res.ok) {
                    reviewModal.classList.remove('active');
                    btn.innerText = originalText;
                    allButtons.forEach(b => b.disabled = false);
                    await fetchDashboardData(); // Instantly refresh dashboard

                    // Show success modal if it was an escalation
                    if (targetStatus === 'escalated' && successModal) {
                        successModal.classList.add('active');
                    }
                } else {
                    let errText = res.statusText;
                    try {
                        const err = await res.json();
                        errText = err.error || err.message || errText;
                    } catch (parseErr) {
                        // Do nothing, fallback already set
                    }
                    alert(`Failed to update status (${res.status}): ${errText}`);
                    btn.innerText = originalText;
                    allButtons.forEach(b => b.disabled = false);
                }
            } catch (error) {

                alert(`Error updating status: ${error.message}`);
                btn.innerText = originalText;
                allButtons.forEach(b => b.disabled = false);
            }
        });
    });


    // --- Table Logic ---
    const tbody = document.querySelector('#flaggedTable tbody');
    const tableSearch = document.getElementById('tableSearch');
    const categoryFilter = document.getElementById('categoryFilter');

    function renderTable(data) {
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No logs found matching your criteria.</td></tr>`;
            return;
        }

        data.forEach(row => {
            let riskBadgeClass = 'badge-success';
            if (row.risk_level === 'High Risk') riskBadgeClass = 'badge-destructive';
            if (row.risk_level === 'Warning') riskBadgeClass = 'badge-warning';

            const formattedTime = new Date(row.time).toLocaleString();

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-medium text-sm">${row.id}</td>
                <td class="text-sm truncate" style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.content}">${row.content}</td>
                <td class="text-sm text-muted">${row.intent}</td>
                <td><span class="badge ${riskBadgeClass}">${row.risk_level}</span></td>
                <td class="text-sm text-muted">${formattedTime}</td>
                <td style="text-align: right;">
                    <button class="btn btn-ghost text-xs review-btn" style="height: 2rem; padding: 0 0.5rem; background-color: var(--secondary); border: 1px solid var(--border);" title="Review" data-id="${row.id}">
                        <i data-lucide="eye" style="width: 16px;"></i>
                    </button>
                    <button class="btn btn-ghost text-xs delete-btn" style="height: 2rem; padding: 0 0.5rem; color: var(--destructive); background-color: #fee2e2; border: 1px solid #fca5a5; margin-left: 0.25rem;" title="Delete" data-docid="${row._id}" data-docrev="${row._rev}">
                        <i data-lucide="trash-2" style="width: 16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add event listeners for review and delete buttons
        document.querySelectorAll('.review-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rowId = e.currentTarget.getAttribute('data-id');
                const rowData = tableData.find(r => r.id === rowId); // Find from original dataset
                if (rowData && reviewModal) {
                    // Populate modal metadata
                    reviewModal.dataset.docid = rowData._id;
                    reviewModal.dataset.docrev = rowData._rev;

                    // Populate modal visual fields
                    document.getElementById('modal-id').textContent = rowData.id;
                    document.getElementById('modal-time').textContent = new Date(rowData.time).toLocaleString();
                    document.getElementById('modal-intent').textContent = rowData.intent;

                    const riskEl = document.getElementById('modal-risk');
                    riskEl.textContent = rowData.risk_level;
                    if (rowData.risk_level === 'High Risk') riskEl.style.color = 'var(--destructive)';
                    else if (rowData.risk_level === 'Warning') riskEl.style.color = 'var(--warning)';
                    else riskEl.style.color = 'var(--success)';

                    document.getElementById('modal-severity').textContent = rowData.severity || 'Medium';

                    let confDisplay = 'N/A';
                    if (rowData.confidence !== undefined && rowData.confidence !== null) {
                        let conf = parseFloat(rowData.confidence);
                        if (conf <= 1.0) conf = conf * 100;
                        if (conf > 100) conf = 100;
                        if (conf < 0) conf = 0;
                        confDisplay = `${conf.toFixed(2)}%`;
                    }
                    document.getElementById('modal-confidence').textContent = confDisplay;

                    document.getElementById('modal-content').textContent = rowData.content;
                    document.getElementById('modal-reason').textContent = rowData.reason || 'No detailed reasoning generated.';
                    document.getElementById('modal-recommendation').textContent = rowData.recommendation || 'No recommendation available.';

                    reviewModal.classList.add('active');
                }
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.getAttribute('data-docid');
                const docRev = e.currentTarget.getAttribute('data-docrev');

                if (confirm(`Are you sure you want to permanently delete this record?`)) {

                    e.currentTarget.disabled = true;
                    e.currentTarget.style.opacity = '0.5';

                    try {
                        const res = await fetch(`/api/logs/${docId}?rev=${docRev}`, {
                            method: 'DELETE'
                        });

                        if (res.ok) {
                            await fetchDashboardData(); // Instantly refresh to reflect Cloudant deletion
                        } else {
                            const err = await res.json();
                            alert(`Failed to delete record: ${err.error}`);
                            e.currentTarget.disabled = false;
                            e.currentTarget.style.opacity = '1';
                        }
                    } catch (error) {
                        alert('Network error deleting record.');
                        e.currentTarget.disabled = false;
                        e.currentTarget.style.opacity = '1';
                    }
                }
            });
        });

        // Re-init icons for dynamic rows
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // --- Search & Filter Logic ---
    let showPendingOnly = false;
    const pendingToggleBtn = document.getElementById('pendingToggleBtn');
    if (pendingToggleBtn) {
        pendingToggleBtn.addEventListener('click', () => {
            showPendingOnly = !showPendingOnly;
            if (showPendingOnly) {
                pendingToggleBtn.style.backgroundColor = 'var(--primary)';
                pendingToggleBtn.style.color = 'var(--primary-foreground)';
            } else {
                pendingToggleBtn.style.backgroundColor = 'var(--card)';
                pendingToggleBtn.style.color = 'var(--foreground)';
            }
            applyFilters();
        });
    }

    function applyFilters() {
        let term = '';
        if (tableSearch && tableSearch.value) term = tableSearch.value.toLowerCase();

        const category = categoryFilter ? categoryFilter.value : 'All';

        let filtered = tableData;

        // Apply Pending Filter
        if (showPendingOnly) {
            filtered = filtered.filter(row => row.status === 'pending' || !row.status);
        }

        // Apply Search
        if (term) {
            filtered = filtered.filter(row =>
                (row.content && row.content.toLowerCase().includes(term)) ||
                (row.id && row.id.toLowerCase().includes(term)) ||
                (row.intent && row.intent.toLowerCase().includes(term)) ||
                (row.risk_level && row.risk_level.toLowerCase().includes(term))
            );
        }

        // Apply Category
        if (category !== 'All') {
            filtered = filtered.filter(row => row.intent && row.intent.includes(category));
        }

        renderTable(filtered);
    }

    if (tableSearch) tableSearch.addEventListener('input', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);

    // --- API Data Fetching ---
    async function fetchDashboardData() {
        try {
            // Fetch Logs first since Charts need them
            let fetchedLogs = [];
            const logsRes = await fetch('/api/logs');
            if (logsRes.ok) {
                fetchedLogs = await logsRes.json();
                tableData = fetchedLogs;
                applyFilters(); // Renders table with default empty filters
                renderRecentAlerts(fetchedLogs);
            } else {
                const errorData = await logsRes.json().catch(() => null);
                if (logsRes.status !== 401) {
                    alert(`Failed to load logs: ${errorData?.error || logsRes.statusText}`);
                }
                renderTable([]);
                renderRecentAlerts([]);
            }

            // Fetch Stats
            const statsRes = await fetch('/api/stats');
            if (statsRes.ok) {
                const stats = await statsRes.json();
                const totalEl = document.getElementById('stat-total');
                if (totalEl) totalEl.textContent = stats.total_analyses;

                const highRiskEl = document.getElementById('stat-high-risk');
                if (highRiskEl) highRiskEl.textContent = stats.high_risk_cases;

                const fakeNewsEl = document.getElementById('stat-fake-news');
                if (fakeNewsEl) fakeNewsEl.textContent = stats.fake_news_detected;

                const pendingEl = document.getElementById('stat-pending');
                if (pendingEl) pendingEl.textContent = stats.pending_reviews;

                initCharts(stats, fetchedLogs);
            } else {
                const errorData = await statsRes.json().catch(() => null);
                if (statsRes.status !== 401) {
                    alert(`Failed to load stats: ${errorData?.error || statsRes.statusText}`);
                }
                // Fallback chart init if stats fails
                initCharts({
                    total_analyses: fetchedLogs.length,
                    high_risk_cases: fetchedLogs.filter(l => l.risk_level === 'High Risk').length,
                    fake_news_detected: fetchedLogs.filter(l => l.risk_level === 'Warning').length
                }, fetchedLogs);
            }

        } catch (error) {

            // Don't alert aggressively for network errors just in case, only log
            renderTable([]);
            renderRecentAlerts([]);
        } finally {
            // Hide loader and show layout
            const loader = document.getElementById('page-loader');
            const layout = document.getElementById('dashboard-layout');
            if (loader) loader.style.display = 'none';
            if (layout) layout.style.display = 'flex';
        }
    }

    // Initialize Dashboard
    fetchDashboardData();

});
