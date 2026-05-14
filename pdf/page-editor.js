(function () {
    'use strict';

    // Global App Bridge
    const app = window.__pdfApp;
    if (!app) {
        console.error('PDF App bridge not found. page-editor.js requires window.__pdfApp');
        return;
    }

    const { state, toast, showLoading, hideLoading, commitPdfBytes, reloadAfterEdit, renderThumbnails, $, $$ } = app;
    const { PDFDocument } = PDFLib;

    /* ---- Page Editor State ---- */
    const peState = {
        pageIndex: -1,
        canvas: null,
        ctx: null,
        image: null,
        zoom: 1,
        baseScale: 1,

        cropActive: false,
        cropRect: null,
        cropAspect: null,
        cropDragging: false,
        cropHandle: null,
        cropStartX: 0,
        cropStartY: 0,

        rotation: 0,
        perspectiveActive: false,
        perspectivePoints: null,
        perspectiveDragIndex: -1,

        colorMode: 'color',
        brightness: 0,
        contrast: 0,

        _renderRAF: null,
    };

    const var_primary = '#3b82f6'; // Match app theme

    /* ============================================================
       INITIALIZATION & UI SETUP
       ============================================================ */
    function initPageEditor() {
        // Overlay close
        $('#pe-btn-close')?.addEventListener('click', closePageEditor);
        $('#pe-btn-cancel')?.addEventListener('click', closePageEditor);

        // Zoom Controls
        $('#pe-btn-zoom-in')?.addEventListener('click', () => { peState.zoom = Math.min(5, peState.zoom + 0.25); updateRender(); });
        $('#pe-btn-zoom-out')?.addEventListener('click', () => { peState.zoom = Math.max(0.25, peState.zoom - 0.25); updateRender(); });
        $('#pe-btn-zoom-fit')?.addEventListener('click', () => { peState.zoom = 1; fitCanvasToContainer(); updateRender(); });

        $('#pe-canvas-area')?.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            peState.zoom = Math.max(0.25, Math.min(5, peState.zoom + delta));
            updateRender();
        }, { passive: false });

        // Section Toggles
        $$('.pe-section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.pe-section').classList.toggle('collapsed');
            });
        });

        // Crop Controls
        $$('.pe-aspect-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.pe-aspect-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                startCrop(btn.dataset.aspect);
            });
        });
        $('#pe-btn-crop-apply')?.addEventListener('click', applyCrop);
        $('#pe-btn-crop-cancel')?.addEventListener('click', cancelCrop);

        // Rotation Controls
        $('#pe-btn-rotate-cw')?.addEventListener('click', () => setRotation(peState.rotation + 90));
        $('#pe-btn-rotate-ccw')?.addEventListener('click', () => setRotation(peState.rotation - 90));
        $('#pe-btn-rotate-180')?.addEventListener('click', () => setRotation(peState.rotation + 180));
        $('#pe-btn-rotate-reset')?.addEventListener('click', () => setRotation(0));
        $('#pe-rotation-input')?.addEventListener('change', e => setRotation(parseFloat(e.target.value) || 0));
        initDialInteraction();

        // Perspective Controls
        $('#pe-btn-perspective-toggle')?.addEventListener('click', togglePerspective);
        $('#pe-btn-perspective-apply')?.addEventListener('click', applyPerspective);
        $('#pe-btn-perspective-reset')?.addEventListener('click', resetPerspective);

        // Color Controls
        $$('input[name="pe-color-mode"]').forEach(r => {
            r.addEventListener('change', () => {
                peState.colorMode = r.value;
                $$('#pe-color-mode-group .radio-option').forEach(o => o.classList.remove('active'));
                r.closest('.radio-option').classList.add('active');
                updateRender();
            });
        });
        $('#pe-brightness-slider')?.addEventListener('input', e => {
            peState.brightness = parseInt(e.target.value);
            $('#pe-brightness-value').textContent = e.target.value;
            updateRender();
        });
        $('#pe-contrast-slider')?.addEventListener('input', e => {
            peState.contrast = parseInt(e.target.value);
            $('#pe-contrast-value').textContent = e.target.value;
            updateRender();
        });
        $('#pe-btn-color-reset')?.addEventListener('click', resetColorSettings);

        // Save
        $('#pe-btn-save')?.addEventListener('click', savePageEdits);

        // Canvas Interactions
        initCanvasMouseEvents();

        // Window resize
        window.addEventListener('resize', () => {
            if ($('#page-editor-overlay').style.display !== 'none' && peState.image) {
                fitCanvasToContainer();
                updateRender();
            }
        });
    }

    /* ============================================================
       OPEN & CLOSE EDITOR
       ============================================================ */
    window.openPageEditor = async function (pageIndex) {
        if (!state.pdfBytes || !state.pdfJsDoc) return;
        peState.pageIndex = pageIndex;
        showLoading('Sayfa hazırlanıyor...');

        try {
            // Render PDF page to high-res canvas
            const page = await state.pdfJsDoc.getPage(pageIndex + 1);
            const vp = page.getViewport({ scale: 3.0 }); // High resolution scale
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = vp.width;
            tempCanvas.height = vp.height;
            const ctx = tempCanvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            const img = new Image();
            img.onload = () => {
                peState.image = img;
                peState.canvas = $('#pe-canvas');
                peState.ctx = peState.canvas.getContext('2d', { willReadFrequently: true });
                resetState();
                $('#page-editor-overlay').style.display = 'flex';
                fitCanvasToContainer();
                updateRender();
                updateSidebarUI();
                hideLoading();
            };
            img.src = tempCanvas.toDataURL('image/png');
        } catch (err) {
            hideLoading();
            toast('Sayfa yüklenemedi: ' + err.message, 'error');
        }
    };

    function closePageEditor() {
        $('#page-editor-overlay').style.display = 'none';
        peState.image = null;
        if (peState._renderRAF) cancelAnimationFrame(peState._renderRAF);
    }

    function resetState() {
        peState.zoom = 1;
        peState.rotation = 0;
        peState.colorMode = 'color';
        peState.brightness = 0;
        peState.contrast = 0;
        peState.cropActive = false;
        peState.cropRect = null;
        peState.perspectiveActive = false;
        peState.perspectivePoints = null;
        $('#pe-canvas-wrapper').classList.remove('crop-mode', 'perspective-mode');
        $$('.perspective-point').forEach(p => p.remove());
    }

    function updateSidebarUI() {
        // Rotation
        updateRotationDisplay();
        // Colors
        $$('input[name="pe-color-mode"]').forEach(r => {
            r.checked = r.value === peState.colorMode;
            r.closest('.radio-option').classList.toggle('active', r.checked);
        });
        $('#pe-brightness-slider').value = peState.brightness;
        $('#pe-brightness-value').textContent = peState.brightness;
        $('#pe-contrast-slider').value = peState.contrast;
        $('#pe-contrast-value').textContent = peState.contrast;
        // Buttons
        updateCropButtons();
        updatePerspectiveButtons();
    }

    /* ============================================================
       RENDERING & CANVAS SIZING
       ============================================================ */
    function fitCanvasToContainer() {
        const container = $('#pe-canvas-area');
        if (!container || !peState.image) return;
        const maxW = container.clientWidth - 40;
        const maxH = container.clientHeight - 80;

        const imgW = peState.image.naturalWidth;
        const imgH = peState.image.naturalHeight;

        // Account for rotation
        const rad = (peState.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        const scale = Math.min(maxW / rotW, maxH / rotH, 1);
        peState.baseScale = scale;
        peState.zoom = 1;

        peState.canvas.width = Math.ceil(rotW * scale);
        peState.canvas.height = Math.ceil(rotH * scale);
        $('#pe-zoom-level').textContent = '100%';
    }

    function updateRender() {
        if (peState._renderRAF) cancelAnimationFrame(peState._renderRAF);
        peState._renderRAF = requestAnimationFrame(_doRender);
    }

    function _doRender() {
        if (!peState.image || !peState.canvas) return;
        const { canvas, ctx, image, rotation, baseScale, zoom, cropActive, cropRect, perspectiveActive, perspectivePoints } = peState;

        const imgW = image.naturalWidth;
        const imgH = image.naturalHeight;
        const scale = baseScale * zoom;

        const rad = (rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        canvas.width = Math.ceil(rotW * scale);
        canvas.height = Math.ceil(rotH * scale);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(image, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
        ctx.restore();

        applyColorFilters(ctx, canvas);

        if (cropActive && cropRect) drawCropOverlay(ctx, canvas, cropRect);
        if (perspectiveActive && perspectivePoints) drawPerspectiveOverlay(ctx, canvas, perspectivePoints);

        $('#pe-zoom-level').textContent = Math.round(zoom * 100) + '%';
    }

    /* ============================================================
       COLOR FILTERS
       ============================================================ */
    function applyColorFilters(ctx, canvas) {
        if (peState.brightness === 0 && peState.contrast === 0 && peState.colorMode === 'color') return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const bright = peState.brightness * 2.55;
        const contFactor = (259 * (peState.contrast * 2.55 + 255)) / (255 * (259 - peState.contrast * 2.55));

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            let r = data[i], g = data[i + 1], b = data[i + 2];
            r += bright; g += bright; b += bright;
            if (peState.contrast !== 0) {
                r = contFactor * (r - 128) + 128;
                g = contFactor * (g - 128) + 128;
                b = contFactor * (b - 128) + 128;
            }
            if (peState.colorMode === 'bw') {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = g = b = gray;
            }
            data[i] = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function resetColorSettings() {
        peState.brightness = 0;
        peState.contrast = 0;
        peState.colorMode = 'color';
        updateSidebarUI();
        updateRender();
    }

    /* ============================================================
       ROTATION
       ============================================================ */
    function setRotation(deg) {
        peState.rotation = ((deg % 360) + 360) % 360;
        fitCanvasToContainer();
        updateRender();
        updateRotationDisplay();
    }

    function updateRotationDisplay() {
        const angle = Math.round(peState.rotation * 10) / 10;
        $('#pe-rotation-value').textContent = `${angle}°`;
        $('#pe-rotation-input').value = angle;
        // Update dial
        const rad = ((angle - 90) * Math.PI) / 180;
        const cx = 70, cy = 70, r = 58;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        $('#pe-rotation-thumb')?.setAttribute('cx', x);
        $('#pe-rotation-thumb')?.setAttribute('cy', y);
    }

    function initDialInteraction() {
        const dial = $('#pe-rotation-dial');
        if (!dial) return;
        let dragging = false;

        function getAngle(e) {
            const rect = dial.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let a = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
            if (a < 0) a += 360;
            return a;
        }

        dial.addEventListener('mousedown', e => { dragging = true; setRotation(getAngle(e)); });
        document.addEventListener('mousemove', e => { if (dragging) setRotation(getAngle(e)); });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    /* ============================================================
       CROP SYSTEM
       ============================================================ */
    function startCrop(aspect) {
        peState.cropActive = true;
        peState.cropAspect = aspect;
        const cw = peState.canvas.width;
        const ch = peState.canvas.height;
        let w = cw * 0.8, h = ch * 0.8;

        if (aspect && aspect !== 'free') {
            const ratios = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, 'A4': 210 / 297 };
            const r = ratios[aspect];
            if (r) { if (w / h > r) w = h * r; else h = w / r; }
        }
        peState.cropRect = { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
        $('#pe-canvas-wrapper').classList.add('crop-mode');
        updateCropButtons();
        updateRender();
    }

    function cancelCrop() {
        peState.cropActive = false;
        peState.cropRect = null;
        $('#pe-canvas-wrapper').classList.remove('crop-mode');
        $$('.pe-aspect-btn').forEach(b => b.classList.remove('active'));
        $('.pe-aspect-btn[data-aspect="free"]')?.classList.add('active');
        updateCropButtons();
        updateRender();
    }

    function applyCrop() {
        if (!peState.cropRect) return;
        const { x, y, w, h } = peState.cropRect;
        const scale = peState.baseScale * peState.zoom;
        const scaleInv = 1 / scale;
        const origW = Math.round(w * scaleInv);
        const origH = Math.round(h * scaleInv);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = origW;
        tempCanvas.height = origH;
        const tempCtx = tempCanvas.getContext('2d');

        const workCanvas = document.createElement('canvas');
        const rad = (peState.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const imgW = peState.image.naturalWidth;
        const imgH = peState.image.naturalHeight;
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        workCanvas.width = rotW;
        workCanvas.height = rotH;
        const workCtx = workCanvas.getContext('2d');
        workCtx.translate(rotW / 2, rotH / 2);
        workCtx.rotate(rad);
        workCtx.drawImage(peState.image, -imgW / 2, -imgH / 2);

        tempCtx.drawImage(workCanvas, x * scaleInv, y * scaleInv, origW, origH, 0, 0, origW, origH);

        const img = new Image();
        img.onload = () => {
            peState.image = img;
            peState.rotation = 0;
            cancelCrop();
            fitCanvasToContainer();
            updateRotationDisplay();
            toast('Kırpma uygulandı', 'success');
        };
        img.src = tempCanvas.toDataURL('image/png');
    }

    function updateCropButtons() {
        const a = peState.cropActive;
        $('#pe-btn-crop-apply').style.display = a ? '' : 'none';
        $('#pe-btn-crop-cancel').style.display = a ? '' : 'none';
    }

    function drawCropOverlay(ctx, canvas, rect) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();

        const img = peState.image;
        const scale = peState.baseScale * peState.zoom;
        const rad = (peState.rotation * Math.PI) / 180;
        const imgW = img.naturalWidth, imgH = img.naturalHeight;

        ctx.save();
        ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
        ctx.restore();

        if (peState.brightness !== 0 || peState.contrast !== 0 || peState.colorMode === 'bw') {
            ctx.save();
            ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
            const id = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
            const d = id.data;
            const b = peState.brightness * 2.55;
            const cF = (259 * (peState.contrast * 2.55 + 255)) / (255 * (259 - peState.contrast * 2.55));
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] === 0) continue;
                let r = d[i] + b, g = d[i + 1] + b, bb = d[i + 2] + b;
                if (peState.contrast !== 0) { r = cF * (r - 128) + 128; g = cF * (g - 128) + 128; bb = cF * (bb - 128) + 128; }
                if (peState.colorMode === 'bw') { const gr = 0.299 * r + 0.587 * g + 0.114 * bb; r = g = bb = gr; }
                d[i] = Math.min(255, Math.max(0, r)); d[i + 1] = Math.min(255, Math.max(0, g)); d[i + 2] = Math.min(255, Math.max(0, bb));
            }
            ctx.putImageData(id, rect.x, rect.y);
            ctx.restore();
        }

        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 1;
        for (let i = 1; i <= 2; i++) {
            ctx.beginPath(); ctx.moveTo(rect.x + rect.w / 3 * i, rect.y); ctx.lineTo(rect.x + rect.w / 3 * i, rect.y + rect.h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rect.x, rect.y + rect.h / 3 * i); ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3 * i); ctx.stroke();
        }

        getCropHandles(rect).forEach(h => {
            ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = var_primary; ctx.lineWidth = 2; ctx.stroke();
        });
    }

    function getCropHandles(r) {
        return [
            { x: r.x, y: r.y, cur: 'nw-resize', type: 'tl' },
            { x: r.x + r.w / 2, y: r.y, cur: 'n-resize', type: 'tc' },
            { x: r.x + r.w, y: r.y, cur: 'ne-resize', type: 'tr' },
            { x: r.x + r.w, y: r.y + r.h / 2, cur: 'e-resize', type: 'mr' },
            { x: r.x + r.w, y: r.y + r.h, cur: 'se-resize', type: 'br' },
            { x: r.x + r.w / 2, y: r.y + r.h, cur: 's-resize', type: 'bc' },
            { x: r.x, y: r.y + r.h, cur: 'sw-resize', type: 'bl' },
            { x: r.x, y: r.y + r.h / 2, cur: 'w-resize', type: 'ml' },
        ];
    }
    function getHitHandle(x, y, r) {
        if (!r) return null;
        for (const h of getCropHandles(r)) if (Math.hypot(x - h.x, y - h.y) < 12) return h.type;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'move';
        return null;
    }

    /* ============================================================
       PERSPECTIVE SYSTEM
       ============================================================ */
    function togglePerspective() {
        if (peState.perspectiveActive) {
            peState.perspectiveActive = false;
            peState.perspectivePoints = null;
            $('#pe-canvas-wrapper').classList.remove('perspective-mode');
            $('#pe-btn-perspective-toggle').textContent = '📐 Perspektif Modunu Aç';
        } else {
            peState.perspectiveActive = true;
            const cw = peState.canvas.width, ch = peState.canvas.height, m = 30;
            peState.perspectivePoints = [{ x: m, y: m }, { x: cw - m, y: m }, { x: cw - m, y: ch - m }, { x: m, y: ch - m }];
            $('#pe-canvas-wrapper').classList.add('perspective-mode');
            $('#pe-btn-perspective-toggle').textContent = '📐 Perspektif Modunu Kapat';
        }
        updatePerspectiveButtons();
        updateRender();
    }
    function updatePerspectiveButtons() {
        const a = peState.perspectiveActive;
        $('#pe-btn-perspective-apply').style.display = a ? '' : 'none';
        $('#pe-btn-perspective-reset').style.display = a ? '' : 'none';
    }
    function resetPerspective() {
        if (!peState.perspectiveActive) return;
        const cw = peState.canvas.width, ch = peState.canvas.height, m = 30;
        peState.perspectivePoints = [{ x: m, y: m }, { x: cw - m, y: m }, { x: cw - m, y: ch - m }, { x: m, y: ch - m }];
        updateRender();
    }
    function drawPerspectiveOverlay(ctx, canvas, pts) {
        ctx.save();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
        pts.forEach((p, i) => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = colors[i]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        });
        ctx.restore();
    }

    function applyPerspective() {
        if (!peState.perspectivePoints) return;
        showLoading('Perspektif düzeltiliyor...');
        setTimeout(() => {
            try {
                const srcPts = peState.perspectivePoints;
                const scale = peState.baseScale * peState.zoom;
                const origPts = srcPts.map(p => ({ x: p.x / scale, y: p.y / scale }));

                const img = peState.image;
                const imgW = img.naturalWidth, imgH = img.naturalHeight;
                const rad = (peState.rotation * Math.PI) / 180;
                const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
                const rotW = imgW * cos + imgH * sin, rotH = imgW * sin + imgH * cos;

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = rotW; srcCanvas.height = rotH;
                const srcCtx = srcCanvas.getContext('2d');
                srcCtx.translate(rotW / 2, rotH / 2); srcCtx.rotate(rad); srcCtx.drawImage(img, -imgW / 2, -imgH / 2);

                const tW = Math.hypot(origPts[1].x - origPts[0].x, origPts[1].y - origPts[0].y);
                const bW = Math.hypot(origPts[2].x - origPts[3].x, origPts[2].y - origPts[3].y);
                const lH = Math.hypot(origPts[3].x - origPts[0].x, origPts[3].y - origPts[0].y);
                const rH = Math.hypot(origPts[2].x - origPts[1].x, origPts[2].y - origPts[1].y);
                const dstW = Math.round(Math.max(tW, bW)), dstH = Math.round(Math.max(lH, rH));
                const dstPts = [{ x: 0, y: 0 }, { x: dstW, y: 0 }, { x: dstW, y: dstH }, { x: 0, y: dstH }];

                const Hinv = computeHomography(dstPts, origPts);
                const dstCanvas = document.createElement('canvas');
                dstCanvas.width = dstW; dstCanvas.height = dstH;
                const dstCtx = dstCanvas.getContext('2d');
                const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
                const dstData = dstCtx.createImageData(dstW, dstH);

                for (let dy = 0; dy < dstH; dy++) {
                    for (let dx = 0; dx < dstW; dx++) {
                        const denom = Hinv[6] * dx + Hinv[7] * dy + 1;
                        const sx = (Hinv[0] * dx + Hinv[1] * dy + Hinv[2]) / denom;
                        const sy = (Hinv[3] * dx + Hinv[4] * dy + Hinv[5]) / denom;
                        const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = x0 + 1, y1 = y0 + 1;
                        const fx = sx - x0, fy = sy - y0;
                        if (x0 >= 0 && x1 < srcCanvas.width && y0 >= 0 && y1 < srcCanvas.height) {
                            const dIdx = (dy * dstW + dx) * 4;
                            for (let c = 0; c < 4; c++) {
                                const v00 = srcData.data[(y0 * srcCanvas.width + x0) * 4 + c];
                                const v10 = srcData.data[(y0 * srcCanvas.width + x1) * 4 + c];
                                const v01 = srcData.data[(y1 * srcCanvas.width + x0) * 4 + c];
                                const v11 = srcData.data[(y1 * srcCanvas.width + x1) * 4 + c];
                                dstData.data[dIdx + c] = Math.round(v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy);
                            }
                        }
                    }
                }
                dstCtx.putImageData(dstData, 0, 0);
                const newImg = new Image();
                newImg.onload = () => {
                    peState.image = newImg; peState.rotation = 0; togglePerspective();
                    fitCanvasToContainer(); updateRotationDisplay(); hideLoading(); toast('Perspektif düzeltildi', 'success');
                };
                newImg.src = dstCanvas.toDataURL('image/png');
            } catch (err) { hideLoading(); toast('Perspektif düzeltme hatası: ' + err.message, 'error'); }
        }, 50);
    }
    function computeHomography(src, dst) {
        const A = [];
        for (let i = 0; i < 4; i++) {
            const sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
            A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
            A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
        }
        const n = 8, Ab = [];
        for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < n; j++) r.push(A[i][j]); r.push(-A[i][8]); Ab.push(r); }
        for (let col = 0; col < n; col++) {
            let maxRow = col;
            for (let row = col + 1; row < n; row++) if (Math.abs(Ab[row][col]) > Math.abs(Ab[maxRow][col])) maxRow = row;
            [Ab[col], Ab[maxRow]] = [Ab[maxRow], Ab[col]];
            if (Math.abs(Ab[col][col]) < 1e-10) continue;
            for (let row = col + 1; row < n; row++) {
                const f = Ab[row][col] / Ab[col][col];
                for (let j = col; j <= n; j++) Ab[row][j] -= f * Ab[col][j];
            }
        }
        const h = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            h[i] = Ab[i][n];
            for (let j = i + 1; j < n; j++) h[i] -= Ab[i][j] * h[j];
            h[i] /= Ab[i][i];
        }
        return h;
    }

    /* ============================================================
       CANVAS EVENTS (MOUSE/TOUCH)
       ============================================================ */
    function initCanvasMouseEvents() {
        const c = $('#pe-canvas');
        if (!c) return;
        c.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY));
        document.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
        document.addEventListener('mouseup', handleEnd);
        c.addEventListener('touchstart', e => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        document.addEventListener('touchmove', e => handleMove(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
        document.addEventListener('touchend', handleEnd);

        c.addEventListener('mousemove', e => {
            if (peState.perspectiveDragIndex < 0 && !peState.cropDragging && peState.cropActive && peState.cropRect) {
                const rect = c.getBoundingClientRect();
                const x = e.clientX - rect.left, y = e.clientY - rect.top;
                const h = getHitHandle(x, y, peState.cropRect);
                const cursors = { 'move': 'move', 'tl': 'nw-resize', 'br': 'nw-resize', 'tr': 'ne-resize', 'bl': 'ne-resize', 'tc': 'n-resize', 'bc': 'n-resize', 'ml': 'e-resize', 'mr': 'e-resize' };
                c.style.cursor = cursors[h] || 'crosshair';
            }
        });
        c.addEventListener('mouseleave', () => { if (!peState.cropDragging && peState.perspectiveDragIndex < 0) c.style.cursor = 'default'; });

        function handleStart(cx, cy) {
            const r = c.getBoundingClientRect(); const x = cx - r.left, y = cy - r.top;
            if (peState.perspectiveActive && peState.perspectivePoints) {
                for (let i = 0; i < peState.perspectivePoints.length; i++) {
                    if (Math.hypot(x - peState.perspectivePoints[i].x, y - peState.perspectivePoints[i].y) < 15) { peState.perspectiveDragIndex = i; return; }
                }
            }
            if (peState.cropActive && peState.cropRect) {
                const h = getHitHandle(x, y, peState.cropRect);
                if (h) { peState.cropDragging = true; peState.cropHandle = h; peState.cropStartX = x; peState.cropStartY = y; peState._cropOrigRect = { ...peState.cropRect }; }
            }
        }
        function handleMove(cx, cy) {
            if ($('#page-editor-overlay').style.display === 'none') return;
            const r = c.getBoundingClientRect(); const x = cx - r.left, y = cy - r.top;
            if (peState.perspectiveDragIndex >= 0) {
                peState.perspectivePoints[peState.perspectiveDragIndex] = { x: clamp(x, 0, c.width), y: clamp(y, 0, c.height) };
                updateRender(); return;
            }
            if (peState.cropDragging && peState.cropRect) {
                const dx = x - peState.cropStartX, dy = y - peState.cropStartY, orig = peState._cropOrigRect, cr = peState.cropRect, cw = c.width, ch = c.height;
                if (peState.cropHandle === 'move') {
                    cr.x = clamp(orig.x + dx, 0, cw - cr.w); cr.y = clamp(orig.y + dy, 0, ch - cr.h);
                } else {
                    const h = peState.cropHandle; let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
                    if (h.includes('l')) { nx = orig.x + dx; nw = orig.w - dx; }
                    if (h.includes('r')) nw = orig.w + dx;
                    if (h.includes('t')) { ny = orig.y + dy; nh = orig.h - dy; }
                    if (h.includes('b')) nh = orig.h + dy;
                    if (peState.cropAspect && peState.cropAspect !== 'free') {
                        const ratios = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, 'A4': 210 / 297 };
                        const ra = ratios[peState.cropAspect];
                        if (ra) { if (h.includes('l') || h.includes('r')) nh = nw / ra; else nw = nh * ra; }
                    }
                    if (nw >= 20 && nh >= 20) {
                        cr.x = clamp(nx, 0, cw - 20); cr.y = clamp(ny, 0, ch - 20); cr.w = clamp(nw, 20, cw - cr.x); cr.h = clamp(nh, 20, ch - cr.y);
                    }
                }
                updateRender();
            }
        }
        function handleEnd() { peState.perspectiveDragIndex = -1; peState.cropDragging = false; peState.cropHandle = null; }
        function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
    }

    /* ============================================================
       SAVE & APPLY TO PDF
       ============================================================ */
    async function savePageEdits() {
        showLoading('PDF güncelleniyor...');
        try {
            // Render final canvas
            const img = peState.image;
            const imgW = img.naturalWidth, imgH = img.naturalHeight;
            const rad = (peState.rotation * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
            const rotW = Math.ceil(imgW * cos + imgH * sin), rotH = Math.ceil(imgW * sin + imgH * cos);

            const fCanvas = document.createElement('canvas');
            fCanvas.width = rotW; fCanvas.height = rotH;
            const fCtx = fCanvas.getContext('2d');
            fCtx.translate(rotW / 2, rotH / 2); fCtx.rotate(rad); fCtx.drawImage(img, -imgW / 2, -imgH / 2); fCtx.setTransform(1, 0, 0, 1, 0, 0);

            if (peState.brightness !== 0 || peState.contrast !== 0 || peState.colorMode === 'bw') {
                const id = fCtx.getImageData(0, 0, fCanvas.width, fCanvas.height);
                const d = id.data, b = peState.brightness * 2.55;
                const cF = (259 * (peState.contrast * 2.55 + 255)) / (255 * (259 - peState.contrast * 2.55));
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] === 0) continue;
                    let r = d[i] + b, g = d[i + 1] + b, bb = d[i + 2] + b;
                    if (peState.contrast !== 0) { r = cF * (r - 128) + 128; g = cF * (g - 128) + 128; bb = cF * (bb - 128) + 128; }
                    if (peState.colorMode === 'bw') { const gr = 0.299 * r + 0.587 * g + 0.114 * bb; r = g = bb = gr; }
                    d[i] = Math.min(255, Math.max(0, r)); d[i + 1] = Math.min(255, Math.max(0, g)); d[i + 2] = Math.min(255, Math.max(0, bb));
                }
                fCtx.putImageData(id, 0, 0);
            }

            const imgDataUrl = fCanvas.toDataURL('image/jpeg', 0.95);
            const imgBytes = Uint8Array.from(atob(imgDataUrl.split(',')[1]), c => c.charCodeAt(0));

            // Apply to PDF
            const pdfDoc = await PDFDocument.load(state.pdfBytes);
            const embedImg = await pdfDoc.embedJpg(imgBytes);

            // Replace page: create new page with image dimensions, copy old page annotations?
            // Simpler: create a new page, draw image, remove old page, insert new
            const newPage = pdfDoc.insertPage(peState.pageIndex, [embedImg.width, embedImg.height]);
            newPage.drawImage(embedImg, { x: 0, y: 0, width: embedImg.width, height: embedImg.height });
            pdfDoc.removePage(peState.pageIndex + 1);

            const newPdfBytes = await pdfDoc.save();

            // Notify app
            closePageEditor();
            await reloadAfterEdit(newPdfBytes);

            hideLoading();
            toast('Sayfa başarıyla düzenlendi!', 'success');

        } catch (err) {
            hideLoading();
            console.error(err);
            toast('Düzenleme kaydedilirken hata oluştu: ' + err.message, 'error');
        }
    }

    // Init on load
    document.addEventListener('DOMContentLoaded', initPageEditor);

})();
