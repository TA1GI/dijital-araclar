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
        { id: 'rotate', name: 'Döndürme & Yön', icon: '🔄', desc: 'Döndür veya yönü değiştir (dikey ↔ yatay)' },
        { id: 'delete', name: 'Sayfa Sil / Çıkar', icon: '🗑️', desc: 'Seçili sayfaları sil veya ayrı PDF olarak çıkar' },
        { id: 'watermark', name: 'Filigran Ekle', icon: '💧', desc: 'Metin filigranı ekle' },
        { id: 'page-numbers', name: 'Sayfa Numarası', icon: '🔢', desc: 'Numara ekle' },
        { id: 'resize', name: 'Boyut Değiştir', icon: '📐', desc: 'Sayfa boyutunu değiştir' },
        { id: 'text-color', name: 'Metin Rengi', icon: '🎨', desc: 'Metin renklerini değiştir' },
        { id: 'bg-color', name: 'Arka Plan Rengi', icon: '🖌️', desc: 'Sayfa arka plan rengini değiştir' },
        { id: 'header-footer', name: 'Üst/Alt Bilgi', icon: '📋', desc: 'Her sayfaya sabit metin ekle' },
        { id: 'stamp', name: 'Damga', icon: '🔏', desc: 'Hazır damga/mühür ekle' },
        { id: 'add-image', name: 'Resim Ekle', icon: '🖼️', desc: 'Sayfalara görsel yerleştir' },
        { id: 'crop', name: 'Sayfa Kırpma', icon: '🔲', desc: 'Sayfa kenarlarını kırp' },
        { id: 'add-blank', name: 'Boş Sayfa Ekle', icon: '📃', desc: 'Araya/sona boş sayfa ekle' },
        { id: 'duplicate', name: 'Sayfa Çoğalt', icon: '🔁', desc: 'Seçili sayfaları kopyala' },
        { id: 'export-images', name: 'Görsel Aktar', icon: '📸', desc: 'Sayfaları resim olarak indir' },
        { id: 'images-to-pdf', name: 'Görselden PDF', icon: '🏞️', desc: 'Mevcut PDF\'e görsel sayfa ekle' },
        { id: 'compress', name: 'Sıkıştır', icon: '📦', desc: 'Dosya boyutunu küçült' },
        { id: 'metadata', name: 'PDF Bilgileri', icon: 'ℹ️', desc: 'Metadata görüntüle/düzenle' },
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
        pageOrder: [],
        pendingReorder: false,
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
        state.pendingReorder = false;

        try {
            const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
            state.pdfJsDoc = await loadingTask.promise;
            state.pageCount = state.pdfJsDoc.numPages;
        } catch (err) {
            toast('PDF dosyası yüklenemedi: ' + err.message, 'error');
            return;
        }

        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);

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
        state.pendingReorder = false;

        const loadingTask = pdfjsLib.getDocument({ data: newBytes.slice(0) });
        state.pdfJsDoc = await loadingTask.promise;
        state.pageCount = state.pdfJsDoc.numPages;
        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);

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
    /* ============================================================
       THUMBNAIL HELPER UTILITIES (module-level scope)
       ============================================================ */
    /** Rotate a canvas by angle (90/180/270) and return new canvas */
    function rotateCanvasBy(canvas, angle) {
        const w = canvas.width, h = canvas.height;
        const nc = document.createElement('canvas');
        if (angle === 90 || angle === 270) { nc.width = h; nc.height = w; }
        else { nc.width = w; nc.height = h; }
        const ctx = nc.getContext('2d');
        ctx.translate(nc.width / 2, nc.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(canvas, -w / 2, -h / 2);
        return nc;
    }

    /** Re-index all thumb cards in DOM after add/remove operations */
    function renumberThumbnails() {
        const newSelected = new Set();
        $$('.thumb-card').forEach((card, i) => {
            if (card.classList.contains('selected')) newSelected.add(i);
            card.dataset.index = i;
            card.querySelector('.thumb-label').textContent = `${i + 1}`;
            const canvas = card.querySelector('canvas');
            if (canvas) canvas.dataset.page = i + 1; // Sync for IntersectionObserver
        });
        state.selectedPages = newSelected;
        state.pageCount = $$('.thumb-card').length;
        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
        updateSelectionCount();
        $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(state.pdfBytes ? state.pdfBytes.length : 0)}`;
    }

    /** Commit new PDF bytes to state WITHOUT re-rendering thumbnails */
    async function commitPdfBytes(newBytes) {
        if (!newBytes) return;
        state.history.push(state.pdfBytes);
        if (state.history.length > 20) state.history.shift();
        state.pdfBytes = new Uint8Array(newBytes);
        state.pendingReorder = false;
        state.pdfJsDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
        $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(state.pdfBytes.length)}`;
    }

    /** Attach all drag/click events to a thumb card */
    function attachThumbEvents(card) {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('thumb-drag-handle')) return;
            if (e.target.closest('.thumb-actions')) return;
            togglePageSelection(parseInt(card.dataset.index));
        });
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragover', onDragOver);
        card.addEventListener('drop', onDrop);
        card.addEventListener('dragend', onDragEnd);
        card.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over-card'));

        // Add edit & delete buttons if not already present
        if (!card.querySelector('.thumb-actions')) {
            const actions = document.createElement('div');
            actions.className = 'thumb-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'thumb-edit-btn';
            editBtn.textContent = '✏️ Düzenle';
            editBtn.title = 'Sayfayı Düzenle';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPageEditor(parseInt(card.dataset.index));
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'thumb-delete-btn';
            deleteBtn.textContent = '🗑️ Sil';
            deleteBtn.title = 'Sayfayı Sil';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(card.dataset.index);
                state.selectedPages.clear();
                state.selectedPages.add(idx);
                document.getElementById('btn-quick-delete').click();
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            card.appendChild(actions);
        }
    }

    /** Create a blank white canvas with given dimensions */
    function createBlankCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        return c;
    }

    /* ============================================================
       THUMBNAIL RENDERING
       ============================================================ */
    async function renderThumbnails() {
        const grid = $('#thumbnail-grid');
        grid.innerHTML = '';
        const containerW = grid.clientWidth - 48;
        const baseW = Math.max(120, Math.min(containerW, Math.floor(containerW * state.zoomLevel / 5)));
        grid.style.setProperty('--thumb-width', baseW + 'px');

        if (state._thumbObserver) state._thumbObserver.disconnect();
        state._thumbObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const canvas = entry.target;
                    if (canvas.dataset.rendered === "true") return;
                    canvas.dataset.rendered = "true";
                    
                    const pageNum = parseInt(canvas.dataset.page);
                    state.pdfJsDoc.getPage(pageNum).then(page => {
                        const scale = Math.min(0.6 * state.zoomLevel, 2.5);
                        const vp = page.getViewport({ scale });
                        canvas.width = vp.width;
                        canvas.height = vp.height;
                        canvas.style.aspectRatio = 'auto'; // Remove placeholder
                        const ctx = canvas.getContext('2d');
                        page.render({ canvasContext: ctx, viewport: vp });
                    }).catch(err => console.error("Sayfa render hatası:", err));
                }
            });
        }, { root: grid, rootMargin: '300px' });

        for (let i = 1; i <= state.pageCount; i++) {
            const canvas = el('canvas', { 'data-page': i });
            // Placeholder boyutu, Intersection Observer'ın çalışması için gerekli
            canvas.style.aspectRatio = '1 / 1.414'; 

            const idx = i - 1;
            const card = el('div', {
                className: 'thumb-card' + (state.selectedPages.has(idx) ? ' selected' : ''),
                'data-index': idx,
                draggable: 'true',
            }, [
                el('span', { className: 'thumb-drag-handle', textContent: '⠿' }),
                canvas,
                el('span', { className: 'thumb-check', textContent: '✓' }),
                el('span', { className: 'thumb-label', textContent: `${i}` }),
            ]);

            attachThumbEvents(card);
            grid.appendChild(card);
            state._thumbObserver.observe(canvas);
        }
        updateSelectionCount();
    }


    function togglePageSelection(idx) {
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

    /* ---- Drag & Drop Reorder (always active, instant) ---- */
    function onDragStart(e) {
        state.dragSrcIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', state.dragSrcIndex);
    }
    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over-card');
    }
    function onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over-card');
        const targetIdx = parseInt(e.currentTarget.dataset.index);
        if (state.dragSrcIndex !== null && state.dragSrcIndex !== targetIdx) {
            applyReorder(state.dragSrcIndex, targetIdx);
        }
    }
    function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); state.dragSrcIndex = null; }

    function applyReorder(fromIdx, toIdx) {
        // Instant DOM manipulation - no PDF rebuild
        const grid = $('#thumbnail-grid');
        const cards = [...grid.querySelectorAll('.thumb-card')];
        const movedCard = cards[fromIdx];
        const targetCard = cards[toIdx];

        if (fromIdx < toIdx) {
            targetCard.after(movedCard);
        } else {
            targetCard.before(movedCard);
        }

        // Update pageOrder
        const [moved] = state.pageOrder.splice(fromIdx, 1);
        state.pageOrder.splice(toIdx, 0, moved);
        state.pendingReorder = true;

        // Update visual indices and labels
        const newSelected = new Set();
        grid.querySelectorAll('.thumb-card').forEach((card, i) => {
            if (card.classList.contains('selected')) newSelected.add(i);
            card.dataset.index = i;
            card.querySelector('.thumb-label').textContent = `${i + 1}`;
        });
        state.selectedPages = newSelected;
        updateSelectionCount();

        toast('Sayfa sırası güncellendi', 'success');
    }

    async function commitPageOrder() {
        if (!state.pendingReorder || !state.pdfBytes) return;
        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const pages = await newDoc.copyPages(srcDoc, state.pageOrder);
        pages.forEach(p => newDoc.addPage(p));
        const bytes = await newDoc.save();
        state.history.push(state.pdfBytes);
        if (state.history.length > 20) state.history.shift();
        state.pdfBytes = new Uint8Array(bytes);
        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
        state.pendingReorder = false;
        // Reload pdf.js doc
        state.pdfJsDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
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

        showToolPanel(toolId);
    }

    function closeTool() {
        // Revert preview if active
        if (state._previewActive && state._previewBase) {
            state.pdfBytes = state._previewBase;
            const loadAndRender = async () => {
                state.pdfJsDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
                state.pageCount = state.pdfJsDoc.numPages;
                await renderThumbnails();
            };
            loadAndRender();
        }
        state._previewActive = false;
        state._previewBase = null;
        state._previewResult = null;
        state._previewTimer = null;
        state.currentTool = null;
        $$('.tool-card').forEach(c => c.classList.remove('active'));
        $('#tool-panel').classList.remove('open');
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
            'watermark': panelWatermark,
            'page-numbers': panelPageNumbers,
            'resize': panelResize,
            'text-color': panelTextColor,
            'bg-color': panelBgColor,
            'header-footer': panelHeaderFooter,
            'stamp': panelStamp,
            'add-image': panelAddImage,
            'crop': panelCrop,
            'add-blank': panelAddBlank,
            'duplicate': panelDuplicate,
            'export-images': panelExportImages,
            'images-to-pdf': panelImagesToPdf,
            'compress': panelCompress,
            'metadata': panelMetadata,
        };

        if (panels[toolId]) panels[toolId](body);

        // Special: hide footer for tools that don't use the apply button
        if (['export-images', 'metadata'].includes(toolId)) footer.style.display = 'none';

        panel.classList.add('open');

        // Start live preview system
        state._previewBase = state.pdfBytes;
        state._previewActive = false;
        state._previewResult = null;
        const noPreview = ['export-images', 'images-to-pdf', 'metadata', 'merge-pdfs', 'compress', 'add-image'];
        if (!noPreview.includes(toolId)) {
            setTimeout(() => attachPreviewListeners(), 150);
        }
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
            <div class="info-box">Önce thumbnail'lardan işlem yapmak istediğiniz sayfaları seçin.</div>
            <div class="form-group">
                <label class="form-label">İşlem Türü</label>
                <div class="radio-group" id="opt-rotate-mode">
                    <label class="radio-option active"><input type="radio" name="rotate-mode" value="rotate" checked> 🔄 Döndür</label>
                    <label class="radio-option"><input type="radio" name="rotate-mode" value="orientation"> ↔️ Yön Değiştir (dikey ↔ yatay)</label>
                </div>
            </div>
            <div id="rotate-angle-group">
                <div class="form-group">
                    <label class="form-label">Döndürme Açısı</label>
                    <div class="radio-group" id="opt-rotate-angle">
                        <label class="radio-option active"><input type="radio" name="rotate" value="90" checked> ↻ 90° Saat Yönü</label>
                        <label class="radio-option"><input type="radio" name="rotate" value="180"> ↕ 180°</label>
                        <label class="radio-option"><input type="radio" name="rotate" value="270"> ↺ 90° Saat Yönü Tersi</label>
                    </div>
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
        // Toggle rotate angle group visibility
        body.querySelectorAll('input[name="rotate-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const angleGroup = body.querySelector('#rotate-angle-group');
                angleGroup.style.display = radio.value === 'rotate' ? '' : 'none';
            });
        });
    }

    function panelDelete(body) {
        body.innerHTML = `
            <div class="info-box">Önce thumbnail'lardan sayfaları seçin, ardından işlemi seçin.</div>
            <p class="form-hint" style="margin-top:8px;">Seçili sayfa sayısı: <strong id="delete-count">${state.selectedPages.size}</strong></p>
            <div class="form-group" style="margin-top:12px;">
                <label class="form-label">İşlem</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="delete-mode" value="delete" checked> 🗑️ Seçili sayfaları SİL</label>
                    <label class="radio-option"><input type="radio" name="delete-mode" value="extract"> 📤 Seçili sayfaları ayrı PDF olarak ÇIKAR</label>
                </div>
            </div>
            <div class="form-group" id="delete-range-group">
                <label class="form-label">Sayfa Aralığı (opsiyonel, sadece çıkarma için)</label>
                <input class="form-input" id="opt-delete-range" placeholder="ör: 1-5, 8, 10-15">
                <p class="form-hint">Boş bırakırsanız seçili thumbnail'lar kullanılır.</p>
            </div>`;
        initRadioGroups(body);
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

    function panelTextColor(body) {
        body.innerHTML = `
            <div class="info-box info-primary">PDF'deki tüm metinlerin rengini değiştirir. Arka plan, çizgiler ve görseller etkilenmez — yalnızca metin rengi değişir.</div>
            <div class="form-group">
                <label class="form-label">Metin Rengi</label>
                <div style="display:flex;align-items:center;gap:12px;">
                    <input class="form-color" id="opt-tc-color" type="color" value="#000000" style="width:48px;height:40px;">
                    <span class="form-hint" id="opt-tc-color-label" style="margin:0;font-size:0.85rem;">#000000</span>
                </div>
            </div>
            <div class="divider"></div>
            <div class="form-group">
                <label class="form-label">Hangi Sayfalara Uygulansın?</label>
                <div class="radio-group" id="opt-tc-scope-group">
                    <label class="radio-option active"><input type="radio" name="tc-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="tc-scope" value="selected"> Seçili Sayfalara (thumbnail)</label>
                    <label class="radio-option"><input type="radio" name="tc-scope" value="range"> Sayfa Aralığı Belirt</label>
                </div>
            </div>
            <div class="form-group" id="tc-range-group" style="display:none;">
                <label class="form-label">Sayfa Aralığı</label>
                <input class="form-input" id="opt-tc-range" placeholder="ör: 1-5, 8, 10-15">
                <p class="form-hint">Virgülle ayırarak birden fazla aralık belirtebilirsiniz. (toplam ${state.pageCount} sayfa)</p>
            </div>`;
        initRadioGroups(body);

        // Show/hide range input based on scope selection
        body.querySelectorAll('input[name="tc-scope"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const rangeGroup = $('#tc-range-group');
                rangeGroup.style.display = radio.value === 'range' ? '' : 'none';
            });
        });

        // Update color label preview
        $('#opt-tc-color').addEventListener('input', (e) => {
            $('#opt-tc-color-label').textContent = e.target.value;
        });
    }

    function panelBgColor(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Seçili sayfaların arka plan rengini değiştirir. Mevcut içerik (metin, görsel) korunur.</div>
            <div class="form-group">
                <label class="form-label">Arka Plan Rengi</label>
                <input class="form-color" id="opt-bg-color" type="color" value="#FFFFFF" style="width:48px;height:40px;">
            </div>
            <div class="form-group">
                <label class="form-label">Opaklık (%)</label>
                <input class="form-input" id="opt-bg-opacity" type="number" value="100" min="1" max="100">
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="bg-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="bg-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelHeaderFooter(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Her sayfanın üstüne veya altına sabit metin ekler.</div>
            <div class="form-group">
                <label class="form-label">Metin</label>
                <input class="form-input" id="opt-hf-text" placeholder="ör: Gizli Belge" value="">
            </div>
            <div class="form-group">
                <label class="form-label">Konum</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="hf-pos" value="top" checked> Üst (Header)</label>
                    <label class="radio-option"><input type="radio" name="hf-pos" value="bottom"> Alt (Footer)</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Hizalama</label>
                <div class="radio-group">
                    <label class="radio-option"><input type="radio" name="hf-align" value="left"> Sola</label>
                    <label class="radio-option active"><input type="radio" name="hf-align" value="center" checked> Ortaya</label>
                    <label class="radio-option"><input type="radio" name="hf-align" value="right"> Sağa</label>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Yazı Boyutu</label>
                    <input class="form-input" id="opt-hf-size" type="number" value="10" min="6" max="36">
                </div>
                <div class="form-group">
                    <label class="form-label">Renk</label>
                    <input class="form-color" id="opt-hf-color" type="color" value="#333333">
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelStamp(body) {
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label">Damga Metni</label>
                <select class="form-select" id="opt-stamp-preset">
                    <option value="ONAYLANDI">✅ ONAYLANDI</option>
                    <option value="KOPYA">📋 KOPYA</option>
                    <option value="GİZLİ">🔒 GİZLİ</option>
                    <option value="TASLAK">📝 TASLAK</option>
                    <option value="İPTAL">❌ İPTAL</option>
                    <option value="ACİL">🚨 ACİL</option>
                    <option value="custom">✏️ Özel Metin...</option>
                </select>
            </div>
            <div class="form-group" id="stamp-custom-group" style="display:none;">
                <label class="form-label">Özel Metin</label>
                <input class="form-input" id="opt-stamp-custom" placeholder="Damga metni girin">
            </div>
            <div class="form-group">
                <label class="form-label">Konum</label>
                <select class="form-select" id="opt-stamp-pos">
                    <option value="center">Ortada</option>
                    <option value="top-right">Sağ Üst</option>
                    <option value="top-left">Sol Üst</option>
                    <option value="bottom-right">Sağ Alt</option>
                    <option value="bottom-left">Sol Alt</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Boyut</label>
                    <input class="form-input" id="opt-stamp-size" type="number" value="36" min="12" max="120">
                </div>
                <div class="form-group">
                    <label class="form-label">Opaklık (%)</label>
                    <input class="form-input" id="opt-stamp-opacity" type="number" value="60" min="5" max="100">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Renk</label>
                <input class="form-color" id="opt-stamp-color" type="color" value="#CC0000">
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="stamp-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="stamp-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
        $('#opt-stamp-preset').addEventListener('change', e => {
            $('#stamp-custom-group').style.display = e.target.value === 'custom' ? '' : 'none';
        });
    }

    function panelAddImage(body) {
        state._addImageData = null;
        body.innerHTML = `
            <div class="info-box info-primary">Sayfalara görsel (logo, imza vb.) yerleştirir.</div>
            <div class="form-group">
                <button class="btn btn-ghost btn-block" id="btn-pick-image">🖼️ Görsel Seç</button>
                <p class="form-hint" id="add-image-name" style="margin-top:6px;">Henüz görsel seçilmedi</p>
            </div>
            <div class="form-group">
                <label class="form-label">Konum</label>
                <select class="form-select" id="opt-img-pos">
                    <option value="center">Ortada</option>
                    <option value="top-left">Sol Üst</option>
                    <option value="top-right">Sağ Üst</option>
                    <option value="bottom-left">Sol Alt</option>
                    <option value="bottom-right">Sağ Alt</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Ölçek (%)</label>
                <input class="form-input" id="opt-img-scale" type="number" value="50" min="5" max="200">
            </div>
            <div class="form-group">
                <label class="form-label">Opaklık (%)</label>
                <input class="form-input" id="opt-img-opacity" type="number" value="100" min="5" max="100">
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="img-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="img-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
        $('#btn-pick-image').addEventListener('click', () => {
            const inp = $('#file-input-image');
            inp.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                state._addImageData = new Uint8Array(await file.arrayBuffer());
                state._addImageType = file.type;
                $('#add-image-name').textContent = '✅ ' + file.name;
                inp.value = '';
            };
            inp.click();
        });
    }

    function panelCrop(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Sayfa kenarlarından belirtilen miktarda kırpar.</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Üst (mm)</label>
                    <input class="form-input" id="opt-crop-top" type="number" value="0" min="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Alt (mm)</label>
                    <input class="form-input" id="opt-crop-bottom" type="number" value="0" min="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Sol (mm)</label>
                    <input class="form-input" id="opt-crop-left" type="number" value="0" min="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Sağ (mm)</label>
                    <input class="form-input" id="opt-crop-right" type="number" value="0" min="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Uygulama</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="crop-scope" value="all" checked> Tüm Sayfalara</label>
                    <label class="radio-option"><input type="radio" name="crop-scope" value="selected"> Seçili Sayfalara</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelAddBlank(body) {
        body.innerHTML = `
            <div class="info-box info-primary">PDF'e boş sayfa ekler. Sayfa boyutu mevcut sayfalarla aynı olur.</div>
            <div class="form-group">
                <label class="form-label">Ekleme Konumu</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="blank-pos" value="end" checked> Sona Ekle</label>
                    <label class="radio-option"><input type="radio" name="blank-pos" value="after-selected"> Seçili Sayfadan Sonra</label>
                    <label class="radio-option"><input type="radio" name="blank-pos" value="before-selected"> Seçili Sayfadan Önce</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Eklenecek Sayfa Sayısı</label>
                <input class="form-input" id="opt-blank-count" type="number" value="1" min="1" max="50">
            </div>`;
        initRadioGroups(body);
    }

    function panelDuplicate(body) {
        body.innerHTML = `
            <div class="info-box">Önce thumbnail'lardan çoğaltmak istediğiniz sayfaları seçin.</div>
            <div class="form-group">
                <label class="form-label">Kopya Sayısı</label>
                <input class="form-input" id="opt-dup-count" type="number" value="1" min="1" max="20">
                <p class="form-hint">Her seçili sayfa bu kadar kez kopyalanır.</p>
            </div>
            <p class="form-hint" style="margin-top:8px;">Seçili sayfa: <strong id="dup-count">${state.selectedPages.size}</strong></p>`;
    }

    function panelExportImages(body) {
        body.innerHTML = `
            <div class="info-box info-primary">Sayfaları resim olarak dışa aktarır ve indirir.</div>
            <div class="form-group">
                <label class="form-label">Format</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="exp-format" value="png" checked> PNG (kayıpsız)</label>
                    <label class="radio-option"><input type="radio" name="exp-format" value="jpeg"> JPEG (küçük boyut)</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Çözünürlük</label>
                <select class="form-select" id="opt-exp-scale">
                    <option value="1">Normal (1x)</option>
                    <option value="2" selected>Yüksek (2x)</option>
                    <option value="3">Çok Yüksek (3x)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Sayfalar</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="exp-scope" value="all" checked> Tüm Sayfalar</label>
                    <label class="radio-option"><input type="radio" name="exp-scope" value="selected"> Seçili Sayfalar</label>
                </div>
            </div>
            <button class="btn btn-primary btn-block" id="btn-export-go" style="margin-top:12px;">📸 Dışa Aktar ve İndir</button>`;
        initRadioGroups(body);
        $('#btn-export-go').addEventListener('click', execExportImages);
    }

    function panelImagesToPdf(body) {
        state._imagesToPdfFiles = [];
        body.innerHTML = `
            <div class="info-box info-primary">Birden fazla görseli sırayla bir PDF dosyasına dönüştürür.</div>
            <div class="form-group">
                <button class="btn btn-ghost btn-block" id="btn-pick-images">🖼️ Görselleri Seç</button>
            </div>
            <div class="merge-file-list" id="img2pdf-list"></div>
            <div class="form-group">
                <label class="form-label">Sayfa Boyutu</label>
                <select class="form-select" id="opt-i2p-size">
                    <option value="fit">Görsele Göre Ayarla</option>
                    <option value="A4">A4 Sayfaya Sığdır</option>
                </select>
            </div>`;
        $('#btn-pick-images').addEventListener('click', () => {
            const inp = $('#file-input-images');
            inp.onchange = async (e) => {
                for (const file of e.target.files) {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    state._imagesToPdfFiles.push({ name: file.name, bytes, type: file.type });
                    const list = $('#img2pdf-list');
                    const item = el('div', { className: 'merge-file-item' }, [
                        el('span', { className: 'file-order', textContent: list.children.length + 1 }),
                        el('span', { className: 'file-label', textContent: file.name }),
                    ]);
                    list.appendChild(item);
                }
                inp.value = '';
            };
            inp.click();
        });
    }

    function panelCompress(body) {
        const sizeStr = formatSize(state.pdfBytes.length);
        body.innerHTML = `
            <div class="info-box info-primary">PDF dosyasını optimize ederek boyutunu küçültür.</div>
            <div class="form-group">
                <label class="form-label">Mevcut Boyut</label>
                <p style="font-size:1.2rem;font-weight:700;color:var(--primary-light);">${sizeStr}</p>
            </div>
            <div class="form-group">
                <label class="form-label">Sıkıştırma Yöntemi</label>
                <div class="radio-group">
                    <label class="radio-option active"><input type="radio" name="comp-mode" value="basic" checked> Temel Optimizasyon</label>
                    <label class="radio-option"><input type="radio" name="comp-mode" value="aggressive"> Agresif (metadata temizle)</label>
                </div>
            </div>`;
        initRadioGroups(body);
    }

    function panelMetadata(body) {
        const loadMeta = async () => {
            const doc = await PDFDocument.load(state.pdfBytes);
            const title = doc.getTitle() || '';
            const author = doc.getAuthor() || '';
            const subject = doc.getSubject() || '';
            const keywords = (doc.getKeywords() || '');
            const creator = doc.getCreator() || '';
            const producer = doc.getProducer() || '';
            const created = doc.getCreationDate();
            const modified = doc.getModificationDate();
            body.innerHTML = `
                <div class="form-group">
                    <label class="form-label">Başlık</label>
                    <input class="form-input" id="opt-meta-title" value="${title.replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Yazar</label>
                    <input class="form-input" id="opt-meta-author" value="${author.replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Konu</label>
                    <input class="form-input" id="opt-meta-subject" value="${subject.replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Anahtar Kelimeler</label>
                    <input class="form-input" id="opt-meta-keywords" value="${keywords.replace(/"/g, '&quot;')}">
                </div>
                <div class="divider"></div>
                <div class="form-group">
                    <label class="form-label">Oluşturan</label>
                    <p class="form-hint" style="font-size:0.85rem;">${creator || '-'}</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Üretici</label>
                    <p class="form-hint" style="font-size:0.85rem;">${producer || '-'}</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Oluşturma Tarihi</label>
                    <p class="form-hint" style="font-size:0.85rem;">${created ? created.toLocaleString('tr-TR') : '-'}</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Değiştirilme Tarihi</label>
                    <p class="form-hint" style="font-size:0.85rem;">${modified ? modified.toLocaleString('tr-TR') : '-'}</p>
                </div>
                <div class="divider"></div>
                <button class="btn btn-primary btn-block" id="btn-save-meta">💾 Metadata Kaydet</button>`;
            $('#btn-save-meta').addEventListener('click', async () => {
                showLoading('Metadata kaydediliyor...');
                try {
                    const d = await PDFDocument.load(state.pdfBytes);
                    d.setTitle($('#opt-meta-title').value);
                    d.setAuthor($('#opt-meta-author').value);
                    d.setSubject($('#opt-meta-subject').value);
                    d.setKeywords([$('#opt-meta-keywords').value]);
                    const bytes = await d.save();
                    await reloadAfterEdit(new Uint8Array(bytes));
                    toast('Metadata güncellendi!', 'success');
                } catch (err) { toast('Hata: ' + err.message, 'error'); }
                hideLoading();
            });
        };
        body.innerHTML = '<p style="color:var(--text-muted)">Yükleniyor...</p>';
        loadMeta();
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
    function getToolHandler(toolId) {
        const handlers = {
            'merge-pages': execMergePages,
            'merge-pdfs': execMergePDFs,
            'split': execSplit,
            'rotate': execRotate,
            'delete': execDelete,
            'watermark': execWatermark,
            'page-numbers': execPageNumbers,
            'resize': execResize,
            'text-color': execTextColor,
            'bg-color': execBgColor,
            'header-footer': execHeaderFooter,
            'stamp': execStamp,
            'add-image': execAddImage,
            'crop': execCrop,
            'add-blank': execAddBlank,
            'duplicate': execDuplicate,
            'images-to-pdf': execImagesToPdf,
            'compress': execCompress,
            'metadata': execMetadata,
        };
        return handlers[toolId] || null;
    }

    /* ---- Live Preview System ---- */
    function attachPreviewListeners() {
        const body = $('#tool-panel-body');
        if (!body) return;
        body.querySelectorAll('input, select').forEach(inp => {
            const evt = (inp.type === 'range' || inp.type === 'number' || inp.type === 'color') ? 'input' : 'change';
            inp.addEventListener(evt, () => triggerPreview());
            if (evt === 'input') inp.addEventListener('change', () => triggerPreview());
        });
    }

    function triggerPreview() {
        clearTimeout(state._previewTimer);
        state._previewTimer = setTimeout(runPreview, 500);
    }

    async function runPreview() {
        if (!state.currentTool || !state._previewBase) return;
        const handler = getToolHandler(state.currentTool);
        if (!handler) return;

        // Use base bytes as source for preview
        const savedBytes = state.pdfBytes;
        state.pdfBytes = state._previewBase;

        try {
            const result = await handler();
            if (result) {
                state._previewResult = new Uint8Array(result);
                state._previewActive = true;
                // Render thumbnails from preview result
                const doc = await pdfjsLib.getDocument({ data: state._previewResult.slice(0) }).promise;
                state.pdfJsDoc = doc;
                state.pageCount = doc.numPages;
                // Keep base bytes unchanged
                state.pdfBytes = state._previewBase;
                await renderThumbnails();
            } else {
                state.pdfBytes = state._previewBase;
            }
        } catch (e) {
            console.warn('Preview hatası:', e);
            state.pdfBytes = state._previewBase;
        }
    }

    async function applyTool() {
        if (!state.currentTool || !state.pdfBytes) return;

        // Commit any pending reorder first
        if (state.pendingReorder) {
            try { await commitPageOrder(); } catch(e) { toast('Sıralama hatası: ' + e.message, 'error'); }
        }

        // If preview was computed, commit it (content-modifying tools)
        if (state._previewResult && state._previewActive) {
            state.pdfBytes = state._previewBase;
            await reloadAfterEdit(state._previewResult);
            state._previewResult = null;
            state._previewBase = state.pdfBytes;
            state._previewActive = false;
            toast('İşlem başarıyla tamamlandı!', 'success');
            return;
        }

        const handler = getToolHandler(state.currentTool);
        if (!handler) return;

        // Structural tools: DOM-first instant update, background PDF build
        if (state.currentTool === 'delete') {
            const mode = document.querySelector('input[name="delete-mode"]:checked')?.value || 'delete';
            if (mode === 'extract') {
                // Extract just downloads, no DOM change
                showLoading('PDF çıkarılıyor...');
                try { await handler(); } catch(e) { toast('Hata: ' + e.message, 'error'); }
                hideLoading();
                return;
            }
            const toDelete = new Set(state.selectedPages);
            if (toDelete.size === 0) { toast('Lütfen silinecek sayfaları seçin.', 'error'); return; }
            if (toDelete.size >= state.pageCount) { toast('Tüm sayfalar silinemez!', 'error'); return; }
            toDelete.forEach(idx => { const c = $(`.thumb-card[data-index="${idx}"]`); if (c) c.remove(); });
            state.selectedPages.clear();
            renumberThumbnails();
            toast('İşlem başarıyla tamamlandı!', 'success');
            try {
                const result = await handler();
                if (result) await commitPdfBytes(result);
            } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            return;
        }

        if (state.currentTool === 'rotate') {
            const mode = document.querySelector('input[name="rotate-mode"]:checked')?.value || 'rotate';
            const scope = document.querySelector('input[name="rotate-scope"]:checked')?.value || 'selected';
            const indices = scope === 'all' ? Array.from({ length: state.pageCount }, (_, i) => i) : [...state.selectedPages];
            if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return; }
            if (mode === 'rotate') {
                const angle = parseInt(document.querySelector('input[name="rotate"]:checked')?.value || '90');
                indices.forEach(idx => {
                    const card = $(`.thumb-card[data-index="${idx}"]`);
                    if (!card) return;
                    const canvas = card.querySelector('canvas');
                    const rotated = rotateCanvasBy(canvas, angle);
                    canvas.width = rotated.width; canvas.height = rotated.height;
                    canvas.getContext('2d').drawImage(rotated, 0, 0);
                });
            } else {
                // Orientation: swap width/height visually
                indices.forEach(idx => {
                    const card = $(`.thumb-card[data-index="${idx}"]`);
                    if (!card) return;
                    const canvas = card.querySelector('canvas');
                    const rotated = rotateCanvasBy(canvas, 90);
                    canvas.width = rotated.width; canvas.height = rotated.height;
                    canvas.getContext('2d').drawImage(rotated, 0, 0);
                });
            }
            toast('İşlem başarıyla tamamlandı!', 'success');
            try {
                const result = await handler();
                if (result) await commitPdfBytes(result);
            } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            return;
        }

        if (state.currentTool === 'duplicate') {
            const toDup = [...state.selectedPages].sort((a, b) => a - b);
            if (toDup.length === 0) { toast('Lütfen çoğaltılacak sayfaları seçin.', 'error'); return; }
            toDup.forEach(idx => {
                const card = $(`.thumb-card[data-index="${idx}"]`);
                if (!card) return;
                const clone = card.cloneNode(true);
                clone.classList.remove('selected');
                // Canvas piksel verisini kopyala
                const srcCanvas = card.querySelector('canvas');
                const dstCanvas = clone.querySelector('canvas');
                if (srcCanvas && dstCanvas) {
                    dstCanvas.width = srcCanvas.width;
                    dstCanvas.height = srcCanvas.height;
                    dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
                }
                attachThumbEvents(clone);
                card.after(clone);
            });
            state.selectedPages.clear();
            renumberThumbnails();
            toast('İşlem başarıyla tamamlandı!', 'success');
            try {
                const result = await handler();
                if (result) await commitPdfBytes(result);
            } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            return;
        }

        if (state.currentTool === 'add-blank') {
            const grid = $('#thumbnail-grid');
            const refCanvas = grid.querySelector('.thumb-card canvas');
            const w = refCanvas ? refCanvas.width : 180;
            const h = refCanvas ? Math.round(refCanvas.height) : 255;
            const newIdx = state.pageCount;
            const blankCard = el('div', { className: 'thumb-card', 'data-index': newIdx, draggable: 'true' }, [
                el('span', { className: 'thumb-drag-handle', textContent: '⠿' }),
                createBlankCanvas(w, h),
                el('span', { className: 'thumb-check', textContent: '✓' }),
                el('span', { className: 'thumb-label', textContent: `${newIdx + 1}` }),
            ]);
            attachThumbEvents(blankCard);
            grid.appendChild(blankCard);
            state.pageCount++;
            state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
            updateSelectionCount();
            $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(state.pdfBytes.length)}`;
            toast('İşlem başarıyla tamamlandı!', 'success');
            try {
                const result = await handler();
                if (result) await commitPdfBytes(result);
            } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            return;
        }

        // Content-modifying tools: full rebuild with thumbnail re-render
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

    /* ---- 4. Rotate & Orientation ---- */
    async function execRotate() {
        const mode = document.querySelector('input[name="rotate-mode"]:checked')?.value || 'rotate';
        const scope = document.querySelector('input[name="rotate-scope"]:checked').value;

        if (mode === 'orientation') {
            // Yön değiştirme (dikey ↔ yatay)
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
                    newPage.drawPage(embeddedPages[i], { x: 0, y: width, width, height, rotate: degrees(-90) });
                } else {
                    const [copied] = await newDoc.copyPages(srcDoc, [i]);
                    newDoc.addPage(copied);
                }
            }
            return await newDoc.save();
        }

        // Normal döndürme
        const angle = parseInt(document.querySelector('input[name="rotate"]:checked').value);
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

    /* ---- 5. Delete / Extract ---- */
    async function execDelete() {
        const mode = document.querySelector('input[name="delete-mode"]:checked')?.value || 'delete';

        if (mode === 'extract') {
            // Sayfa çıkarma
            const rangeStr = $('#opt-delete-range')?.value?.trim();
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
            // Extract = download only, doesn't modify original
            const bytes = await newDoc.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = el('a', { href: url, download: state.fileName.replace('.pdf', '_çıkarılan.pdf') });
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            toast(`${indices.length} sayfa ayrı PDF olarak indirildi!`, 'success');
            return null; // don't modify original
        }

        // Normal silme
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

    /* ---- 12. Text Color ---- */
    async function execTextColor() {
        const colorHex = $('#opt-tc-color').value;
        const scope = document.querySelector('input[name="tc-scope"]:checked').value;

        const tR = parseInt(colorHex.slice(1, 3), 16) / 255;
        const tG = parseInt(colorHex.slice(3, 5), 16) / 255;
        const tB = parseInt(colorHex.slice(5, 7), 16) / 255;

        let indices;
        if (scope === 'all') {
            indices = Array.from({ length: state.pageCount }, (_, i) => i);
        } else if (scope === 'selected') {
            indices = [...state.selectedPages].sort((a, b) => a - b);
        } else {
            const rangeStr = $('#opt-tc-range')?.value?.trim();
            if (!rangeStr) { toast('Lütfen sayfa aralığı girin.', 'error'); return null; }
            indices = parseRanges(rangeStr, state.pageCount);
        }

        if (indices.length === 0) {
            toast('Lütfen en az bir sayfa seçin.', 'error');
            return null;
        }

        const doc = await PDFDocument.load(state.pdfBytes);
        const pages = doc.getPages();
        const PDFName_ = PDFLib.PDFName;

        let pagesModified = 0;

        for (const idx of indices) {
            const page = pages[idx];
            const contentsEntry = page.node.get(PDFName_.of('Contents'));
            if (!contentsEntry) continue;

            const contentsObj = doc.context.lookup(contentsEntry);
            const streamEntries = [];

            // Contents can be a single stream ref or an array of stream refs
            if (contentsObj instanceof PDFLib.PDFArray) {
                for (let i = 0; i < contentsObj.size(); i++) {
                    const sRef = contentsObj.get(i);
                    streamEntries.push({ ref: sRef, stream: doc.context.lookup(sRef) });
                }
            } else {
                streamEntries.push({ ref: contentsEntry, stream: contentsObj });
            }

            for (const { ref, stream } of streamEntries) {
                if (!stream) continue;

                // Get raw stream bytes
                let rawBytes;
                try {
                    rawBytes = stream.getContents();
                } catch (e) {
                    console.warn('Sayfa ' + (idx + 1) + ' getContents hatası:', e);
                    continue;
                }
                if (!rawBytes || rawBytes.length === 0) continue;

                // Check if stream is FlateDecode compressed
                const filterEntry = stream.dict.get(PDFName_.of('Filter'));
                const isFlate = filterEntry && filterEntry.toString().includes('FlateDecode');

                // Decompress if needed
                let contentBytes;
                try {
                    if (isFlate) {
                        contentBytes = pako.inflate(rawBytes);
                    } else {
                        contentBytes = rawBytes;
                    }
                } catch (e) {
                    console.warn('Sayfa ' + (idx + 1) + ' inflate hatası:', e);
                    continue;
                }

                // Bytes → Latin-1 string
                let text = '';
                for (let ci = 0; ci < contentBytes.length; ci++) {
                    text += String.fromCharCode(contentBytes[ci]);
                }

                const modified = replaceTextColors(text, tR, tG, tB);
                if (modified === text) continue;

                // String → bytes
                let newContentBytes = new Uint8Array(modified.length);
                for (let ci = 0; ci < modified.length; ci++) {
                    newContentBytes[ci] = modified.charCodeAt(ci) & 0xFF;
                }

                // Re-compress with FlateDecode
                const compressedBytes = pako.deflate(newContentBytes);

                // Create new FlateDecode stream
                const newDict = PDFLib.PDFDict.withContext(doc.context);
                newDict.set(PDFName_.of('Filter'), PDFName_.of('FlateDecode'));
                newDict.set(PDFName_.of('Length'), PDFLib.PDFNumber.of(compressedBytes.length));
                const newStream = PDFLib.PDFRawStream.of(newDict, compressedBytes);
                doc.context.assign(ref, newStream);
                pagesModified++;
            }
        }

        if (pagesModified === 0) {
            toast('Seçili sayfalarda değiştirilecek metin bulunamadı.', 'info');
            return null;
        }

        return await doc.save();
    }

    /**
     * Replaces all text (non-stroking) color operators inside BT...ET blocks
     * with the given RGB color. Protects string literals from modification.
     */
    function replaceTextColors(content, r, g, b) {
        const colorCmd = r.toFixed(6) + ' ' + g.toFixed(6) + ' ' + b.toFixed(6) + ' rg';

        // Step 1: Protect parenthesized string literals from regex replacement
        const strings = [];
        let safe = '';
        let i = 0;
        while (i < content.length) {
            if (content[i] === '(') {
                let depth = 1;
                let str = '(';
                i++;
                while (i < content.length && depth > 0) {
                    if (content[i] === '\\') {
                        str += content[i];
                        i++;
                        if (i < content.length) { str += content[i]; i++; }
                        continue;
                    }
                    if (content[i] === '(') depth++;
                    if (content[i] === ')') depth--;
                    str += content[i];
                    i++;
                }
                strings.push(str);
                safe += '\x01#' + (strings.length - 1) + '#\x01';
            } else {
                safe += content[i];
                i++;
            }
        }

        // Step 2: Find BT...ET text blocks and replace non-stroking color operators
        safe = safe.replace(/\bBT\b([\s\S]*?)\bET\b/g, function (match, inner) {
            let mod = inner;
            // RGB non-stroking color: r g b rg
            mod = mod.replace(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b/g, colorCmd);
            // Grayscale non-stroking color: gray g
            mod = mod.replace(/(^|[\s\n\r])([\d.]+)\s+g(?=[\s\n\r]|$)/gm, '$1' + colorCmd);
            // CMYK non-stroking color: c m y k k
            mod = mod.replace(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k\b/g, colorCmd);
            // sc / scn with 3 args (RGB color space)
            mod = mod.replace(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+scn?\b/g, colorCmd);
            // sc / scn with 1 arg (grayscale color space)
            mod = mod.replace(/(^|[\s\n\r])([\d.]+)\s+scn?(?=[\s\n\r]|$)/gm, '$1' + colorCmd);
            // Inject target color right after BT to override any inherited color
            return 'BT\n' + colorCmd + '\n' + mod + 'ET';
        });

        // Step 3: Restore protected string literals
        safe = safe.replace(/\x01#(\d+)#\x01/g, function (_, idx) {
            return strings[parseInt(idx)];
        });

        return safe;
    }

    /* ---- 13. Background Color ---- */
    async function execBgColor() {
        const colorHex = $('#opt-bg-color').value;
        const opacity = (parseInt($('#opt-bg-opacity').value) || 100) / 100;
        const scope = document.querySelector('input[name="bg-scope"]:checked').value;
        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        const doc = await PDFDocument.load(state.pdfBytes);
        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        for (const idx of indices) {
            const page = pages[idx];
            const { width, height } = page.getSize();
            page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(r, g, b), opacity, borderWidth: 0 });
        }
        return await doc.save();
    }

    /* ---- 14. Header/Footer ---- */
    async function execHeaderFooter() {
        const text = $('#opt-hf-text').value;
        if (!text) { toast('Lütfen metin girin.', 'error'); return null; }
        const pos = document.querySelector('input[name="hf-pos"]:checked').value;
        const align = document.querySelector('input[name="hf-align"]:checked').value;
        const fontSize = parseInt($('#opt-hf-size').value) || 10;
        const colorHex = $('#opt-hf-color').value;
        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        const doc = await PDFDocument.load(state.pdfBytes);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const margin = 30;

        for (const page of pages) {
            const { width, height } = page.getSize();
            const tw = font.widthOfTextAtSize(text, fontSize);
            let x;
            if (align === 'left') x = margin;
            else if (align === 'right') x = width - margin - tw;
            else x = width / 2 - tw / 2;
            const y = pos === 'top' ? height - margin : margin;
            page.drawText(text, { x, y, size: fontSize, font, color: rgb(r, g, b) });
        }
        return await doc.save();
    }

    /* ---- 15. Stamp ---- */
    async function execStamp() {
        const preset = $('#opt-stamp-preset').value;
        const text = preset === 'custom' ? ($('#opt-stamp-custom').value || 'DAMGA') : preset;
        const position = $('#opt-stamp-pos').value;
        const fontSize = parseInt($('#opt-stamp-size').value) || 36;
        const opacity = (parseInt($('#opt-stamp-opacity').value) || 60) / 100;
        const colorHex = $('#opt-stamp-color').value;
        const scope = document.querySelector('input[name="stamp-scope"]:checked').value;
        const r = parseInt(colorHex.slice(1, 3), 16) / 255;
        const g = parseInt(colorHex.slice(3, 5), 16) / 255;
        const b = parseInt(colorHex.slice(5, 7), 16) / 255;

        const doc = await PDFDocument.load(state.pdfBytes);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        for (const idx of indices) {
            const page = pages[idx];
            const { width, height } = page.getSize();
            const tw = font.widthOfTextAtSize(text, fontSize);
            const th = fontSize;
            const pad = 8;
            let x, y;
            if (position === 'center') { x = width / 2 - tw / 2; y = height / 2 - th / 2; }
            else if (position === 'top-right') { x = width - tw - 40; y = height - th - 40; }
            else if (position === 'top-left') { x = 40; y = height - th - 40; }
            else if (position === 'bottom-right') { x = width - tw - 40; y = 40; }
            else { x = 40; y = 40; }

            page.drawRectangle({
                x: x - pad, y: y - pad, width: tw + pad * 2, height: th + pad * 2,
                borderColor: rgb(r, g, b), borderWidth: 2, opacity: 0, borderOpacity: opacity,
            });
            page.drawText(text, { x, y, size: fontSize, font, color: rgb(r, g, b), opacity });
        }
        return await doc.save();
    }

    /* ---- 16. Add Image ---- */
    async function execAddImage() {
        if (!state._addImageData) { toast('Lütfen bir görsel seçin.', 'error'); return null; }
        const position = $('#opt-img-pos').value;
        const scale = (parseInt($('#opt-img-scale').value) || 50) / 100;
        const opacity = (parseInt($('#opt-img-opacity').value) || 100) / 100;
        const scope = document.querySelector('input[name="img-scope"]:checked').value;

        const doc = await PDFDocument.load(state.pdfBytes);
        let img;
        try {
            if (state._addImageType && state._addImageType.includes('png')) {
                img = await doc.embedPng(state._addImageData);
            } else {
                img = await doc.embedJpg(state._addImageData);
            }
        } catch (e) {
            toast('Görsel yüklenemedi. PNG veya JPEG kullanın.', 'error'); return null;
        }

        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        const imgW = img.width * scale;
        const imgH = img.height * scale;
        const margin = 20;

        for (const idx of indices) {
            const page = pages[idx];
            const { width, height } = page.getSize();
            let x, y;
            if (position === 'center') { x = width / 2 - imgW / 2; y = height / 2 - imgH / 2; }
            else if (position === 'top-left') { x = margin; y = height - imgH - margin; }
            else if (position === 'top-right') { x = width - imgW - margin; y = height - imgH - margin; }
            else if (position === 'bottom-left') { x = margin; y = margin; }
            else { x = width - imgW - margin; y = margin; }
            page.drawImage(img, { x, y, width: imgW, height: imgH, opacity });
        }
        state._addImageData = null;
        return await doc.save();
    }

    /* ---- 17. Crop ---- */
    async function execCrop() {
        const mm2pt = v => parseFloat(v) / 25.4 * 72;
        const top = mm2pt($('#opt-crop-top').value);
        const bottom = mm2pt($('#opt-crop-bottom').value);
        const left = mm2pt($('#opt-crop-left').value);
        const right = mm2pt($('#opt-crop-right').value);
        if (top === 0 && bottom === 0 && left === 0 && right === 0) {
            toast('Lütfen en az bir kenar için kırpma değeri girin.', 'error'); return null;
        }
        const scope = document.querySelector('input[name="crop-scope"]:checked').value;
        const doc = await PDFDocument.load(state.pdfBytes);
        const pages = doc.getPages();
        const indices = scope === 'all' ? pages.map((_, i) => i) : [...state.selectedPages];
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return null; }

        for (const idx of indices) {
            const page = pages[idx];
            const { width, height } = page.getSize();
            page.setCropBox(left, bottom, width - left - right, height - top - bottom);
        }
        return await doc.save();
    }

    /* ---- 18. Add Blank Page ---- */
    async function execAddBlank() {
        const pos = document.querySelector('input[name="blank-pos"]:checked').value;
        const count = parseInt($('#opt-blank-count').value) || 1;

        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const totalPages = srcDoc.getPageCount();
        const allPages = await newDoc.copyPages(srcDoc, Array.from({ length: totalPages }, (_, i) => i));

        let insertIdx = totalPages;
        if ((pos === 'after-selected' || pos === 'before-selected') && state.selectedPages.size > 0) {
            const sorted = [...state.selectedPages].sort((a, b) => a - b);
            insertIdx = pos === 'after-selected' ? sorted[sorted.length - 1] + 1 : sorted[0];
        }

        const refPage = srcDoc.getPages()[Math.min(insertIdx, totalPages) - 1] || srcDoc.getPages()[0];
        const { width, height } = refPage.getSize();

        for (let i = 0; i < totalPages; i++) {
            if (i === insertIdx) {
                for (let j = 0; j < count; j++) newDoc.addPage([width, height]);
            }
            newDoc.addPage(allPages[i]);
        }
        if (insertIdx >= totalPages) {
            for (let j = 0; j < count; j++) newDoc.addPage([width, height]);
        }
        return await newDoc.save();
    }

    /* ---- 19. Duplicate Pages ---- */
    async function execDuplicate() {
        if (state.selectedPages.size === 0) { toast('Lütfen çoğaltılacak sayfaları seçin.', 'error'); return null; }
        const copies = parseInt($('#opt-dup-count').value) || 1;
        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();
        const totalPages = srcDoc.getPageCount();

        for (let i = 0; i < totalPages; i++) {
            const [page] = await newDoc.copyPages(srcDoc, [i]);
            newDoc.addPage(page);
            if (state.selectedPages.has(i)) {
                for (let c = 0; c < copies; c++) {
                    const [dup] = await newDoc.copyPages(srcDoc, [i]);
                    newDoc.addPage(dup);
                }
            }
        }
        return await newDoc.save();
    }

    /* ---- 20. Export Images ---- */
    async function execExportImages() {
        const format = document.querySelector('input[name="exp-format"]:checked').value;
        const scale = parseFloat($('#opt-exp-scale').value) || 2;
        const scope = document.querySelector('input[name="exp-scope"]:checked').value;
        const indices = scope === 'all'
            ? Array.from({ length: state.pageCount }, (_, i) => i)
            : [...state.selectedPages].sort((a, b) => a - b);
        if (indices.length === 0) { toast('Lütfen sayfaları seçin.', 'error'); return; }

        showLoading('Sayfalar dışa aktarılıyor...');
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const ext = format === 'jpeg' ? 'jpg' : 'png';

        try {
            for (const idx of indices) {
                const page = await state.pdfJsDoc.getPage(idx + 1);
                const vp = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = vp.width;
                canvas.height = vp.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: vp }).promise;

                const blob = await new Promise(res => canvas.toBlob(res, mime, 0.92));
                const url = URL.createObjectURL(blob);
                const a = el('a', { href: url, download: `${state.fileName.replace('.pdf', '')}_sayfa${idx + 1}.${ext}` });
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                await new Promise(r => setTimeout(r, 300));
            }
            toast(`${indices.length} sayfa dışa aktarıldı!`, 'success');
        } catch (err) { toast('Hata: ' + err.message, 'error'); }
        hideLoading();
    }

    /* ---- 21. Images to PDF (mevcut PDF'e görsel sayfa ekle) ---- */
    async function execImagesToPdf() {
        if (!state._imagesToPdfFiles || state._imagesToPdfFiles.length === 0) {
            toast('Lütfen en az bir görsel seçin.', 'error'); return null;
        }
        const sizeMode = $('#opt-i2p-size').value;
        // Mevcut PDF'i yükle ve görsel sayfaları ekle
        const newDoc = await PDFDocument.load(state.pdfBytes);

        for (const file of state._imagesToPdfFiles) {
            let img;
            try {
                if (file.type.includes('png')) img = await newDoc.embedPng(file.bytes);
                else img = await newDoc.embedJpg(file.bytes);
            } catch (e) { console.warn('Görsel atlandı:', file.name, e); continue; }

            let pageW, pageH, drawW, drawH, drawX, drawY;
            if (sizeMode === 'A4') {
                pageW = 595.28; pageH = 841.89;
                const s = Math.min(pageW / img.width, pageH / img.height);
                drawW = img.width * s; drawH = img.height * s;
                drawX = (pageW - drawW) / 2; drawY = (pageH - drawH) / 2;
            } else {
                pageW = img.width; pageH = img.height;
                drawW = img.width; drawH = img.height;
                drawX = 0; drawY = 0;
            }
            const page = newDoc.addPage([pageW, pageH]);
            page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        }

        state._imagesToPdfFiles = [];
        return await newDoc.save();
    }

    /* ---- 22. Compress ---- */
    async function execCompress() {
        const mode = document.querySelector('input[name="comp-mode"]:checked').value;
        const originalSize = state.pdfBytes.length;
        const doc = await PDFDocument.load(state.pdfBytes);

        if (mode === 'aggressive') {
            doc.setTitle('');
            doc.setAuthor('');
            doc.setSubject('');
            doc.setKeywords([]);
            doc.setCreator('');
            doc.setProducer('');
        }

        const bytes = await doc.save({ useObjectStreams: true });
        const newSize = bytes.length;
        const saved = originalSize - newSize;
        const pct = ((saved / originalSize) * 100).toFixed(1);
        if (saved > 0) {
            toast(`${formatSize(saved)} küçültüldü (${pct}%) — ${formatSize(originalSize)} → ${formatSize(newSize)}`, 'success');
        } else {
            toast('Dosya zaten optimize durumda, daha fazla küçültülemedi.', 'info');
        }
        return bytes;
    }

    /* ---- 23. Metadata ---- */
    async function execMetadata() {
        // Handled directly in panelMetadata via button
        return null;
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
        if (state.history.length === 0) {
            // If there's a pending reorder, cancel it
            if (state.pendingReorder) {
                state.pendingReorder = false;
                state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
                await renderThumbnails();
                toast('Sıralama geri alındı.', 'success');
                return;
            }
            toast('Geri alınacak işlem yok.', 'info'); return;
        }
        showLoading('Geri alınıyor...');
        state.pendingReorder = false;
        const prev = state.history.pop();
        state.pdfBytes = prev;
        state.selectedPages.clear();
        const loadingTask = pdfjsLib.getDocument({ data: prev.slice(0) });
        state.pdfJsDoc = await loadingTask.promise;
        state.pageCount = state.pdfJsDoc.numPages;
        state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
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

        // Quick action toolbar buttons (instant DOM-first, background PDF build)
        const quickActions = {
            'btn-quick-delete': async () => {
                if (!state.pdfBytes || state.selectedPages.size === 0) { toast('Lütfen silinecek sayfaları seçin.', 'error'); return; }
                const toDelete = new Set(state.selectedPages);
                if (toDelete.size >= state.pageCount) { toast('Tüm sayfalar silinemez!', 'error'); return; }
                if (state.pendingReorder) await commitPageOrder();
                // ✅ Anında DOM güncellemesi
                toDelete.forEach(idx => { const c = $(`.thumb-card[data-index="${idx}"]`); if (c) c.remove(); });
                state.selectedPages.clear();
                renumberThumbnails();
                toast('Seçili sayfalar silindi!', 'success');
                // 🔄 Arka planda PDF güncelle
                try {
                    const srcDoc = await PDFDocument.load(state.pdfBytes);
                    const newDoc = await PDFDocument.create();
                    const keep = [];
                    for (let i = 0; i < srcDoc.getPageCount(); i++) if (!toDelete.has(i)) keep.push(i);
                    const pages = await newDoc.copyPages(srcDoc, keep);
                    pages.forEach(p => newDoc.addPage(p));
                    await commitPdfBytes(await newDoc.save());
                } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            },
            'btn-quick-rotate-cw': async () => {
                if (!state.pdfBytes || state.selectedPages.size === 0) { toast('Lütfen döndürülecek sayfaları seçin.', 'error'); return; }
                const toRotate = new Set(state.selectedPages);
                if (state.pendingReorder) await commitPageOrder();
                // ✅ Anında canvas döndürme
                toRotate.forEach(idx => {
                    const card = $(`.thumb-card[data-index="${idx}"]`);
                    if (!card) return;
                    const canvas = card.querySelector('canvas');
                    const rotated = rotateCanvasBy(canvas, 90);
                    canvas.width = rotated.width; canvas.height = rotated.height;
                    canvas.getContext('2d').drawImage(rotated, 0, 0);
                });
                toast('Sayfalar döndürüldü!', 'success');
                // 🔄 Arka planda PDF güncelle
                try {
                    const doc = await PDFDocument.load(state.pdfBytes);
                    const pages = doc.getPages();
                    toRotate.forEach(idx => { const p = pages[idx]; p.setRotation(degrees((p.getRotation().angle + 90) % 360)); });
                    await commitPdfBytes(await doc.save());
                } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            },
            'btn-quick-rotate-ccw': async () => {
                if (!state.pdfBytes || state.selectedPages.size === 0) { toast('Lütfen döndürülecek sayfaları seçin.', 'error'); return; }
                const toRotate = new Set(state.selectedPages);
                if (state.pendingReorder) await commitPageOrder();
                // ✅ Anında canvas döndürme
                toRotate.forEach(idx => {
                    const card = $(`.thumb-card[data-index="${idx}"]`);
                    if (!card) return;
                    const canvas = card.querySelector('canvas');
                    const rotated = rotateCanvasBy(canvas, 270);
                    canvas.width = rotated.width; canvas.height = rotated.height;
                    canvas.getContext('2d').drawImage(rotated, 0, 0);
                });
                toast('Sayfalar döndürüldü!', 'success');
                // 🔄 Arka planda PDF güncelle
                try {
                    const doc = await PDFDocument.load(state.pdfBytes);
                    const pages = doc.getPages();
                    toRotate.forEach(idx => { const p = pages[idx]; p.setRotation(degrees((p.getRotation().angle + 270) % 360)); });
                    await commitPdfBytes(await doc.save());
                } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            },
            'btn-quick-duplicate': async () => {
                if (!state.pdfBytes || state.selectedPages.size === 0) { toast('Lütfen çoğaltılacak sayfaları seçin.', 'error'); return; }
                const toDup = [...state.selectedPages].sort((a, b) => a - b);
                if (state.pendingReorder) await commitPageOrder();
                // ✅ Anında DOM - kartları klonla (canvas piksel verisini düşgün kopyala)
                toDup.forEach(idx => {
                    const card = $(`.thumb-card[data-index="${idx}"]`);
                    if (!card) return;
                    const clone = card.cloneNode(true);
                    clone.classList.remove('selected');
                    // Canvas piksel verisini kopyala
                    const srcCanvas = card.querySelector('canvas');
                    const dstCanvas = clone.querySelector('canvas');
                    if (srcCanvas && dstCanvas) {
                        dstCanvas.width = srcCanvas.width;
                        dstCanvas.height = srcCanvas.height;
                        dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
                    }
                    attachThumbEvents(clone);
                    card.after(clone);
                    if (state._thumbObserver && dstCanvas) state._thumbObserver.observe(dstCanvas);
                });
                state.selectedPages.clear();
                renumberThumbnails();
                toast('Sayfalar çoğaltıldı!', 'success');
                // 🔄 Arka planda PDF güncelle
                try {
                    const srcDoc = await PDFDocument.load(state.pdfBytes);
                    const newDoc = await PDFDocument.create();
                    for (let i = 0; i < srcDoc.getPageCount(); i++) {
                        const [p] = await newDoc.copyPages(srcDoc, [i]); newDoc.addPage(p);
                        if (toDup.includes(i)) { const [d] = await newDoc.copyPages(srcDoc, [i]); newDoc.addPage(d); }
                    }
                    await commitPdfBytes(await newDoc.save());
                } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            },
            'btn-quick-blank': async () => {
                if (!state.pdfBytes) return;
                if (state.pendingReorder) await commitPageOrder();
                // ✅ Anında DOM - beyaz canvas ekle
                const grid = $('#thumbnail-grid');
                const refCanvas = grid.querySelector('.thumb-card canvas');
                const w = refCanvas ? refCanvas.width : 180;
                const h = refCanvas ? Math.round(refCanvas.height) : 255;
                const blankCanvas = createBlankCanvas(w, h);
                blankCanvas.dataset.rendered = "true";
                const newIdx = state.pageCount;
                const card = el('div', { className: 'thumb-card', 'data-index': newIdx, draggable: 'true' }, [
                    el('span', { className: 'thumb-drag-handle', textContent: '⠿' }),
                    blankCanvas,
                    el('span', { className: 'thumb-check', textContent: '✓' }),
                    el('span', { className: 'thumb-label', textContent: `${newIdx + 1}` }),
                ]);
                attachThumbEvents(card);
                grid.appendChild(card);
                state.pageCount++;
                state.pageOrder = Array.from({ length: state.pageCount }, (_, i) => i);
                updateSelectionCount();
                $('#file-meta').textContent = `${state.pageCount} sayfa • ${formatSize(state.pdfBytes.length)}`;
                toast('Boş sayfa eklendi!', 'success');
                // 🔄 Arka planda PDF güncelle
                try {
                    const srcDoc = await PDFDocument.load(state.pdfBytes);
                    const newDoc = await PDFDocument.create();
                    const total = srcDoc.getPageCount();
                    const all = await newDoc.copyPages(srcDoc, Array.from({ length: total }, (_, i) => i));
                    all.forEach(p => newDoc.addPage(p));
                    const ref = srcDoc.getPages()[total - 1]; const { width, height } = ref.getSize();
                    newDoc.addPage([width, height]);
                    await commitPdfBytes(await newDoc.save());
                } catch(e) { toast('PDF güncellenemedi: ' + e.message, 'error'); }
            },
        };
        Object.entries(quickActions).forEach(([id, fn]) => {
            const btn = $(`#${id}`);
            if (btn) btn.addEventListener('click', fn);
        });
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
            const step = state.zoomLevel >= 2 ? 0.5 : 0.25;
            state.zoomLevel = Math.min(5, +(state.zoomLevel + step).toFixed(2));
            $('#zoom-level').textContent = Math.round(state.zoomLevel * 100) + '%';
            renderThumbnails();
        });
        $('#btn-zoom-out').addEventListener('click', () => {
            const step = state.zoomLevel > 2 ? 0.5 : 0.25;
            state.zoomLevel = Math.max(0.5, +(state.zoomLevel - step).toFixed(2));
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

    // Expose internals for page-editor.js
    window.__pdfApp = {
        state,
        toast,
        showLoading,
        hideLoading,
        commitPdfBytes,
        reloadAfterEdit,
        renderThumbnails,
        $,
        $$,
    };

    // Start!
    init();
})();
