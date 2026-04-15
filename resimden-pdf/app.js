/* ============================================================
   RESIMDEN PDF OLUŞTURUCU - Main Application
   ============================================================ */
(function () {
    'use strict';

    const { PDFDocument, rgb } = PDFLib;

    /* ---- Page Size Presets (points) ---- */
    const PAGE_SIZES = {
        'A3': [841.89, 1190.55],
        'A4': [595.28, 841.89],
        'A5': [419.53, 595.28],
        'Letter': [612, 792],
        'Legal': [612, 1008],
    };

    /* ---- State ---- */
    const state = {
        pages: [],
        currentEditIndex: -1,
        selectedPages: new Set(),
        currentScreen: 'welcome',
        dragSrcIndex: null,

        editor: {
            canvas: null,
            ctx: null,
            image: null,
            originalImageData: null,
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
            rotationDragging: false,

            perspectiveActive: false,
            perspectivePoints: null,
            perspectiveDragIndex: -1,

            colorMode: 'color',
            brightness: 0,
            contrast: 0,
            threshold: 128,

            _renderRAF: null,
        },

        camera: {
            stream: null,
            facingMode: 'environment',
        },

        pdfSettings: {
            pageSize: 'A4',
            customWidth: 210,
            customHeight: 297,
            orientation: 'portrait',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            fitMode: 'fit',
            bgColor: '#FFFFFF',
            quality: 'high',
            fileName: 'resimden-pdf',
        },
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

    /* ---- Helpers ---- */
    function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
    function mmToPt(mm) { return mm * 2.83465; }
    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 255, g: 255, b: 255 };
    }

    /* ============================================================
       SCREEN MANAGEMENT
       ============================================================ */
    function showScreen(screenId) {
        state.currentScreen = screenId;
        ['welcome', 'camera', 'editor', 'pages'].forEach(id => {
            const el = $(`#screen-${id}`);
            if (el) el.style.display = id === screenId ? '' : 'none';
        });

        // Header button visibility
        const hasPages = state.pages.length > 0;
        $('#btn-add-more').style.display = (screenId === 'pages' && hasPages) ? '' : 'none';
        $('#btn-settings').style.display = (screenId === 'pages' && hasPages) ? '' : 'none';
        $('#btn-generate-pdf').style.display = (screenId === 'pages' && hasPages) ? '' : 'none';
        $('#page-count').style.display = (screenId === 'pages' && hasPages) ? '' : 'none';
    }

    function updatePageCount() {
        const count = state.pages.length;
        $('#page-count').textContent = `${count} sayfa`;
        $('#page-count').style.display = count > 0 ? '' : 'none';
        $('#btn-add-more').style.display = count > 0 ? '' : 'none';
        $('#btn-settings').style.display = count > 0 ? '' : 'none';
        $('#btn-generate-pdf').style.display = count > 0 ? '' : 'none';
    }

    /* ============================================================
       FILE LOADING
       ============================================================ */
    function handleFiles(files) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            toast('Geçerli resim dosyası bulunamadı', 'error');
            return;
        }

        let loadedCount = 0;
        const totalCount = imageFiles.length;

        if (totalCount === 1) {
            // Single image → open editor directly
            const file = imageFiles[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => openEditor(img);
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            // Multiple images → add all to pages, then show page manager
            showLoading(`Resimler yükleniyor... (0/${totalCount})`);
            imageFiles.forEach((file, idx) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        // Create a canvas to store
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        state.pages.push({
                            id: generateId(),
                            canvas: canvas,
                            thumbnail: generateThumbnail(canvas, 300),
                            settings: getDefaultEditorSettings(),
                        });

                        loadedCount++;
                        $('#loading-text').textContent = `Resimler yükleniyor... (${loadedCount}/${totalCount})`;

                        if (loadedCount === totalCount) {
                            hideLoading();
                            showScreen('pages');
                            renderPageGrid();
                            updatePageCount();
                            toast(`${totalCount} resim eklendi`, 'success');
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
    }

    function generateThumbnail(sourceCanvas, maxSize) {
        const canvas = document.createElement('canvas');
        const ratio = sourceCanvas.width / sourceCanvas.height;
        if (ratio > 1) {
            canvas.width = maxSize;
            canvas.height = maxSize / ratio;
        } else {
            canvas.height = maxSize;
            canvas.width = maxSize * ratio;
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function getDefaultEditorSettings() {
        return {
            rotation: 0,
            colorMode: 'color',
            brightness: 0,
            contrast: 0,
            threshold: 128,
        };
    }

    /* ============================================================
       CAMERA MODULE
       ============================================================ */
    async function startCamera() {
        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast('Tarayıcınız kamera erişimini desteklemiyor. HTTPS gerekli olabilir.', 'error');
            return;
        }

        showScreen('camera');

        try {
            const constraints = {
                video: {
                    facingMode: state.camera.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            };
            state.camera.stream = await navigator.mediaDevices.getUserMedia(constraints);
            $('#camera-preview').srcObject = state.camera.stream;
        } catch (err) {
            toast('Kamera erişimi reddedildi: ' + err.message, 'error');
            goBackFromCamera();
        }
    }

    function stopCamera() {
        if (state.camera.stream) {
            state.camera.stream.getTracks().forEach(t => t.stop());
            state.camera.stream = null;
        }
        const video = $('#camera-preview');
        if (video) video.srcObject = null;
    }

    async function switchCamera() {
        state.camera.facingMode = state.camera.facingMode === 'environment' ? 'user' : 'environment';
        stopCamera();
        try {
            const constraints = {
                video: {
                    facingMode: state.camera.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            };
            state.camera.stream = await navigator.mediaDevices.getUserMedia(constraints);
            $('#camera-preview').srcObject = state.camera.stream;
        } catch (err) {
            toast('Kamera değiştirilemedi', 'error');
        }
    }

    function capturePhoto() {
        const video = $('#camera-preview');
        if (!video.videoWidth) {
            toast('Kamera henüz hazır değil', 'error');
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        // Flash effect
        const flash = el('div', { className: 'camera-flash' });
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 350);

        // Send to editor
        const img = new Image();
        img.onload = () => {
            stopCamera();
            openEditor(img);
        };
        img.src = canvas.toDataURL('image/jpeg', 0.95);
    }

    function goBackFromCamera() {
        stopCamera();
        if (state.pages.length > 0) {
            showScreen('pages');
        } else {
            showScreen('welcome');
        }
    }

    /* ============================================================
       IMAGE EDITOR
       ============================================================ */
    function openEditor(image, pageIndex = -1) {
        showScreen('editor');
        state.currentEditIndex = pageIndex;

        const s = state.editor;
        s.image = image;
        s.canvas = $('#editor-canvas');
        s.ctx = s.canvas.getContext('2d');

        // Load settings if editing existing page
        if (pageIndex >= 0) {
            const settings = state.pages[pageIndex].settings;
            s.rotation = settings.rotation || 0;
            s.colorMode = settings.colorMode || 'color';
            s.brightness = settings.brightness || 0;
            s.contrast = settings.contrast || 0;
            s.threshold = settings.threshold || 128;
        } else {
            s.rotation = 0;
            s.colorMode = 'color';
            s.brightness = 0;
            s.contrast = 0;
            s.threshold = 128;
        }

        s.cropActive = false;
        s.cropRect = null;
        s.perspectiveActive = false;
        s.perspectivePoints = null;
        s.zoom = 1;

        fitCanvasToContainer();
        renderEditor();
        updateSidebarValues();
        updateCropButtons();

        // Remove old perspective points from DOM
        $$('.perspective-point').forEach(p => p.remove());
    }

    function fitCanvasToContainer() {
        const container = $('#editor-canvas-area');
        const maxW = container.clientWidth - 40;
        const maxH = container.clientHeight - 40;
        const s = state.editor;
        const imgW = s.image.naturalWidth;
        const imgH = s.image.naturalHeight;

        // Account for rotation
        const rad = (s.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        const scale = Math.min(maxW / rotW, maxH / rotH, 1);
        s.baseScale = scale;
        s.zoom = 1;

        s.canvas.width = Math.ceil(rotW * scale);
        s.canvas.height = Math.ceil(rotH * scale);

        $('#editor-zoom-level').textContent = '100%';
    }

    function renderEditor() {
        if (state.editor._renderRAF) cancelAnimationFrame(state.editor._renderRAF);
        state.editor._renderRAF = requestAnimationFrame(_doRender);
    }

    function _doRender() {
        const s = state.editor;
        const canvas = s.canvas;
        const ctx = s.ctx;
        const img = s.image;
        if (!img || !canvas) return;

        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const scale = s.baseScale * s.zoom;

        // Recalculate canvas size for rotation
        const rad = (s.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        canvas.width = Math.ceil(rotW * scale);
        canvas.height = Math.ceil(rotH * scale);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        // Center and rotate
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
        ctx.restore();

        // Apply color filters
        applyColorFilters(ctx, canvas);

        // Draw crop overlay
        if (s.cropActive && s.cropRect) {
            drawCropOverlay(ctx, canvas, s.cropRect);
        }

        // Draw perspective points
        if (s.perspectiveActive && s.perspectivePoints) {
            drawPerspectiveOverlay(ctx, canvas, s.perspectivePoints);
        }
    }

    /* ---- Color Filters ---- */
    function applyColorFilters(ctx, canvas) {
        const s = state.editor;
        if (s.brightness === 0 && s.contrast === 0 && s.colorMode === 'color') return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const bright = s.brightness * 2.55;
        const contFactor = (259 * (s.contrast * 2.55 + 255)) / (255 * (259 - s.contrast * 2.55));

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue; // skip transparent pixels

            let r = data[i], g = data[i + 1], b = data[i + 2];

            // Brightness
            r += bright;
            g += bright;
            b += bright;

            // Contrast
            if (s.contrast !== 0) {
                r = contFactor * (r - 128) + 128;
                g = contFactor * (g - 128) + 128;
                b = contFactor * (b - 128) + 128;
            }

            // Black & White -> Grayscale
            if (s.colorMode === 'bw') {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = g = b = gray;
            }

            data[i] = clamp(r, 0, 255);
            data[i + 1] = clamp(g, 0, 255);
            data[i + 2] = clamp(b, 0, 255);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /* ---- Crop Overlay ---- */
    function drawCropOverlay(ctx, canvas, rect) {
        // Darken outside crop area
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();

        // Redraw the cropped area from original
        // Actually we need to just clear the overlay in the crop region
        // The image is already rendered, so we re-render just the crop area
        const s = state.editor;
        const img = s.image;
        const scale = s.baseScale * s.zoom;
        const rad = (s.rotation * Math.PI) / 180;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();

        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
        ctx.restore();

        // Re-apply color filters in crop area
        if (s.brightness !== 0 || s.contrast !== 0 || s.colorMode === 'bw') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
            ctx.clip();
            const imageData = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
            const data = imageData.data;
            const bright = s.brightness * 2.55;
            const contFactor = (259 * (s.contrast * 2.55 + 255)) / (255 * (259 - s.contrast * 2.55));
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                let r = data[i], g = data[i + 1], b = data[i + 2];
                r += bright; g += bright; b += bright;
                if (s.contrast !== 0) {
                    r = contFactor * (r - 128) + 128;
                    g = contFactor * (g - 128) + 128;
                    b = contFactor * (b - 128) + 128;
                }
                if (s.colorMode === 'bw') {
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = g = b = gray;
                }
                data[i] = clamp(r, 0, 255);
                data[i + 1] = clamp(g, 0, 255);
                data[i + 2] = clamp(b, 0, 255);
            }
            ctx.putImageData(imageData, rect.x, rect.y);
            ctx.restore();
        }

        // Crop border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.setLineDash([]);

        // Rule of thirds lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        const thirdW = rect.w / 3;
        const thirdH = rect.h / 3;
        for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(rect.x + thirdW * i, rect.y);
            ctx.lineTo(rect.x + thirdW * i, rect.y + rect.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(rect.x, rect.y + thirdH * i);
            ctx.lineTo(rect.x + rect.w, rect.y + thirdH * i);
            ctx.stroke();
        }

        // 8 handles
        const handles = getCropHandles(rect);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = var_primary;
        ctx.lineWidth = 2;
        handles.forEach(h => {
            ctx.beginPath();
            ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    const var_primary = '#f59e0b';

    function getCropHandles(rect) {
        const { x, y, w, h } = rect;
        return [
            { x, y, cursor: 'nw-resize', type: 'tl' },
            { x: x + w / 2, y, cursor: 'n-resize', type: 'tc' },
            { x: x + w, y, cursor: 'ne-resize', type: 'tr' },
            { x: x + w, y: y + h / 2, cursor: 'e-resize', type: 'mr' },
            { x: x + w, y: y + h, cursor: 'se-resize', type: 'br' },
            { x: x + w / 2, y: y + h, cursor: 's-resize', type: 'bc' },
            { x, y: y + h, cursor: 'sw-resize', type: 'bl' },
            { x, y: y + h / 2, cursor: 'w-resize', type: 'ml' },
        ];
    }

    function getHitHandle(x, y, rect) {
        if (!rect) return null;
        const handles = getCropHandles(rect);
        for (const h of handles) {
            if (Math.hypot(x - h.x, y - h.y) < 12) return h.type;
        }
        // Check if inside crop rect (move)
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
            return 'move';
        }
        return null;
    }

    /* ---- Perspective Overlay ---- */
    function drawPerspectiveOverlay(ctx, canvas, points) {
        ctx.save();
        // Lines
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Points
        const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = colors[i];
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
        });
        ctx.restore();
    }

    /* ---- Crop Logic ---- */
    function startCrop(aspect) {
        const s = state.editor;
        s.cropActive = true;
        s.cropAspect = aspect;

        // Default crop rect: 80% of canvas centered
        const cw = s.canvas.width;
        const ch = s.canvas.height;
        let cropW = cw * 0.8;
        let cropH = ch * 0.8;

        if (aspect && aspect !== 'free') {
            let ratio;
            if (aspect === '1:1') ratio = 1;
            else if (aspect === '4:3') ratio = 4 / 3;
            else if (aspect === '16:9') ratio = 16 / 9;
            else if (aspect === 'A4') ratio = 210 / 297;
            else ratio = null;

            if (ratio) {
                if (cropW / cropH > ratio) {
                    cropW = cropH * ratio;
                } else {
                    cropH = cropW / ratio;
                }
            }
        }

        s.cropRect = {
            x: (cw - cropW) / 2,
            y: (ch - cropH) / 2,
            w: cropW,
            h: cropH,
        };

        $('#editor-canvas-wrapper').classList.add('crop-mode');
        updateCropButtons();
        renderEditor();
    }

    function applyCrop() {
        const s = state.editor;
        if (!s.cropRect) return;

        const { x, y, w, h } = s.cropRect;
        const scale = s.baseScale * s.zoom;

        // Create a temp canvas with just the cropped region at full res
        const scaleInv = 1 / scale;
        const origW = Math.round(w * scaleInv);
        const origH = Math.round(h * scaleInv);

        // Get the current rendered image data from the crop region
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = origW;
        tempCanvas.height = origH;
        const tempCtx = tempCanvas.getContext('2d');

        // Render full image to a work canvas at original res and extract the crop
        const workCanvas = document.createElement('canvas');
        const rad = (s.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const imgW = s.image.naturalWidth;
        const imgH = s.image.naturalHeight;
        const rotW = imgW * cos + imgH * sin;
        const rotH = imgW * sin + imgH * cos;

        workCanvas.width = rotW;
        workCanvas.height = rotH;
        const workCtx = workCanvas.getContext('2d');

        workCtx.translate(rotW / 2, rotH / 2);
        workCtx.rotate(rad);
        workCtx.drawImage(s.image, -imgW / 2, -imgH / 2);

        // Extract crop region (convert from scaled to original coords)
        const srcX = x * scaleInv;
        const srcY = y * scaleInv;

        tempCtx.drawImage(workCanvas, srcX, srcY, origW, origH, 0, 0, origW, origH);

        // Replace image
        const img = new Image();
        img.onload = () => {
            s.image = img;
            s.rotation = 0;
            s.cropActive = false;
            s.cropRect = null;
            $('#editor-canvas-wrapper').classList.remove('crop-mode');
            fitCanvasToContainer();
            renderEditor();
            updateCropButtons();
            updateRotationDisplay();
            toast('Kırpma uygulandı', 'success');
        };
        img.src = tempCanvas.toDataURL('image/png');
    }

    function cancelCrop() {
        state.editor.cropActive = false;
        state.editor.cropRect = null;
        $('#editor-canvas-wrapper').classList.remove('crop-mode');
        updateCropButtons();
        renderEditor();
    }

    function updateCropButtons() {
        const active = state.editor.cropActive;
        $('#btn-crop-apply').style.display = active ? '' : 'none';
        $('#btn-crop-cancel').style.display = active ? '' : 'none';
    }

    /* ---- Rotation ---- */
    function setRotation(degrees) {
        state.editor.rotation = ((degrees % 360) + 360) % 360;
        fitCanvasToContainer();
        renderEditor();
        updateRotationDisplay();
    }

    function updateRotationDisplay() {
        const angle = Math.round(state.editor.rotation * 10) / 10;
        $('#rotation-value').textContent = `${angle}°`;
        $('#rotation-input').value = angle;
        updateDialThumb(angle);
    }

    function updateDialThumb(degrees) {
        const rad = ((degrees - 90) * Math.PI) / 180; // -90 because 0° is at top
        const cx = 70, cy = 70, r = 58;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        const thumb = $('#rotation-thumb');
        thumb.setAttribute('cx', x);
        thumb.setAttribute('cy', y);
    }

    /* ---- Perspective ---- */
    function togglePerspective() {
        const s = state.editor;
        if (s.perspectiveActive) {
            s.perspectiveActive = false;
            s.perspectivePoints = null;
            $('#editor-canvas-wrapper').classList.remove('perspective-mode');
            $('#btn-perspective-toggle').textContent = '📐 Perspektif Modunu Aç';
            $('#btn-perspective-apply').style.display = 'none';
            $('#btn-perspective-reset').style.display = 'none';
        } else {
            s.perspectiveActive = true;
            const cw = s.canvas.width;
            const ch = s.canvas.height;
            const margin = 30;
            s.perspectivePoints = [
                { x: margin, y: margin },
                { x: cw - margin, y: margin },
                { x: cw - margin, y: ch - margin },
                { x: margin, y: ch - margin },
            ];
            $('#editor-canvas-wrapper').classList.add('perspective-mode');
            $('#btn-perspective-toggle').textContent = '📐 Perspektif Modunu Kapat';
            $('#btn-perspective-apply').style.display = '';
            $('#btn-perspective-reset').style.display = '';
        }
        renderEditor();
    }

    function applyPerspective() {
        const s = state.editor;
        if (!s.perspectivePoints) return;

        showLoading('Perspektif düzeltiliyor...');

        setTimeout(() => {
            try {
                const srcPts = s.perspectivePoints;
                const scale = s.baseScale * s.zoom;

                // Convert to original image coordinates
                const origPts = srcPts.map(p => ({
                    x: p.x / scale,
                    y: p.y / scale,
                }));

                // First render the rotated image at full resolution
                const img = s.image;
                const imgW = img.naturalWidth;
                const imgH = img.naturalHeight;
                const rad = (s.rotation * Math.PI) / 180;
                const cos = Math.abs(Math.cos(rad));
                const sin = Math.abs(Math.sin(rad));
                const rotW = imgW * cos + imgH * sin;
                const rotH = imgW * sin + imgH * cos;

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = rotW;
                srcCanvas.height = rotH;
                const srcCtx = srcCanvas.getContext('2d');
                srcCtx.translate(rotW / 2, rotH / 2);
                srcCtx.rotate(rad);
                srcCtx.drawImage(img, -imgW / 2, -imgH / 2);

                // Calculate target dimensions from perspective points
                const topW = Math.hypot(origPts[1].x - origPts[0].x, origPts[1].y - origPts[0].y);
                const botW = Math.hypot(origPts[2].x - origPts[3].x, origPts[2].y - origPts[3].y);
                const leftH = Math.hypot(origPts[3].x - origPts[0].x, origPts[3].y - origPts[0].y);
                const rightH = Math.hypot(origPts[2].x - origPts[1].x, origPts[2].y - origPts[1].y);
                const dstW = Math.round(Math.max(topW, botW));
                const dstH = Math.round(Math.max(leftH, rightH));

                const dstPts = [
                    { x: 0, y: 0 },
                    { x: dstW, y: 0 },
                    { x: dstW, y: dstH },
                    { x: 0, y: dstH },
                ];

                // Compute homography
                const H = computeHomography(origPts, dstPts);
                const Hinv = computeHomography(dstPts, origPts);

                // Apply inverse mapping
                const dstCanvas = document.createElement('canvas');
                dstCanvas.width = dstW;
                dstCanvas.height = dstH;
                const dstCtx = dstCanvas.getContext('2d');
                const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
                const dstData = dstCtx.createImageData(dstW, dstH);

                for (let dy = 0; dy < dstH; dy++) {
                    for (let dx = 0; dx < dstW; dx++) {
                        // Map destination pixel to source using inverse homography
                        const denom = Hinv[6] * dx + Hinv[7] * dy + 1;
                        const sx = (Hinv[0] * dx + Hinv[1] * dy + Hinv[2]) / denom;
                        const sy = (Hinv[3] * dx + Hinv[4] * dy + Hinv[5]) / denom;

                        // Bilinear interpolation
                        const x0 = Math.floor(sx), y0 = Math.floor(sy);
                        const x1 = x0 + 1, y1 = y0 + 1;
                        const fx = sx - x0, fy = sy - y0;

                        if (x0 >= 0 && x1 < srcCanvas.width && y0 >= 0 && y1 < srcCanvas.height) {
                            const dIdx = (dy * dstW + dx) * 4;
                            for (let c = 0; c < 4; c++) {
                                const v00 = srcData.data[(y0 * srcCanvas.width + x0) * 4 + c];
                                const v10 = srcData.data[(y0 * srcCanvas.width + x1) * 4 + c];
                                const v01 = srcData.data[(y1 * srcCanvas.width + x0) * 4 + c];
                                const v11 = srcData.data[(y1 * srcCanvas.width + x1) * 4 + c];
                                dstData.data[dIdx + c] = Math.round(
                                    v00 * (1 - fx) * (1 - fy) +
                                    v10 * fx * (1 - fy) +
                                    v01 * (1 - fx) * fy +
                                    v11 * fx * fy
                                );
                            }
                        }
                    }
                }

                dstCtx.putImageData(dstData, 0, 0);

                const newImg = new Image();
                newImg.onload = () => {
                    s.image = newImg;
                    s.rotation = 0;
                    s.perspectiveActive = false;
                    s.perspectivePoints = null;
                    $('#editor-canvas-wrapper').classList.remove('perspective-mode');
                    $('#btn-perspective-toggle').textContent = '📐 Perspektif Modunu Aç';
                    $('#btn-perspective-apply').style.display = 'none';
                    $('#btn-perspective-reset').style.display = 'none';
                    fitCanvasToContainer();
                    renderEditor();
                    updateRotationDisplay();
                    hideLoading();
                    toast('Perspektif düzeltildi', 'success');
                };
                newImg.src = dstCanvas.toDataURL('image/png');
            } catch (err) {
                hideLoading();
                toast('Perspektif düzeltme hatası: ' + err.message, 'error');
            }
        }, 50);
    }

    function computeHomography(src, dst) {
        // Direct Linear Transform (DLT) algorithm
        // Solves 8-parameter homography from 4 point correspondences
        const A = [];
        for (let i = 0; i < 4; i++) {
            const sx = src[i].x, sy = src[i].y;
            const dx = dst[i].x, dy = dst[i].y;
            A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
            A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
        }

        // Solve using Gaussian elimination
        // We have 8 equations, 8 unknowns (h1..h8, h9=1)
        const n = 8;
        const Ab = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) row.push(A[i][j]);
            row.push(-A[i][8]);
            Ab.push(row);
        }

        // Forward elimination
        for (let col = 0; col < n; col++) {
            let maxRow = col;
            for (let row = col + 1; row < n; row++) {
                if (Math.abs(Ab[row][col]) > Math.abs(Ab[maxRow][col])) maxRow = row;
            }
            [Ab[col], Ab[maxRow]] = [Ab[maxRow], Ab[col]];

            if (Math.abs(Ab[col][col]) < 1e-10) continue;

            for (let row = col + 1; row < n; row++) {
                const factor = Ab[row][col] / Ab[col][col];
                for (let j = col; j <= n; j++) {
                    Ab[row][j] -= factor * Ab[col][j];
                }
            }
        }

        // Back substitution
        const h = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            h[i] = Ab[i][n];
            for (let j = i + 1; j < n; j++) {
                h[i] -= Ab[i][j] * h[j];
            }
            h[i] /= Ab[i][i];
        }

        return h; // [h0..h7], h8 = 1 (implicit)
    }

    /* ---- Generate Final Canvas ---- */
    function generateFinalCanvas() {
        const s = state.editor;
        const img = s.image;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        // Rotation at full resolution
        const rad = (s.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rotW = Math.ceil(imgW * cos + imgH * sin);
        const rotH = Math.ceil(imgW * sin + imgH * cos);

        const canvas = document.createElement('canvas');
        canvas.width = rotW;
        canvas.height = rotH;
        const ctx = canvas.getContext('2d');

        ctx.translate(rotW / 2, rotH / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -imgW / 2, -imgH / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Apply color filters at full resolution
        if (s.brightness !== 0 || s.contrast !== 0 || s.colorMode === 'bw') {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const bright = s.brightness * 2.55;
            const contFactor = (259 * (s.contrast * 2.55 + 255)) / (255 * (259 - s.contrast * 2.55));

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                let r = data[i], g = data[i + 1], b = data[i + 2];
                r += bright; g += bright; b += bright;
                if (s.contrast !== 0) {
                    r = contFactor * (r - 128) + 128;
                    g = contFactor * (g - 128) + 128;
                    b = contFactor * (b - 128) + 128;
                }
                if (s.colorMode === 'bw') {
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = g = b = gray;
                }
                data[i] = clamp(r, 0, 255);
                data[i + 1] = clamp(g, 0, 255);
                data[i + 2] = clamp(b, 0, 255);
            }
            ctx.putImageData(imageData, 0, 0);
        }

        return canvas;
    }

    /* ---- Save Editor Result ---- */
    function saveEditorResult() {
        showLoading('Kaydediliyor...');

        setTimeout(() => {
            const finalCanvas = generateFinalCanvas();
            const pageData = {
                id: generateId(),
                canvas: finalCanvas,
                thumbnail: generateThumbnail(finalCanvas, 300),
                settings: {
                    rotation: state.editor.rotation,
                    colorMode: state.editor.colorMode,
                    brightness: state.editor.brightness,
                    contrast: state.editor.contrast,
                    threshold: state.editor.threshold,
                },
            };

            if (state.currentEditIndex >= 0) {
                state.pages[state.currentEditIndex] = pageData;
                toast('Sayfa güncellendi', 'success');
            } else {
                state.pages.push(pageData);
                toast('Sayfa eklendi', 'success');
            }

            state.currentEditIndex = -1;
            hideLoading();
            showScreen('pages');
            renderPageGrid();
            updatePageCount();
        }, 50);
    }

    /* ---- Update Sidebar Values ---- */
    function updateSidebarValues() {
        const s = state.editor;

        // Rotation
        updateRotationDisplay();

        // Color mode
        $$('input[name="color-mode"]').forEach(r => {
            r.checked = r.value === s.colorMode;
            r.closest('.radio-option').classList.toggle('active', r.checked);
        });

        // Sliders
        $('#brightness-slider').value = s.brightness;
        $('#brightness-value').textContent = s.brightness;
        $('#contrast-slider').value = s.contrast;
        $('#contrast-value').textContent = s.contrast;
        // Aspect buttons
        $$('.aspect-btn').forEach(b => b.classList.toggle('active', b.dataset.aspect === 'free'));
    }

    /* ============================================================
       PAGE MANAGEMENT
       ============================================================ */
    function renderPageGrid() {
        const grid = $('#pages-grid');
        grid.innerHTML = '';

        if (state.pages.length === 0) {
            grid.innerHTML = `
                <div class="pages-empty">
                    <div class="pages-empty-icon">📄</div>
                    <p>Henüz sayfa eklenmedi</p>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                        <button class="btn btn-primary" id="btn-empty-add-file">📁 Dosyadan Ekle</button>
                        <button class="btn btn-ghost" id="btn-empty-add-camera">📷 Kameradan Ekle</button>
                    </div>
                </div>
            `;
            $('#btn-empty-add-file')?.addEventListener('click', () => $('#file-input-images').click());
            $('#btn-empty-add-camera')?.addEventListener('click', startCamera);
            return;
        }

        state.pages.forEach((page, index) => {
            const card = el('div', {
                className: 'page-card' + (state.selectedPages.has(index) ? ' selected' : ''),
                'data-index': index,
                draggable: 'true',
            }, [
                el('span', { className: 'page-card-drag', textContent: '⠿' }),
                createThumbElement(page),
                el('span', { className: 'page-card-check', textContent: '✓' }),
                el('div', { className: 'page-card-footer' }, [
                    el('span', { className: 'page-card-number', textContent: `${index + 1}` }),
                    el('div', { className: 'page-card-actions' }, [
                        el('button', {
                            className: 'page-card-btn',
                            textContent: '✏️',
                            title: 'Düzenle',
                            onClick: (e) => { e.stopPropagation(); editPage(index); },
                        }),
                        el('button', {
                            className: 'page-card-btn btn-card-delete',
                            textContent: '🗑️',
                            title: 'Sil',
                            onClick: (e) => { e.stopPropagation(); deletePage(index); },
                        }),
                    ]),
                ]),
            ]);

            card.addEventListener('click', () => togglePageSelection(index));
            card.addEventListener('dragstart', onPageDragStart);
            card.addEventListener('dragover', onPageDragOver);
            card.addEventListener('drop', onPageDrop);
            card.addEventListener('dragend', onPageDragEnd);
            card.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));

            grid.appendChild(card);
        });

        updateSelectionUI();
    }

    function createThumbElement(page) {
        const wrapper = el('div', { className: 'page-card-thumb' });
        const thumb = page.thumbnail;
        if (thumb instanceof HTMLCanvasElement) {
            const img = el('img');
            img.src = thumb.toDataURL('image/jpeg', 0.8);
            wrapper.appendChild(img);
        }
        return wrapper;
    }

    function togglePageSelection(index) {
        if (state.selectedPages.has(index)) {
            state.selectedPages.delete(index);
        } else {
            state.selectedPages.add(index);
        }
        const card = $(`.page-card[data-index="${index}"]`);
        if (card) card.classList.toggle('selected', state.selectedPages.has(index));
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const count = state.selectedPages.size;
        $('#pages-selection-count').textContent = count > 0 ? `${count} sayfa seçili` : '';
        $('#btn-pages-delete-selected').style.display = count > 0 ? '' : 'none';
    }

    function editPage(index) {
        const page = state.pages[index];
        const img = new Image();
        img.onload = () => openEditor(img, index);
        img.src = page.canvas.toDataURL('image/png');
    }

    function deletePage(index) {
        state.pages.splice(index, 1);
        state.selectedPages.delete(index);
        // Re-index selections
        const newSet = new Set();
        state.selectedPages.forEach(i => {
            if (i < index) newSet.add(i);
            else if (i > index) newSet.add(i - 1);
        });
        state.selectedPages = newSet;

        renderPageGrid();
        updatePageCount();

        if (state.pages.length === 0) {
            updatePageCount();
        }
        toast('Sayfa silindi', 'info');
    }

    function deleteSelectedPages() {
        if (state.selectedPages.size === 0) return;
        const indices = Array.from(state.selectedPages).sort((a, b) => b - a);
        indices.forEach(i => state.pages.splice(i, 1));
        state.selectedPages.clear();
        renderPageGrid();
        updatePageCount();
        toast(`${indices.length} sayfa silindi`, 'info');
    }

    function selectAllPages() {
        state.pages.forEach((_, i) => state.selectedPages.add(i));
        $$('.page-card').forEach(c => c.classList.add('selected'));
        updateSelectionUI();
    }

    /* ---- Drag & Drop Reorder ---- */
    function onPageDragStart(e) {
        state.dragSrcIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
    function onPageDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }
    function onPageDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const targetIdx = parseInt(e.currentTarget.dataset.index);
        if (state.dragSrcIndex !== null && state.dragSrcIndex !== targetIdx) {
            const [moved] = state.pages.splice(state.dragSrcIndex, 1);
            state.pages.splice(targetIdx, 0, moved);
            state.selectedPages.clear();
            renderPageGrid();
            toast('Sayfa sırası güncellendi', 'success');
        }
    }
    function onPageDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        state.dragSrcIndex = null;
    }

    /* ============================================================
       PDF GENERATION
       ============================================================ */
    function showSettingsModal() {
        const s = state.pdfSettings;
        $('#opt-page-size').value = s.pageSize;
        $('#opt-custom-w').value = s.customWidth;
        $('#opt-custom-h').value = s.customHeight;
        $('#custom-size-group').style.display = s.pageSize === 'custom' ? '' : 'none';

        $$('input[name="orientation"]').forEach(r => {
            r.checked = r.value === s.orientation;
            r.closest('.radio-option').classList.toggle('active', r.checked);
        });

        $$('input[name="fit-mode"]').forEach(r => {
            r.checked = r.value === s.fitMode;
            r.closest('.radio-option').classList.toggle('active', r.checked);
        });

        $('#opt-margin-top').value = s.margins.top;
        $('#opt-margin-bottom').value = s.margins.bottom;
        $('#opt-margin-left').value = s.margins.left;
        $('#opt-margin-right').value = s.margins.right;
        $('#opt-bg-color').value = s.bgColor;
        $('#opt-quality').value = s.quality;
        $('#opt-filename').value = s.fileName;

        $('#modal-overlay').style.display = '';
    }

    function closeModal() {
        $('#modal-overlay').style.display = 'none';
    }

    function saveSettings() {
        const s = state.pdfSettings;
        s.pageSize = $('#opt-page-size').value;
        s.customWidth = parseInt($('#opt-custom-w').value) || 210;
        s.customHeight = parseInt($('#opt-custom-h').value) || 297;
        s.orientation = document.querySelector('input[name="orientation"]:checked')?.value || 'portrait';
        s.fitMode = document.querySelector('input[name="fit-mode"]:checked')?.value || 'fit';
        s.margins.top = parseInt($('#opt-margin-top').value) || 0;
        s.margins.bottom = parseInt($('#opt-margin-bottom').value) || 0;
        s.margins.left = parseInt($('#opt-margin-left').value) || 0;
        s.margins.right = parseInt($('#opt-margin-right').value) || 0;
        s.bgColor = $('#opt-bg-color').value;
        s.quality = $('#opt-quality').value;
        s.fileName = $('#opt-filename').value || 'resimden-pdf';
    }

    function getPageDimensions() {
        const s = state.pdfSettings;
        let w, h;
        if (s.pageSize === 'custom') {
            w = mmToPt(s.customWidth);
            h = mmToPt(s.customHeight);
        } else {
            [w, h] = PAGE_SIZES[s.pageSize];
        }
        if (s.orientation === 'landscape') [w, h] = [h, w];
        return { w, h };
    }

    function calculateImageDimensions(imgW, imgH, usableW, usableH, fitMode) {
        if (fitMode === 'fit') {
            const scale = Math.min(usableW / imgW, usableH / imgH);
            return { width: imgW * scale, height: imgH * scale };
        }
        if (fitMode === 'fill') {
            const scale = Math.max(usableW / imgW, usableH / imgH);
            return { width: imgW * scale, height: imgH * scale };
        }
        // original
        const scale = Math.min(1, usableW / imgW, usableH / imgH);
        return { width: imgW * scale, height: imgH * scale };
    }

    async function generatePDF() {
        if (state.pages.length === 0) {
            toast('Henüz sayfa eklenmedi!', 'error');
            return;
        }

        saveSettings();
        closeModal();
        showLoading('PDF oluşturuluyor...');

        try {
            const pdfDoc = await PDFDocument.create();
            const settings = state.pdfSettings;
            const { w: pageW, h: pageH } = getPageDimensions();

            const margins = {
                top: mmToPt(settings.margins.top),
                bottom: mmToPt(settings.margins.bottom),
                left: mmToPt(settings.margins.left),
                right: mmToPt(settings.margins.right),
            };

            const usableW = pageW - margins.left - margins.right;
            const usableH = pageH - margins.top - margins.bottom;

            for (let i = 0; i < state.pages.length; i++) {
                $('#loading-text').textContent = `Sayfa ${i + 1}/${state.pages.length} işleniyor...`;
                await new Promise(r => setTimeout(r, 10)); // UI update

                const pageData = state.pages[i];
                const page = pdfDoc.addPage([pageW, pageH]);

                // Background color
                if (settings.bgColor !== '#FFFFFF') {
                    const bgRgb = hexToRgb(settings.bgColor);
                    page.drawRectangle({
                        x: 0, y: 0,
                        width: pageW, height: pageH,
                        color: rgb(bgRgb.r / 255, bgRgb.g / 255, bgRgb.b / 255),
                    });
                }

                // Convert canvas to JPEG bytes
                const quality = settings.quality === 'low' ? 0.5 : settings.quality === 'medium' ? 0.75 : 0.92;
                const dataUrl = pageData.canvas.toDataURL('image/jpeg', quality);
                const imgBytes = dataUrlToBytes(dataUrl);
                const pdfImage = await pdfDoc.embedJpg(imgBytes);

                // Calculate dimensions
                const dims = calculateImageDimensions(
                    pdfImage.width, pdfImage.height,
                    usableW, usableH,
                    settings.fitMode
                );

                // Center on page
                const x = margins.left + (usableW - dims.width) / 2;
                const y = margins.bottom + (usableH - dims.height) / 2;

                page.drawImage(pdfImage, {
                    x, y,
                    width: dims.width,
                    height: dims.height,
                });
            }

            // Metadata
            pdfDoc.setTitle(settings.fileName);
            pdfDoc.setCreator('Resimden PDF Oluşturucu');
            pdfDoc.setProducer('pdf-lib');
            pdfDoc.setCreationDate(new Date());

            const pdfBytes = await pdfDoc.save();
            downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${settings.fileName}.pdf`);

            hideLoading();
            toast(`${state.pages.length} sayfalık PDF oluşturuldu!`, 'success');
        } catch (err) {
            hideLoading();
            toast('PDF oluşturma hatası: ' + err.message, 'error');
            console.error(err);
        }
    }

    function dataUrlToBytes(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ============================================================
       EVENT BINDING
       ============================================================ */
    function init() {
        // ---- Welcome Screen ----
        $('#btn-select-files').addEventListener('click', () => $('#file-input-images').click());
        $('#btn-open-camera').addEventListener('click', startCamera);

        $('#file-input-images').addEventListener('change', e => {
            if (e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = '';
        });

        // Drop zone drag & drop
        const dropZone = $('#drop-zone');
        dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', e => {
            e.preventDefault();
            if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        // ---- Camera ----
        $('#btn-camera-capture').addEventListener('click', capturePhoto);
        $('#btn-camera-switch').addEventListener('click', switchCamera);
        $('#btn-camera-close').addEventListener('click', goBackFromCamera);

        // ---- Editor: Crop ----
        $$('.aspect-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.aspect-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                startCrop(btn.dataset.aspect);
            });
        });
        $('#btn-crop-apply').addEventListener('click', applyCrop);
        $('#btn-crop-cancel').addEventListener('click', cancelCrop);

        // ---- Editor: Rotation ----
        // Dial interaction
        const dial = $('#rotation-dial');
        let dialDragging = false;

        function getDialAngle(e) {
            const rect = dial.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
            if (angle < 0) angle += 360;
            return angle;
        }

        dial.addEventListener('mousedown', e => {
            dialDragging = true;
            $('#rotation-thumb').classList.add('dragging');
            setRotation(getDialAngle(e));
        });
        document.addEventListener('mousemove', e => {
            if (!dialDragging) return;
            setRotation(getDialAngle(e));
        });
        document.addEventListener('mouseup', () => {
            dialDragging = false;
            $('#rotation-thumb').classList.remove('dragging');
        });

        // Touch support for dial
        dial.addEventListener('touchstart', e => {
            e.preventDefault();
            dialDragging = true;
            $('#rotation-thumb').classList.add('dragging');
            setRotation(getDialAngle(e.touches[0]));
        });
        document.addEventListener('touchmove', e => {
            if (!dialDragging) return;
            setRotation(getDialAngle(e.touches[0]));
        });
        document.addEventListener('touchend', () => {
            dialDragging = false;
            $('#rotation-thumb').classList.remove('dragging');
        });

        // Quick rotation buttons
        $('#btn-rotate-cw').addEventListener('click', () => setRotation(state.editor.rotation + 90));
        $('#btn-rotate-ccw').addEventListener('click', () => setRotation(state.editor.rotation - 90));
        $('#btn-rotate-180').addEventListener('click', () => setRotation(state.editor.rotation + 180));
        $('#btn-rotate-reset').addEventListener('click', () => setRotation(0));

        // Rotation number input
        $('#rotation-input').addEventListener('change', e => {
            setRotation(parseFloat(e.target.value) || 0);
        });

        // ---- Editor: Perspective ----
        $('#btn-perspective-toggle').addEventListener('click', togglePerspective);
        $('#btn-perspective-apply').addEventListener('click', applyPerspective);
        $('#btn-perspective-reset').addEventListener('click', () => {
            if (state.editor.perspectiveActive) {
                const cw = state.editor.canvas.width;
                const ch = state.editor.canvas.height;
                const margin = 30;
                state.editor.perspectivePoints = [
                    { x: margin, y: margin },
                    { x: cw - margin, y: margin },
                    { x: cw - margin, y: ch - margin },
                    { x: margin, y: ch - margin },
                ];
                renderEditor();
            }
        });

        // ---- Editor: Color ----
        $$('input[name="color-mode"]').forEach(r => {
            r.addEventListener('change', () => {
                state.editor.colorMode = r.value;
                $$('#color-mode-group .radio-option').forEach(o => o.classList.remove('active'));
                r.closest('.radio-option').classList.add('active');
                renderEditor();
            });
        });

        $('#brightness-slider').addEventListener('input', e => {
            state.editor.brightness = parseInt(e.target.value);
            $('#brightness-value').textContent = e.target.value;
            renderEditor();
        });
        $('#contrast-slider').addEventListener('input', e => {
            state.editor.contrast = parseInt(e.target.value);
            $('#contrast-value').textContent = e.target.value;
            renderEditor();
        });

        $('#btn-color-reset').addEventListener('click', () => {
            state.editor.brightness = 0;
            state.editor.contrast = 0;
            state.editor.threshold = 128;
            state.editor.colorMode = 'color';
            updateSidebarValues();
            renderEditor();
        });

        // ---- Editor: Save / Cancel ----
        $('#btn-editor-save').addEventListener('click', saveEditorResult);
        $('#btn-editor-cancel').addEventListener('click', () => {
            state.currentEditIndex = -1;
            if (state.pages.length > 0) {
                showScreen('pages');
            } else {
                showScreen('welcome');
            }
        });

        // ---- Editor: Zoom ----
        $('#btn-zoom-in').addEventListener('click', () => {
            state.editor.zoom = Math.min(5, state.editor.zoom + 0.25);
            renderEditor();
            $('#editor-zoom-level').textContent = Math.round(state.editor.zoom * 100) + '%';
        });
        $('#btn-zoom-out').addEventListener('click', () => {
            state.editor.zoom = Math.max(0.25, state.editor.zoom - 0.25);
            renderEditor();
            $('#editor-zoom-level').textContent = Math.round(state.editor.zoom * 100) + '%';
        });
        $('#btn-zoom-fit').addEventListener('click', () => {
            state.editor.zoom = 1;
            fitCanvasToContainer();
            renderEditor();
            $('#editor-zoom-level').textContent = '100%';
        });

        // Mouse wheel zoom on canvas
        $('#editor-canvas-area').addEventListener('wheel', e => {
            if (state.currentScreen !== 'editor') return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            state.editor.zoom = clamp(state.editor.zoom + delta, 0.25, 5);
            renderEditor();
            $('#editor-zoom-level').textContent = Math.round(state.editor.zoom * 100) + '%';
        }, { passive: false });

        // ---- Editor: Canvas Mouse Events (Crop & Perspective) ----
        const canvasEl = $('#editor-canvas');

        canvasEl.addEventListener('mousedown', e => {
            const rect = canvasEl.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Perspective point drag
            if (state.editor.perspectiveActive && state.editor.perspectivePoints) {
                for (let i = 0; i < state.editor.perspectivePoints.length; i++) {
                    const p = state.editor.perspectivePoints[i];
                    if (Math.hypot(x - p.x, y - p.y) < 15) {
                        state.editor.perspectiveDragIndex = i;
                        return;
                    }
                }
            }

            // Crop interactions
            if (state.editor.cropActive && state.editor.cropRect) {
                const handle = getHitHandle(x, y, state.editor.cropRect);
                if (handle) {
                    state.editor.cropDragging = true;
                    state.editor.cropHandle = handle;
                    state.editor.cropStartX = x;
                    state.editor.cropStartY = y;
                    state.editor._cropOrigRect = { ...state.editor.cropRect };
                }
            }
        });

        // mousemove on DOCUMENT so dragging continues even when cursor leaves canvas
        document.addEventListener('mousemove', e => {
            if (state.currentScreen !== 'editor') return;
            // Check if any drag is active before doing expensive calculations
            const isDragging = state.editor.perspectiveDragIndex >= 0 || state.editor.cropDragging;

            const rect = canvasEl.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Perspective drag — allow dragging outside canvas, clamp to bounds
            if (state.editor.perspectiveDragIndex >= 0) {
                state.editor.perspectivePoints[state.editor.perspectiveDragIndex] = {
                    x: clamp(x, 0, canvasEl.width),
                    y: clamp(y, 0, canvasEl.height),
                };
                renderEditor();
                return;
            }

            // Crop drag — allow dragging outside canvas, clamp to bounds
            if (state.editor.cropDragging && state.editor.cropRect) {
                const dx = x - state.editor.cropStartX;
                const dy = y - state.editor.cropStartY;
                const orig = state.editor._cropOrigRect;
                const cr = state.editor.cropRect;
                const cw = canvasEl.width;
                const ch = canvasEl.height;

                if (state.editor.cropHandle === 'move') {
                    cr.x = clamp(orig.x + dx, 0, cw - cr.w);
                    cr.y = clamp(orig.y + dy, 0, ch - cr.h);
                } else {
                    const h = state.editor.cropHandle;
                    let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h;

                    if (h.includes('l')) { newX = orig.x + dx; newW = orig.w - dx; }
                    if (h.includes('r')) { newW = orig.w + dx; }
                    if (h.includes('t')) { newY = orig.y + dy; newH = orig.h - dy; }
                    if (h.includes('b')) { newH = orig.h + dy; }

                    // Maintain aspect if locked
                    if (state.editor.cropAspect && state.editor.cropAspect !== 'free') {
                        let ratio;
                        if (state.editor.cropAspect === '1:1') ratio = 1;
                        else if (state.editor.cropAspect === '4:3') ratio = 4 / 3;
                        else if (state.editor.cropAspect === '16:9') ratio = 16 / 9;
                        else if (state.editor.cropAspect === 'A4') ratio = 210 / 297;

                        if (ratio) {
                            if (h.includes('l') || h.includes('r')) {
                                newH = newW / ratio;
                            } else {
                                newW = newH * ratio;
                            }
                        }
                    }

                    // Minimum size & clamp to canvas
                    if (newW >= 20 && newH >= 20) {
                        cr.x = clamp(newX, 0, cw - 20);
                        cr.y = clamp(newY, 0, ch - 20);
                        cr.w = clamp(newW, 20, cw - cr.x);
                        cr.h = clamp(newH, 20, ch - cr.y);
                    }
                }
                renderEditor();
                return;
            }

            // Update cursor for crop handles (only when mouse is over canvas)
            if (!isDragging && state.editor.cropActive && state.editor.cropRect) {
                if (x >= 0 && x <= canvasEl.width && y >= 0 && y <= canvasEl.height) {
                    const handle = getHitHandle(x, y, state.editor.cropRect);
                    if (handle === 'move') canvasEl.style.cursor = 'move';
                    else if (handle === 'tl' || handle === 'br') canvasEl.style.cursor = 'nw-resize';
                    else if (handle === 'tr' || handle === 'bl') canvasEl.style.cursor = 'ne-resize';
                    else if (handle === 'tc' || handle === 'bc') canvasEl.style.cursor = 'n-resize';
                    else if (handle === 'ml' || handle === 'mr') canvasEl.style.cursor = 'e-resize';
                    else canvasEl.style.cursor = 'crosshair';
                }
            }
        });

        // mouseup on DOCUMENT so drag always ends properly
        document.addEventListener('mouseup', () => {
            state.editor.perspectiveDragIndex = -1;
            state.editor.cropDragging = false;
            state.editor.cropHandle = null;
        });

        // mouseleave on canvas: only update cursor, do NOT reset drag state
        canvasEl.addEventListener('mouseleave', () => {
            // Don't reset drag state — just reset cursor if not dragging
            if (!state.editor.cropDragging && state.editor.perspectiveDragIndex < 0) {
                canvasEl.style.cursor = 'default';
            }
        });

        // Touch events for canvas
        canvasEl.addEventListener('touchstart', e => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvasEl.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            if (state.editor.perspectiveActive && state.editor.perspectivePoints) {
                for (let i = 0; i < state.editor.perspectivePoints.length; i++) {
                    const p = state.editor.perspectivePoints[i];
                    if (Math.hypot(x - p.x, y - p.y) < 25) {
                        state.editor.perspectiveDragIndex = i;
                        return;
                    }
                }
            }

            if (state.editor.cropActive && state.editor.cropRect) {
                const handle = getHitHandle(x, y, state.editor.cropRect);
                if (handle) {
                    state.editor.cropDragging = true;
                    state.editor.cropHandle = handle;
                    state.editor.cropStartX = x;
                    state.editor.cropStartY = y;
                    state.editor._cropOrigRect = { ...state.editor.cropRect };
                }
            }
        }, { passive: false });

        // touchmove on DOCUMENT so dragging continues outside canvas
        document.addEventListener('touchmove', e => {
            if (state.currentScreen !== 'editor') return;
            if (state.editor.perspectiveDragIndex < 0 && !state.editor.cropDragging) return;

            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvasEl.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            if (state.editor.perspectiveDragIndex >= 0) {
                state.editor.perspectivePoints[state.editor.perspectiveDragIndex] = {
                    x: clamp(x, 0, canvasEl.width),
                    y: clamp(y, 0, canvasEl.height),
                };
                renderEditor();
                return;
            }

            if (state.editor.cropDragging && state.editor.cropRect) {
                const dx = x - state.editor.cropStartX;
                const dy = y - state.editor.cropStartY;
                const orig = state.editor._cropOrigRect;
                const cr = state.editor.cropRect;
                const cw = canvasEl.width;
                const ch = canvasEl.height;

                if (state.editor.cropHandle === 'move') {
                    cr.x = clamp(orig.x + dx, 0, cw - cr.w);
                    cr.y = clamp(orig.y + dy, 0, ch - cr.h);
                } else {
                    const h = state.editor.cropHandle;
                    let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h;

                    if (h.includes('l')) { newX = orig.x + dx; newW = orig.w - dx; }
                    if (h.includes('r')) { newW = orig.w + dx; }
                    if (h.includes('t')) { newY = orig.y + dy; newH = orig.h - dy; }
                    if (h.includes('b')) { newH = orig.h + dy; }

                    if (state.editor.cropAspect && state.editor.cropAspect !== 'free') {
                        let ratio;
                        if (state.editor.cropAspect === '1:1') ratio = 1;
                        else if (state.editor.cropAspect === '4:3') ratio = 4 / 3;
                        else if (state.editor.cropAspect === '16:9') ratio = 16 / 9;
                        else if (state.editor.cropAspect === 'A4') ratio = 210 / 297;

                        if (ratio) {
                            if (h.includes('l') || h.includes('r')) newH = newW / ratio;
                            else newW = newH * ratio;
                        }
                    }

                    if (newW >= 20 && newH >= 20) {
                        cr.x = clamp(newX, 0, cw - 20);
                        cr.y = clamp(newY, 0, ch - 20);
                        cr.w = clamp(newW, 20, cw - cr.x);
                        cr.h = clamp(newH, 20, ch - cr.y);
                    }
                }
                renderEditor();
            }
        }, { passive: false });

        // touchend on DOCUMENT
        document.addEventListener('touchend', () => {
            state.editor.perspectiveDragIndex = -1;
            state.editor.cropDragging = false;
            state.editor.cropHandle = null;
        });

        // ---- Editor: Section toggles (accordion) ----
        $$('.tool-section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.tool-section').classList.toggle('collapsed');
            });
        });

        // ---- Pages Screen ----
        $('#btn-pages-add-file').addEventListener('click', () => $('#file-input-images-add').click());
        $('#btn-pages-add-camera').addEventListener('click', startCamera);
        $('#btn-pages-select-all').addEventListener('click', selectAllPages);
        $('#btn-pages-delete-selected').addEventListener('click', deleteSelectedPages);

        $('#file-input-images-add').addEventListener('change', e => {
            if (e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = '';
        });

        // ---- Header Buttons ----
        $('#btn-add-more').addEventListener('click', () => $('#file-input-images-add').click());
        $('#btn-settings').addEventListener('click', showSettingsModal);
        $('#btn-generate-pdf').addEventListener('click', showSettingsModal);

        // ---- Modal ----
        $('#btn-modal-close').addEventListener('click', closeModal);
        $('#btn-modal-cancel').addEventListener('click', closeModal);
        $('#btn-modal-save').addEventListener('click', generatePDF);
        $('#modal-overlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });

        // Page size change → show/hide custom inputs
        $('#opt-page-size').addEventListener('change', e => {
            $('#custom-size-group').style.display = e.target.value === 'custom' ? '' : 'none';
        });

        // Radio group styling for modal
        $$('#modal-overlay .radio-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const group = opt.closest('.radio-group');
                group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                opt.querySelector('input').checked = true;
            });
        });

        // ---- Keyboard Shortcuts ----
        document.addEventListener('keydown', e => {
            // Escape
            if (e.key === 'Escape') {
                if ($('#modal-overlay').style.display !== 'none') {
                    closeModal();
                } else if (state.currentScreen === 'editor') {
                    if (state.editor.cropActive) cancelCrop();
                    else if (state.editor.perspectiveActive) togglePerspective();
                } else if (state.currentScreen === 'camera') {
                    goBackFromCamera();
                }
            }

            // Delete selected pages
            if (e.key === 'Delete' && state.currentScreen === 'pages') {
                deleteSelectedPages();
            }

            // Ctrl+A select all
            if (e.key === 'a' && (e.ctrlKey || e.metaKey) && state.currentScreen === 'pages') {
                e.preventDefault();
                selectAllPages();
            }
        });

        // ---- Window Resize ----
        window.addEventListener('resize', () => {
            if (state.currentScreen === 'editor' && state.editor.image) {
                fitCanvasToContainer();
                renderEditor();
            }
        });

        // Warn before leaving if pages exist
        window.addEventListener('beforeunload', e => {
            if (state.pages.length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // ---- Show welcome screen ----
        showScreen('welcome');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
