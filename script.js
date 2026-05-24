document.addEventListener('DOMContentLoaded', async () => {
    const API_URL = 'https://open.er-api.com/v6/latest/USD';
    const currencies = {
        'UAH': '🇺🇦 UAH', 'USD': '🇺🇸 USD', 'EUR': '🇪🇺 EUR',
        'PLN': '🇵🇱 PLN', 'GBP': '🇬🇧 GBP', 'CZK': '🇨🇿 CZK',
        'CHF': '🇨🇭 CHF', 'CAD': '🇨🇦 CAD', 'AUD': '🇦🇺 AUD',
        'JPY': '🇯🇵 JPY', 'TRY': '🇹🇷 TRY', 'CNY': '🇨🇳 CNY',
        'SEK': '🇸🇪 SEK', 'NOK': '🇳🇴 NOK', 'DKK': '🇩🇰 DKK',
        'HUF': '🇭🇺 HUF', 'RON': '🇷🇴 RON', 'BGN': '🇧🇬 BGN',
        'ILS': '🇮🇱 ILS', 'AED': '🇦🇪 AED', 'SGD': '🇸🇬 SGD',
        'KZT': '🇰🇿 KZT', 'GEL': '🇬🇪 GEL', 'MDL': '🇲🇩 MDL'
    };
    const SPREAD = {
        default: 1.0,   
        'JPY': 1.25, 'TRY': 1.75, 'KZT': 2.0, 'MDL': 1.75, 'GEL': 1.5,
    };
    let rates = {};           
    let updatedAt = null;
    let history = JSON.parse(localStorage.getItem('convHistory') || '[]');
    let favorites = JSON.parse(localStorage.getItem('convFavorites') || '[]');
    let useSpread = false;    
    const fallbackRatesUSD = {
        'UAH': 41.5, 'USD': 1, 'EUR': 0.92, 'PLN': 3.97,
        'GBP': 0.79, 'CZK': 23.1, 'CHF': 0.89, 'CAD': 1.36,
        'AUD': 1.52, 'JPY': 153.5, 'TRY': 32.5, 'CNY': 7.24,
        'SEK': 10.5, 'NOK': 10.8, 'DKK': 6.9, 'HUF': 362.0,
        'RON': 4.58, 'BGN': 1.80, 'ILS': 3.72, 'AED': 3.67,
        'SGD': 1.34, 'KZT': 450.0, 'GEL': 2.65, 'MDL': 17.8
    };
    const chartData = {
        'USD': [40.8, 41.1, 41.05, 40.95, 41.2, 41.3, 41.15],
        'EUR': [44.2, 44.5, 44.3, 44.6, 44.8, 44.7, 44.9],
        'PLN': [10.2, 10.3, 10.25, 10.4, 10.35, 10.5, 10.45],
        'GBP': [52.1, 52.4, 52.3, 52.6, 52.8, 52.7, 52.9],
        'CZK': [1.78, 1.79, 1.77, 1.80, 1.81, 1.79, 1.82],
        'CHF': [46.2, 46.5, 46.3, 46.8, 46.6, 46.9, 47.1],
        'SEK': [3.82, 3.85, 3.83, 3.87, 3.86, 3.89, 3.88],
    };
    let currentChartCurrency = 'USD';
    let chart = null;
    const getForeignCode = (from, to) => (from !== 'UAH' ? from : to);
    const getHalfSpread = (code) => (SPREAD[code] ?? SPREAD.default) / 100;
    const getMidUahPerFx = (fxCode) => rates['UAH'] / rates[fxCode];
    const getEffectiveUahPerFx = (fxCode, clientSellsFx) => {
        const mid = getMidUahPerFx(fxCode);
        if (!useSpread) return mid;
        const s = getHalfSpread(fxCode);
        return clientSellsFx ? mid * (1 - s) : mid * (1 + s);
    };
    const convertAmount = (amount, from, to) => {
        if (!rates[from] || !rates[to]) return 0;
        let uah;
        if (from === 'UAH') {
            uah = amount;
        } else {
            const rate = getEffectiveUahPerFx(from, true);
            uah = amount * rate;
        }
        if (to === 'UAH') return uah;
        const rate = getEffectiveUahPerFx(to, false);
        return uah / rate;
    };
    const formatNumber = (val) => {
        if (val >= 1_000_000) return val.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
        if (val >= 1_000)     return val.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
        if (val >= 1)         return val.toFixed(2);
        return val.toFixed(4);
    };
    const adaptFontSize = (inputEl, value) => {
        const len = String(value).replace(/[.,\s]/g, '').length;
        if (len <= 6)       inputEl.style.fontSize = '2.8rem';
        else if (len <= 9)  inputEl.style.fontSize = '2rem';
        else if (len <= 12) inputEl.style.fontSize = '1.5rem';
        else                inputEl.style.fontSize = '1.1rem';
    };
    window.setMode = (mode) => {
        useSpread = (mode === 'spread');
        const btnMid    = document.getElementById('btn-mid');
        const btnSpread = document.getElementById('btn-spread');
        const hint      = document.getElementById('mode-hint');
        if (useSpread) {
            btnSpread.classList.add('active-mode-spread');
            btnMid.classList.remove('active-mode-mid');
            hint.textContent = 'Курс з банківським спредом: FX→UAH дешевше, UAH→FX дорожче';
        } else {
            btnMid.classList.add('active-mode-mid');
            btnSpread.classList.remove('active-mode-spread');
            hint.textContent = 'Середній міжбанківський курс без спреду';
        }
        convertCurrency();
    };
    const populateSelects = () => {
        const from = document.getElementById('from-currency');
        const to = document.getElementById('to-currency');
        Object.entries(currencies).forEach(([code, flag]) => {
            from.add(new Option(flag, code));
            to.add(new Option(flag, code));
        });
        from.value = 'UAH';
        to.value = 'USD';
    };
    const showLoader = (show) => {
        document.getElementById('rates-loader').style.display = show ? 'flex' : 'none';
        document.getElementById('rates-grid').style.opacity = show ? '0.3' : '1';
    };
    const updateTimestamp = () => {
        if (!updatedAt) return;
        const diff = Math.floor((Date.now() - updatedAt) / 1000);
        const el = document.getElementById('update-time');
        if (!el) return;
        if (diff < 60) el.textContent = `оновлено ${diff} сек тому`;
        else if (diff < 3600) el.textContent = `оновлено ${Math.floor(diff/60)} хв тому`;
        else el.textContent = `оновлено ${Math.floor(diff/3600)} год тому`;
    };
    const loadRates = async () => {
        showLoader(true);
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            if (data.result === 'success' && data.rates) {
                rates = data.rates;
                updatedAt = Date.now();
            } else {
                rates = fallbackRatesUSD;
            }
        } catch {
            rates = fallbackRatesUSD;
        }
        showLoader(false);
        renderRatesGrid();
        convertCurrency();
        setInterval(updateTimestamp, 10000);
        updateTimestamp();
    };
    window.convertCurrency = () => {
        const amount = parseFloat(document.getElementById('amount').value) || 0;
        const from   = document.getElementById('from-currency').value;
        const to     = document.getElementById('to-currency').value;
        if (!rates[from] || !rates[to]) return;
        const result    = convertAmount(amount, from, to);
        const formatted = formatNumber(result);
        document.getElementById('result').value = formatted;
        adaptFontSize(document.getElementById('result'), formatted);
        adaptFontSize(document.getElementById('amount'), String(amount));
        const fxCode = from === 'UAH' ? to : (to === 'UAH' ? from : from);
        const rateEl   = document.getElementById('exchange-rate');
        const spreadEl = document.getElementById('spread-info');
        if (fxCode && fxCode !== 'UAH' && rates[fxCode]) {
            const buyRate  = getEffectiveUahPerFx(fxCode, true);
            const sellRate = getEffectiveUahPerFx(fxCode, false);
            const mid      = getMidUahPerFx(fxCode);
            if (useSpread) {
                rateEl.innerHTML =
                    `<span class="text-emerald-400">Продаж ${fxCode} ${buyRate.toFixed(2)}</span>` +
                    ` · <span class="text-rose-400">Купівля ${fxCode} ${sellRate.toFixed(2)} UAH</span>`;
                spreadEl.innerHTML =
                    `Середній: <span class="text-slate-300">${mid.toFixed(2)}</span> · ` +
                    `Спред: <span class="text-amber-400">${(sellRate - buyRate).toFixed(2)} UAH</span>`;
            } else {
                rateEl.innerHTML =
                    `<span class="text-emerald-400">Курс:</span> 1 ${fxCode} = ${mid.toFixed(2)} UAH`;
                spreadEl.textContent = '';
            }
        } else {
            rateEl.textContent   = '';
            spreadEl.textContent = '';
        }
        if (amount > 0) addToHistory(amount, from, result, to);
    };
    const addToHistory = (amount, from, result, to) => {
        const modeLabel = useSpread ? '🏦' : '⚖️';
        const entry = {
            amount: formatNumber(amount), from,
            result: formatNumber(result), to,
            mode: modeLabel,
            time: new Date().toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'})
        };
        history = [entry, ...history.filter((_, i) => i < 4)];
        localStorage.setItem('convHistory', JSON.stringify(history));
        renderHistory();
    };
    const renderHistory = () => {
        const container = document.getElementById('history-list');
        if (!history.length) {
            container.innerHTML = '<p class="text-slate-500 text-sm">Ще немає конвертацій</p>';
            return;
        }
        container.innerHTML = history.map(h => `
            <div class="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3 text-sm history-item">
                <span class="text-slate-300 truncate mr-2">${h.mode} ${h.amount} ${currencies[h.from] || h.from} → <span class="text-cyan-400 font-semibold">${h.result} ${currencies[h.to] || h.to}</span></span>
                <span class="text-slate-500 text-xs flex-shrink-0">${h.time}</span>
            </div>
        `).join('');
    };
    window.copyResult = () => {
        const val = document.getElementById('result').value;
        if (!val) return;
        navigator.clipboard.writeText(val.replace(/\s/g, ''));
        const btn = document.getElementById('copy-btn');
        btn.textContent = '✓';
        btn.classList.add('text-emerald-400');
        setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('text-emerald-400'); }, 1500);
    };
    const renderRatesGrid = () => {
        const grid = document.getElementById('rates-grid');
        grid.innerHTML = '';
        const popular = ['USD', 'EUR', 'PLN', 'GBP', 'CZK', 'CHF', 'SEK', 'HUF', 'AED', 'SGD', 'KZT', 'GEL'];
        popular.forEach(code => {
            if (!rates[code] || !rates['UAH']) return;
            const mid  = getMidUahPerFx(code);
            const buy  = getEffectiveUahPerFx(code, true);   
            const sell = getEffectiveUahPerFx(code, false);  
            const isFav = favorites.includes(code);
            const card = document.createElement('div');
            card.className = 'rate-card bg-white/5 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 cursor-pointer';
            card.dataset.code = code;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <span class="text-2xl">${currencies[code]}</span>
                    <button class="fav-btn text-lg transition-all ${isFav ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}" data-code="${code}">★</button>
                </div>
                <p class="text-3xl font-semibold">${mid.toFixed(2)}</p>
                <p class="text-xs text-slate-400 mt-1">середній UAH / 1 ${code}</p>
                <div class="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-1 text-xs">
                    <span class="text-slate-500">Продаж FX</span><span class="text-emerald-400 text-right">${buy.toFixed(2)}</span>
                    <span class="text-slate-500">Купівля FX</span><span class="text-rose-400 text-right">${sell.toFixed(2)}</span>
                </div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('fav-btn')) return;
                switchChart(code);
                document.getElementById('charts').scrollIntoView({ behavior: 'smooth' });
            });
            card.querySelector('.fav-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(code);
            });
            grid.appendChild(card);
        });
        renderFavorites();
    };
    const toggleFavorite = (code) => {
        favorites = favorites.includes(code) ? favorites.filter(f => f !== code) : [...favorites, code];
        localStorage.setItem('convFavorites', JSON.stringify(favorites));
        renderRatesGrid();
    };
    const renderFavorites = () => {
        const container = document.getElementById('favorites-section');
        if (!favorites.length) {
            container.innerHTML = '<p class="text-slate-500 text-sm">Натисніть ★ на карточці щоб додати</p>';
            return;
        }
        container.innerHTML = favorites.map(code => {
            const mid = getMidUahPerFx(code).toFixed(2);
            return `<div class="inline-flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-2">
                <span>${currencies[code]}</span>
                <span class="font-semibold">${mid} UAH</span>
                <button class="text-yellow-400 text-xs hover:text-red-400 transition-colors" onclick="removeFav('${code}')">✕</button>
            </div>`;
        }).join('');
    };
    window.removeFav = (code) => {
        favorites = favorites.filter(f => f !== code);
        localStorage.setItem('convFavorites', JSON.stringify(favorites));
        renderRatesGrid();
    };
    const switchChart = (code) => {
        currentChartCurrency = code;
        const data = chartData[code] || chartData['USD'];
        chart.data.datasets[0].label = `${code} → UAH`;
        chart.data.datasets[0].data = data;
        chart.update('active');
        document.querySelectorAll('.chart-tab').forEach(t => {
            t.classList.toggle('bg-cyan-500', t.dataset.code === code);
            t.classList.toggle('text-white', t.dataset.code === code);
            t.classList.toggle('bg-white/10', t.dataset.code !== code);
            t.classList.toggle('text-slate-400', t.dataset.code !== code);
        });
    };
    document.getElementById('swap-btn').addEventListener('click', () => {
        const from = document.getElementById('from-currency');
        const to   = document.getElementById('to-currency');
        const amountEl = document.getElementById('amount');
        const resultEl = document.getElementById('result');
        [from.value, to.value] = [to.value, from.value];
        const resultVal = parseFloat(resultEl.value.replace(/\s/g, ''));
        if (resultVal) amountEl.value = resultVal.toFixed(2);
        document.getElementById('swap-btn').classList.add('rotate-180');
        setTimeout(() => document.getElementById('swap-btn').classList.remove('rotate-180'), 300);
        convertCurrency();
    });
    document.getElementById('amount').addEventListener('input', (e) => {
        const MAX = 10_000_000;
        if (parseFloat(e.target.value) > MAX) e.target.value = MAX;
        convertCurrency();
    });
    document.getElementById('from-currency').addEventListener('change', convertCurrency);
    document.getElementById('to-currency').addEventListener('change', convertCurrency);
    populateSelects();
    await loadRates();
    renderHistory();
    setMode('mid'); 
    const tabs = ['USD','EUR','PLN','GBP','CZK','CHF','SEK'];
    const tabContainer = document.getElementById('chart-tabs');
    tabs.forEach(code => {
        const btn = document.createElement('button');
        btn.className = `chart-tab px-4 py-2 rounded-xl text-sm font-medium transition-all ${code === 'USD' ? 'bg-cyan-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'}`;
        btn.dataset.code = code;
        btn.textContent = code;
        btn.addEventListener('click', () => switchChart(code));
        tabContainer.appendChild(btn);
    });
    chart = new Chart(document.getElementById('currencyChart'), {
        type: 'line',
        data: {
            labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
            datasets: [{
                label: 'USD → UAH',
                data: chartData['USD'],
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34,211,238,0.08)',
                fill: true, tension: 0.4, borderWidth: 3,
                pointBackgroundColor: '#22d3ee', pointRadius: 5, pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    titleColor: '#94a3b8', bodyColor: '#f1f5f9',
                    callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)} UAH` }
                }
            },
            scales: {
                y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
                x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } }
            }
        }
    });
});
