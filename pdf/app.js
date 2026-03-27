/* ============================================================
   PDF ARAÇ KUTUSU - Main Application
   ============================================================ */
(function () {
    'use strict';

    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;

    /* ---- Tool Definitions ---- */
    const TOOLS = [
        { id: 'merge-pages', name: 'Sayfa Birleştirme', icon: '📄', desc: 'N sayfayı tek sayfada birleştir' },
        { id: 'merge-pdfs', name: 'PDF Birleştirme', icon: '📑', desc: 'Birden fazla PDF\'i birleştir' },
        { id: 'split', name: 'PDF Bölme', icon: '✂️', desc: 'Sayfa aralıklarına göre böl' },
        { id: 'rotate', name: 'Sayfa Döndürme', icon: '🔄', desc: 'Seçili sayfaları döndür' },
        { id: 'delete', name: 'Sayfa Silme', icon: '🗑️', desc: 'Seçili sayfaları sil' },
        { id: 'reorder', name: 'Sayfa Sıralama', icon: '🔀', desc: 'Sürükle-bırak ile sırala' },
        { id: 'extract', name: 'Sayfa Çıkarma', icon: '📤', desc: 'Belirli sayfaları ayır' },
        { id: 'watermark', name: 'Filigran Ekle', icon: '💧', desc: 'Metin filigranı ekle' },
        { id: 'page-numbers', name: 'Sayfa Numarası', icon: '🔢', desc: 'Numara ekle' },
        { id: 'orientation', name: 'Yön Değiştirme', icon: '↔️', desc: 'Dikey ↔ Yatay' },
        { id: 'resize', name: 'Boyut Değiştir', icon: '📐', desc: 'Sayfa boyutunu değiştir' },
    ];

    const PAGE_PRESETS = {
        'A3': [841.89, 1190.55],
        'A4': [595.28, 841.89],
        'A5': [419.53, 595.28],
        'B5': [498.90, 708.66],
        'Letter': [612, 792],
        'Legal': [612, 1008],
    };

    /* ---- State ---- */
    const state = {
        pdfBytes: null,
        pdfJsDoc: null,
        fileName: '',
        pageCount: 0,
        selectedPages: new Set(),
        currentTool: null,
        history: [],
        zoomLevel: 1,
        additionalFiles: [],
        dragSrcIndex: null,
    };

    /* ---- DOM Helpers ---- */
    const $ = sel => document.querySelector(sel);
    const $$ = sel => document.querySelectorAll(sel);
    const el = (tag, attrs = {}, children = []) => {
        const e = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'className') e.className = v;
            else if (k === 'textContent') e.textContent = v;
            else if (k === 'innerHTML') e.innerHTML = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
            else e.setAttribute(k, v);
        });
        children.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    };

    /* ---- Toast ---- */
    function toast(msg, type = 'info') {
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        const t = el('div', { className: `toast toast-${type}`, innerHTML: `<span>${icons[type] || ''}</span> <span>${msg}</span>` });
        $('#toast-container').appendChild(t);
        setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, 3500);
    }

    /* ---- Loading ---- */
    function showLoading(text = 'İşleniyor...') {
        $('#loading-text').textContent = text;
        $('#loading-overlay').style.display = '';
    }
    function hideLoading() { $('#loading-overlay').style.display = 'none'; }

    /* ============================================================
       FILE LOADING
       ============================================================ */
    async function loadPdfBytes(bytes, name) {
        state.pdfBytes = bytes;
        state.fileName = name;
        state.selectedPages.clear();
        state.history = [];

        try {
            const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
            state.pdfJsDoc = await loadingTask.promise;
            state.pageCount = state.pdfJsDoc.numPages;
        } catch (err) {
            toast('PDF dosyası yüklenemedi: ' + err.message, 'error');
            return;
        }

        // Update UI
        $('#file-name').textContent = name;
        $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(bytes.length)}`;
        $('#file-info').style.display = '';
        $('#btn-download').style.display = '';
        $('#btn-undo').style.display = '';
        $('#btn-new-file').style.display = '';
        $('#drop-zone').style.display = 'none';
        $('#workspace').style.display = '';

        enableTools();
        await renderThumbnails();
    }

    async function reloadAfterEdit(newBytes) {
        state.history.push(state.pdfBytes);
        if (state.history.length > 20) state.history.shift();
        state.pdfBytes = newBytes;
        state.selectedPages.clear();

        const loadingTask = pdfjsLib.getDocument({ data: newBytes.slice(0) });
        state.pdfJsDoc = await loadingTask.promise;
        state.pageCount = state.pdfJsDoc.numPages;

        $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(newBytes.length)}`;
        await renderThumbnails();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    /* ============================================================
       THUMBNAIL RENDERING
       ============================================================ */
    async function renderThumbnails() {
        const grid = $('#thumbnail-grid');
        grid.innerHTML = '';
        const baseW = 160 * state.zoomLevel;
        grid.style.setProperty('--thumb-width', baseW + 'px');

        for (let i = 1; i <= state.pageCount; i++) {
            const page = await state.pdfJsDoc.getPage(i);
            const vp = page.getViewport({ scale: 0.4 * state.zoomLevel });
            const canvas = el('canvas', { width: vp.width, height: vp.height });
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            const idx = i - 1;
            const card = el('div', {
                className: 'thumb-card' + (state.selectedPages.has(idx) ? ' selected' : ''),
                'data-index': idx,
                draggable: state.currentTool === 'reorder' ? 'true' : 'false',
            }, [
                el('span', { className: 'thumb-drag-handle', textContent: '⠿' }),
                canvas,
                el('span', { className: 'thumb-check', textContent: '✓' }),
                el('span', { className: 'thumb-label', textContent: `${i}` }),
            ]);

            card.addEventListener('click', () => togglePageSelection(idx));
            // Drag events for reorder
            card.addEventListener('dragstart', onDragStart);
            card.addEventListener('dragover', onDragOver);
            card.addEventListener('drop', onDrop);
            card.addEventListener('dragend', onDragEnd);
            card.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over-card'));

            grid.appendChild(card);
        }
        updateSelectionCount();
    }

    function togglePageSelection(idx) {
        if (state.currentTool === 'reorder') return;
        if (state.selectedPages.has(idx)) state.selectedPages.delete(idx);
        else state.selectedPages.add(idx);

        const card = $(`.thumb-card[data-index="${idx}"]`);
        if (card) card.classList.toggle('selected', state.selectedPages.has(idx));
        updateSelectionCount();
    }

    function updateSelectionCount() {
        const c = state.selectedPages.size;
        $('#selection-count').textContent = c > 0 ? `${c} sayfa seçili` : '';
    }

    /* ---- Drag & Drop Reorder ---- */
    function onDragStart(e) {
        if (state.currentTool !== 'reorder') return;
        state.dragSrcIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
    function onDragOver(e) {
        if (state.currentTool !== 'reorder') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over-card');
    }
    function onDrop(e) {
        if (state.currentTool !== 'reorder') return;
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over-card');
        const targetIdx = parseInt(e.currentTarget.dataset.index);
        if (state.dragSrcIndex !== null && state.dragSrcIndex !== targetIdx) {
            applyReorder(state.dragSrcIndex, targetIdx);
        }
    }
    function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); state.dragSrcIndex = null; }

    async function applyReorder(fromIdx, toIdx) {
        showLoading('Sayfalar yeniden sıralanıyor...');
        try {
            const srcDoc = await PDFDocument.load(state.pdfBytes);
            const newDoc = await PDFDocument.create();
            const order = Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);
            const [moved] = order.splice(fromIdx, 1);
            order.splice(toIdx, 0, moved);
            const pages = await newDoc.copyPages(srcDoc, order);
            pages.forEach(p => newDoc.addPage(p));
            const bytes = await newDoc.save();
            await reloadAfterEdit(new Uint8Array(bytes));
            toast('Sayfa sırası güncellendi', 'success');
        } catch (err) { toast('Hata: ' + err.message, 'error'); }
        hideLoading();
    }

    /* ============================================================
       SIDEBAR & TOOL PANEL
       ============================================================ */
    function buildSidebar() {
        const list = $('#tool-list');
        TOOLS.forEach(tool => {
            const card = el('div', {
                className: 'tool-card disabled',
                'data-tool': tool.id,
                onClick: () => selectTool(tool.id),
            }, [
                el('span', { className: 'tool-card-icon', textContent: tool.icon }),
                el('div', { className: 'tool-card-info' }, [
                    el('div', { className: 'tool-card-name', textContent: tool.name }),
                    el('div', { className: 'tool-card-desc', textContent: tool.desc }),
                ]),
            ]);
            list.appendChild(card);
        });
    }

    function enableTools() {
        $$('.tool-card').forEach(c => c.classList.remove('disabled'));
    }

    function selectTool(toolId) {
        if (!state.pdfBytes) return;
        
        // Toggle off
        if (state.currentTool === toolId) {
            closeTool();
            return;
        }

        state.currentTool = toolId;
        $$('.tool-card').forEach(c => c.classList.toggle('active', c.dataset.tool === toolId));
        
        // Enable/disable reorder mode
        const grid = $('#thumbnail-grid');
        grid.classList.toggle('reorder-mode', toolId === 'reorder');
        $$('.thumb-card').forEach(c => c.draggable = toolId === 'reorder');

        showToolPanel(toolId);
    }

    function closeTool() {
        state.currentTool = null;
        $$('.tool-card').forEach(c => c.classList.remove('active'));
        $('#tool-panel').classList.remove('open');
        $('#thumbnail-grid').classList.remove('reorder-mode');
        $$('.thumb-card').forEach(c => c.draggable = false);
    }

    function showToolPanel(toolId) {
        const panel = $('#tool-panel');
        const title = $('#tool-panel-title');
        const body = $('#tool-panel-body');
        const footer = $('#tool-panel-footer');
        const tool = TOOLS.find(t => t.id === toolId);
        title.textContent = tool.icon + ' ' + tool.name;
        body.innerHTML = '';
        footer.style.display = '';

        const panels = {
            'merge-pages': panelMergePages,
            'merge-pdfs': panelMergePDFs,
            'split': panelSplit,
            'rotate': panelRotate,
            'delete': panelDelete,
            'reorder': panelReorder,
            'extract': panelExtract,
            'watermark': panelWatermark,
            'page-numbers': panelPageNumbers,
            'orientation': panelOrientation,
            'resize': panelResize,
        };

        if (panels[toolId]) panels[toolId](body);

        // Special: hide footer for reorder (it works via drag & drop)
        if (toolId === 'reorder') footer.style.display = 'none';

        panel.classList.add('open');
    }

    /* ============================================================
       TOOL PANELS (UI)
       ============================================================ */
    function panelMergePages(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Sayfaları gruplar halinde birleştirip tek sayfa yapar. Örneğin 2'şer birleştirme 90 sayfayı 45 sayfaya düşürür.</div>
            <div class="form-group">
                <label class="form-label">Kaç Sayfa Birleştirilsin?</label>
                <select class="form-select" id="opt-merge-n">
                    <option value="2">2 sayfa → 1 sayfa</option>
                    <option value="3">3 sayfa → 1 sayfa</option>
                    <option value="4">4 sayfa → 1 sayfa</option>
                    <option value="6">6 sayfa → 1 sayfa</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Birleştirme Yönü</label>
                <div class="radio-group" id="opt-merge-dir">
                    <label class="radio-option active"><input type="radio" name="merge-dir" value="vertical" checked> ↕ Dikey (üst üste)</label>
                    <label class="radio-option"><input type="radio" name="merge-dir" value="horizontal"> ↔ Yatay (yan yana)</label>
                </div>
            </div>`;
        body.querySelectorAll('.radio-option').forEach(opt => {
            opt.addEventListener('click', () => {
                body.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                opt.querySelector('input').checked = true;
            });
        });
    }

    function panelMergePDFs(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Birden fazla PDF dosyasını sırayla birleştirir.</div>
            <div class="merge-file-list" id="merge-file-list">
                <div class="merge-file-item">
                    <span class="file-order">1</span>
                    <span class="file-label" id="merge-current-file">${state.fileName}</span>
                </div>
            </div>
            <button class="btn btn-ghost btn-block" id="btn-add-merge-file">➕ PDF Ekle</button>`;
        $('#btn-add-merge-file').addEventListener('click', () => {
            const input = $('#file-input-multi');
            input.onchange = async (e) => {
                for (const file of e.target.files) {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    state.additionalFiles.push({ name: file.name, bytes });
                    const list = $('#merge-file-list');
                    const idx = list.children.length + 1;
                    const item = el('div', { className: 'merge-file-item' }, [
                        el('span', { className: 'file-order', textContent: idx }),
                        el('span', { className: 'file-label', textContent: file.name }),
                        el('button', { className: 'btn-remove-file', textContent: '✕', onClick: () => {
                            const fileIdx = state.additionalFiles.findIndex(f => f.name === file.name);
                            if (fileIdx >= 0) state.additionalFiles.splice(fileIdx, 1);
                            item.remove();
                            refreshMergeOrder();
                        }}),
                    ]);
                    list.appendChild(item);
                }
                input.value = '';
            };
            input.click();
        });
    }

    function refreshMergeOrder() {
        $$('#merge-file-list .merge-file-item').forEach((item, i) => {
            item.querySelector('.file-order').textContent = i + 1;
        });
    }

    function panelSplit(body) {
        body.innerHTML = `
            <div class="info-box info-primary">PDF'i belirtilen aralıklara göre böler ve yeni PDF olarak indirir.</div>
            <div class="form-group">
                <label class="form-label">Sayfa Aralığı</label>
                <input class="form-input" id="opt-split-range" placeholder="ör: 1-5, 8, 10-15" value="1-${state.pageCount}">
                <p class="form-hint">Virgülle ayırarak birden fazla aralık belirtebilirsiniz.</p>
            </div>`;
    }

    function panelRotate(body) {
        body.innerHTML = `
            <div class="info-box">Önce thumbnail'lardan döndürmek istediğiniz sayfaları seçin.</div>
            <div class="form-group">
                <label class="form-label">Döndürme Açısı</label>
                <div class="radio-group" id="opt-rotate-angle">
                    <label class="radio-option active"><input type="radio" name="rotate" value="90" checked> ↻ 90° Saat Yönü</label>
                    <label class="radio-option"><input type="radio" name="rotate" value="180"> ↕ 180°</label>
                    <label class="radio-option"><input type="radio" name="rotate" value="270"> ↺ 90° Saat Yönü Tersi</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group" id="opt-rotate-scope">
                    <label class="radio-option active"><input type="radio" name="rotate-scope" value="selected" checked> Seçili Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="rotate-scope" value="all"> Tüm Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelDelete(body) {
        body.innerHTML = `
            <div class="info-box">Silmek istediğiniz sayfaları thumbnail'lardan seçin, ardından <strong>Uygula</strong> butonuna tıklayın.</div>
            <p class="form-hint" style="margin-top:8px;">Seçili sayfa sayısı: <strong id="delete-count">${state.selectedPages.size}</strong></p>`;
    }

    function panelReorder(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Sayfaları yeniden sıralamak için thumbnail kartlarını <strong>sürükleyip bırakın</strong>.</div>
            <p class="form-hint">Her sürükle-bırak işlemi otomatik olarak uygulanır.</p>`;
    }

    function panelExtract(body) {
        body.innerHTML = `
            <div class="info-box">Çıkarmak istediğiniz sayfaları seçin veya aralık girin.</div>
            <div class="form-group">
                <label class="form-label">Sayfa Aralığı (opsiyonel)</label>
                <input class="form-input" id="opt-extract-range" placeholder="ör: 1-5, 8, 10-15">
                <p class="form-hint">Boş bırakırsanız seçili thumbnail'lar kullanılır.</p>
            </div>`;
    }

    function panelWatermark(body) {
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label">Filigran Metni</label>
                <input class="form-input" id="opt-wm-text" placeholder="ör: GİZLİ" value="TASLAK">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Yazı Boyutu</label>
                    <input class="form-input" id="opt-wm-size" type="number" value="60" min="10" max="200">
                </div>
                <div class="form-group">
                    <label class="form-label">Opaklık</label>
                    <input class="form-input" id="opt-wm-opacity" type="number" value="15" min="1" max="100">
                    <p class="form-hint">% değer</p>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Renk</label>
                    <input class="form-color" id="opt-wm-color" type="color" value="#888888">
                </div>
                <div class="form-group">
                    <label class="form-label">Açı (°)</label>
                    <input class="form-input" id="opt-wm-angle" type="number" value="45" min="-90" max="90">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="wm-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="wm-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelPageNumbers(body) {
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label">Konum</label>
                <select class="form-select" id="opt-pn-pos">
                    <option value="bottom-center">Alt Orta</option>
                    <option value="bottom-right">Alt Sağ</option>
                    <option value="bottom-left">Alt Sol</option>
                    <option value="top-center">Üst Orta</option>
                    <option value="top-right">Üst Sağ</option>
                    <option value="top-left">Üst Sol</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Format</label>
                <select class="form-select" id="opt-pn-format">
                    <option value="{n}">1, 2, 3...</option>
                    <option value="{n}/{total}">1/45, 2/45...</option>
                    <option value="Sayfa {n}">Sayfa 1, Sayfa 2...</option>
                    <option value="Sayfa {n} / {total}">Sayfa 1 / 45...</option>
                    <option value="- {n} -">- 1 -, - 2 -...</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Yazı Boyutu</label>
                    <input class="form-input" id="opt-pn-size" type="number" value="11" min="6" max="36">
                </div>
                <div class="form-group">
                    <label class="form-label">Başlangıç No</label>
                    <input class="form-input" id="opt-pn-start" type="number" value="1" min="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Renk</label>
                <input class="form-color" id="opt-pn-color" type="color" value="#333333">
            </div>`;
    }

    function panelOrientation(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Sayfaların yönünü değiştirir (dikey ↔ yatay). İçerik 90° döndürülür ve sayfa boyutları ters çevrilir.</div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="orient-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="orient-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelResize(body) {
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label">Hedef Boyut</label>
                <select class="form-select" id="opt-resize-preset">
                    <option value="A4">A4 (210×297 mm)</option>
                    <option value="A3">A3 (297×420 mm)</option>
                    <option value="A5">A5 (148×210 mm)</option>
                    <option value="B5">B5 (176×250 mm)</option>
                    <option value="Letter">Letter (8.5×11 in)</option>
                    <option value="Legal">Legal (8.5×14 in)</option>
                    <option value="custom">Özel Boyut</option>
                </select>
            </div>
            <div id="custom-size-group" style="display:none">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Genişlik (mm)</label>
                        <input class="form-input" id="opt-resize-w" type="number" value="210" min="10">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Yükseklik (mm)</label>
                        <input class="form-input" id="opt-resize-h" type="number" value="297" min="10">
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">İçerik Ölçekleme</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="resize-mode" value="fit" checked> Sığdır (en-boy oranını koru)</label>
                    <label class="radio-option"><input type="radio" name="resize-mode" value="stretch"> Gerdır (sayfayı doldur)</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="resize-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="resize-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
        $('#opt-resize-preset').addEventListener('change', e => {
            $('#custom-size-group').style.display = e.target.value === 'custom' ? '' : 'none';
        });
    }

    function initRadioGroups(container) {
        container.querySelectorAll('.radio-group').forEach(group => {
            group.querySelectorAll('.radio-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    opt.querySelector('input').checked = true;
                });
            });
        });
    }

    /* ============================================================
       PDF TOOL ENGINES
       ============================================================ */
    async function applyTool() {
        if (!state.currentTool || !state.pdfBytes) return;

        const handlers = {
            'merge-pages': execMergePages,
            'merge-pdfs': execMergePDFs,
            'split': execSplit,
            'rotate': execRotate,
            'delete': execDelete,
            'extract': execExtract,
            'watermark': execWatermark,
            'page-numbers': execPageNumbers,
            'orientation': execOrientation,
            'resize': execResize,
        };

        const handler = handlers[state.currentTool];
        if (!handler) return;

        showLoading();
        try {
            const result = await handler();
            if (result) {
                await reloadAfterEdit(new Uint8Array(result));
                toast('İşlem başarıyla tamamlandı!', 'success');
            }
        } catch (err) {
            console.error(err);
            toast('Hata: ' + err.message, 'error');
        }
        hideLoading();
    }

    /* ---- 1. Merge Pages N-by-N ---- */
    async function execMergePages() {
        const n = parseInt($('#opt-merge-n').value);
        const dir = document.querySelector('input[name="merge-dir"]:checked').value;
        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pageCount = srcDoc.getPageCount();
        const allIndices = Array.from({ length: pageCount }, (_, i) => i);
        const embedded = await newDoc.embedPdf(srcDoc, allIndices);

        for (let i = 0; i < pageCount; i += n) {
            const group = [];
            for (let j = 0; j < n && i + j < pageCount; j++) group.push(i + j);

            const w = embedded[group[0]].width;
            const h = embedded[group[0]].height;
            let newW, newH;
            if (dir === 'vertical') { newW = w; newH = h * group.length; }
            else { newW = w * group.length; newH = h; }

            const page = newDoc.addPage([newW, newH]);
            for (let j = 0; j < group.length; j++) {
                let x, y;
                if (dir === 'vertical') { x = 0; y = h * (group.length - 1 - j); }
                else { x = w * j; y = 0; }
                page.drawPage(embedded[group[j]], { x, y, width: w, height: h });
            }
        }
        return await newDoc.save();
    }

    /* ---- 2. Merge PDFs ---- */
    async function execMergePDFs() {
        if (state.additionalFiles.length === 0) {
            toast('Lütfen birleştirmek için ek PDF dosyası ekleyin.', 'error');
            return null;
        }
        const newDoc = await PDFDocument.create();
        const allDocs = [state.pdfBytes, ...state.additionalFiles.map(f => f.bytes)];
        for (const bytes of allDocs) {
            const src = await PDFDocument.load(bytes);
            const pages = await newDoc.copyPages(src, src.getPageIndices());
            pages.forEach(p => newDoc.addPage(p));
        }
        state.additionalFiles = [];
        return await newDoc.save();
    }

    /* ---- 3. Split ---- */
    async function execSplit() {
        const rangeStr = $('#opt-split-range').value;
        const indices = parseRanges(rangeStr, state.pageCount);
        if (indices.length === 0) { toast('Geçersiz sayfa aralığı.', 'error'); return null; }

        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pages = await newDoc.copyPages(srcDoc, indices);
        pages.forEach(p => newDoc.addPage(p));
        return await newDoc.save();
    }

    /* ---- 4. Rotate ---- */
    async function execRotate() {
        const angle = parseInt(document.querySelector('input[name="rotate"]:checked').value);
        const scope = document.querySelector('input[name="rotate-scope"]:checked').value;
        const doc = await PDFDocument.load(state.pdfBytes);
        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];

        if (indices.length === 0) { toast('Lütfen döndürülecek sayfaları seçin.', 'error'); return null; }

        for (const idx of indices) {
            const page = pages[idx];
            const cur = page.getRotation().angle;
            page.setRotation(degrees((cur + angle) % 360));
        }
        return await doc.save();
    }

    /* ---- 5. Delete ---- */
    async function execDelete() {
        if (state.selectedPages.size === 0) { toast('Lütfen silinecek sayfaları seçin.', 'error'); return null; }
        if (state.selectedPages.size >= state.pageCount) { toast('Tüm sayfalar silinemez!', 'error'); return null; }

        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const keepIndices = [];
        for (let i = 0; i < srcDoc.getPageCount(); i++) {
            if (!state.selectedPages.has(i)) keepIndices.push(i);
        }
        const pages = await newDoc.copyPages(srcDoc, keepIndices);
        pages.forEach(p => newDoc.addPage(p));
        return await newDoc.save();
    }

    /* ---- 7. Extract ---- */
    async function execExtract() {
        const rangeStr = $('#opt-extract-range')?.value?.trim();
        let indices;
        if (rangeStr) {
            indices = parseRanges(rangeStr, state.pageCount);
        } else {
            indices = [...state.selectedPages].sort((a, b) => a - b);
        }
        if (indices.length === 0) { toast('Lütfen çıkarmak istediğiniz sayfaları seçin.', 'error'); return null; }

        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pages = await newDoc.copyPages(srcDoc, indices);
        pages.forEach(p => newDoc.addPage(p));
        return await newDoc.save();
    }

    /* ---- 8. Watermark ---- */
    async function execWatermark() {
        const text = $('#opt-wm-text').value || 'TASLAK';
        const fontSize = parseInt($('#opt-wm-size').value) || 60;
        const opacity = (parseInt($('#opt-wm-opacity').value) || 15) / 100;
        const angle = parseInt($('#opt-wm-angle').value) || 45;
        const colorHex = $('#opt-wm-color').value;
        const scope = document.querySelector('input[name="wm-scope"]:checked').value;

        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        const doc = await PDFDocument.load(state.pdfBytes);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];

        for (const idx of indices) {
            const page = pages[idx];
            const { width, height } = page.getSize();
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            const x = width / 2 - textWidth / 2;
            const y = height / 2;
            page.drawText(text, {
                x, y, size: fontSize, font,
                color: rgb(r, g, b), opacity,
                rotate: degrees(angle),
            });
        }
        return await doc.save();
    }

    /* ---- 9. Page Numbers ---- */
    async function execPageNumbers() {
        const pos = $('#opt-pn-pos').value;
        const format = $('#opt-pn-format').value;
        const fontSize = parseInt($('#opt-pn-size').value) || 11;
        const startNum = parseInt($('#opt-pn-start').value) || 1;
        const colorHex = $('#opt-pn-color').value;
        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        const doc = await PDFDocument.load(state.pdfBytes);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const total = pages.length;
        const margin = 30;

        for (let i = 0; i < total; i++) {
            const page = pages[i];
            const { width, height } = page.getSize();
            const num = startNum + i;
            const text = format.replace('{n}', num).replace('{total}', total);
            const tw = font.widthOfTextAtSize(text, fontSize);

            let x, y;
            const [vPos, hPos] = pos.split('-');
            y = vPos === 'top' ? height - margin : margin;
            if (hPos === 'left') x = margin;
            else if (hPos === 'right') x = width - margin - tw;
            else x = width / 2 - tw / 2;

            page.drawText(text, { x, y, size: fontSize, font, color: rgb(r, g, b) });
        }
        return await doc.save();
    }

    /* ---- 10. Orientation ---- */
    async function execOrientation() {
        const scope = document.querySelector('input[name="orient-scope"]:checked').value;
        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pages = srcDoc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];

        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        const embeddedPages = await newDoc.embedPdf(srcDoc, srcDoc.getPageIndices());

        for (let i = 0; i < pages.length; i++) {
            if (indices.includes(i)) {
                const { width, height } = pages[i].getSize();
                const newPage = newDoc.addPage([height, width]);
                newPage.drawPage(embeddedPages[i], {
                    x: 0, y: width,
                    width, height,
                    rotate: degrees(-90),
                });
            } else {
                const [copied] = await newDoc.copyPages(srcDoc, [i]);
                newDoc.addPage(copied);
            }
        }
        return await newDoc.save();
    }

    /* ---- 11. Resize ---- */
    async function execResize() {
        const preset = $('#opt-resize-preset').value;
        let targetW, targetH;
        if (preset === 'custom') {
            targetW = parseFloat($('#opt-resize-w').value) / 25.4 * 72;
            targetH = parseFloat($('#opt-resize-h').value) / 25.4 * 72;
        } else {
            [targetW, targetH] = PAGE_PRESETS[preset];
        }
        const mode = document.querySelector('input[name="resize-mode"]:checked').value;
        const scope = document.querySelector('input[name="resize-scope"]:checked').value;

        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pages = srcDoc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        const embeddedPages = await newDoc.embedPdf(srcDoc, srcDoc.getPageIndices());

        for (let i = 0; i < pages.length; i++) {
            if (indices.includes(i)) {
                const { width: origW, height: origH } = pages[i].getSize();
                const newPage = newDoc.addPage([targetW, targetH]);
                let drawW, drawH, drawX, drawY;

                if (mode === 'fit') {
                    const scale = Math.min(targetW / origW, targetH / origH);
                    drawW = origW * scale;
                    drawH = origH * scale;
                    drawX = (targetW - drawW) / 2;
                    drawY = (targetH - drawH) / 2;
                } else {
                    drawW = targetW;
                    drawH = targetH;
                    drawX = 0;
                    drawY = 0;
                }
                newPage.drawPage(embeddedPages[i], { x: drawX, y: drawY, width: drawW, height: drawH });
            } else {
                const [copied] = await newDoc.copyPages(srcDoc, [i]);
                newDoc.addPage(copied);
            }
        }
        return await newDoc.save();
    }

    /* ---- Range Parser ---- */
    function parseRanges(str, max) {
        const indices = [];
        const parts = str.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
            if (match) {
                const start = Math.max(1, parseInt(match[1]));
                const end = Math.min(max, parseInt(match[2]));
                for (let i = start; i <= end; i++) indices.push(i - 1);
            } else {
                const n = parseInt(trimmed);
                if (n >= 1 && n <= max) indices.push(n - 1);
            }
        }
        return [...new Set(indices)].sort((a, b) => a - b);
    }

    /* ============================================================
       DOWNLOAD
       ============================================================ */
    function downloadPdf() {
        if (!state.pdfBytes) return;
        const blob = new Blob([state.pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: state.fileName.replace('.pdf', '_düzenlenmiş.pdf') });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('PDF indirildi!', 'success');
    }

    /* ============================================================
       UNDO
       ============================================================ */
    async function undo() {
        if (state.history.length === 0) { toast('Geri alınacak işlem yok.', 'info'); return; }
        showLoading('Geri alınıyor...');
        const prev = state.history.pop();
        state.pdfBytes = prev;
        state.selectedPages.clear();
        const loadingTask = pdfjsLib.getDocument({ data: prev.slice(0) });
        state.pdfJsDoc = await loadingTask.promise;
        state.pageCount = state.pdfJsDoc.numPages;
        $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(prev.length)}`;
        await renderThumbnails();
        hideLoading();
        toast('İşlem geri alındı.', 'success');
    }

    /* ============================================================
       EVENT LISTENERS & INIT
       ============================================================ */
    function init() {
        buildSidebar();

        // File input
        const fileInput = $('#file-input');
        $('#btn-select-file').addEventListener('click', () => fileInput.click());
        $('#btn-new-file').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showLoading('PDF yükleniyor...');
            const bytes = new Uint8Array(await file.arrayBuffer());
            await loadPdfBytes(bytes, file.name);
            hideLoading();
            fileInput.value = '';
        });

        // Drag & drop on drop zone
        const dropZone = $('#drop-zone');
        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
        });
        dropZone.addEventListener('drop', async (e) => {
            const file = e.dataTransfer.files[0];
            if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
                toast('Lütfen bir PDF dosyası bırakın.', 'error');
                return;
            }
            showLoading('PDF yükleniyor...');
            const bytes = new Uint8Array(await file.arrayBuffer());
            await loadPdfBytes(bytes, file.name);
            hideLoading();
        });

        // Header buttons
        $('#btn-download').addEventListener('click', downloadPdf);
        $('#btn-undo').addEventListener('click', undo);
        $('#btn-close-panel').addEventListener('click', closeTool);
        $('#btn-apply-tool').addEventListener('click', applyTool);

        // Select all / deselect
        $('#btn-select-all').addEventListener('click', () => {
            for (let i = 0; i < state.pageCount; i++) state.selectedPages.add(i);
            $$('.thumb-card').forEach(c => c.classList.add('selected'));
            updateSelectionCount();
        });
        $('#btn-deselect-all').addEventListener('click', () => {
            state.selectedPages.clear();
            $$('.thumb-card').forEach(c => c.classList.remove('selected'));
            updateSelectionCount();
        });

        // Zoom
        $('#btn-zoom-in').addEventListener('click', () => {
            state.zoomLevel = Math.min(2.5, state.zoomLevel + 0.25);
            $('#zoom-level').textContent = Math.round(state.zoomLevel * 100) + '%';
            renderThumbnails();
        });
        $('#btn-zoom-out').addEventListener('click', () => {
            state.zoomLevel = Math.max(0.5, state.zoomLevel - 0.25);
            $('#zoom-level').textContent = Math.round(state.zoomLevel * 100) + '%';
            renderThumbnails();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        });

        // Global drop prevention
        document.addEventListener('dragover', e => e.preventDefault());
        document.addEventListener('drop', e => e.preventDefault());
    }

    // Start!
    init();
})();
