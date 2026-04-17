(function () {
    var uploadedFiles = [];
    var currentStep = 1;
    var zoomRatios = [0.20, 0.38, 0.25, 0.46];
    var insetRect = [0.58, 0.55, 0.40, 0.40];
    var lineConfig = { l1r: 0, l1i: 0, l2r: 3, l2i: 3 };
    var canvasImg = null;
    var isDragging = false;
    var dragStart = { x: 0, y: 0 };
    var imageReady = false;

    var panels = [1, 2, 3, 4].map(function (i) { return document.getElementById('panel-' + i); });
    var stepEls = document.querySelectorAll('.step');

    function showStep(n) {
        currentStep = n;
        panels.forEach(function (p, i) { p.classList.toggle('hidden', i !== n - 1); });
        stepEls.forEach(function (s, i) {
            s.classList.remove('active', 'done');
            if (i < n - 1) s.classList.add('done');
            if (i === n - 1) s.classList.add('active');
        });
        // 关键修复：用 setTimeout 让出主线程，等浏览器完成 Layout/Reflow
        if (n === 2) {
            if (imageReady) { setTimeout(drawZoomCanvas, 50); }
            else { loadFirstImage(function () { setTimeout(drawZoomCanvas, 50); }); }
        }
        if (n === 3) { ensureImage(function () { setTimeout(drawInsetPreview, 50); }); }
        if (n === 4) { ensureImage(function () { setTimeout(drawLinePreview, 50); }); }
    }

    function loadFirstImage(cb) {
        if (!uploadedFiles.length) return;
        var img = new Image();
        img.onload = function () {
            canvasImg = img;
            imageReady = true;
            if (cb) cb();
        };
        img.onerror = function () {
            var img2 = new Image();
            img2.onload = function () {
                canvasImg = img2;
                imageReady = true;
                if (cb) cb();
            };
            img2.src = uploadedFiles[0].url + '?t=' + Date.now();
        };
        img.src = uploadedFiles[0].url + '?t=' + Date.now();
    }

    function ensureImage(cb) {
        if (imageReady && canvasImg) { cb(); }
        else { loadFirstImage(cb); }
    }

    // 关键修复：setupCanvas 增加边界保护，永远不会返回负数或0
    function setupCanvas(canvas) {
        if (!canvasImg) return { w: 0, h: 0 };
        var parentW = canvas.parentElement.clientWidth || 880;
        var maxW = Math.max(10, Math.min(880, parentW - 20));
        var scale = Math.min(maxW / canvasImg.width, 1);
        var cw = Math.max(10, Math.floor(canvasImg.width * scale));
        var ch = Math.max(10, Math.floor(canvasImg.height * scale));
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        return { w: cw, h: ch };
    }

    /* ═══════ 第1步: 上传 ═══════ */
    var uploadArea = document.getElementById('upload-area');
    var fileInput = document.getElementById('file-input');
    var fileList = document.getElementById('file-list');
    var btnNext1 = document.getElementById('btn-next-1');

    uploadArea.addEventListener('click', function () { fileInput.click(); });
    uploadArea.addEventListener('dragover', function (e) { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', function () { uploadArea.classList.remove('drag-over'); });
    uploadArea.addEventListener('drop', function (e) { e.preventDefault(); uploadArea.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); });

    function handleFiles(files) {
        var formData = new FormData();
        for (var i = 0; i < files.length; i++) formData.append('files', files[i]);
        uploadArea.innerHTML = '<p class="loading">上传中...</p>';
        fetch('/upload', { method: 'POST', body: formData })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                uploadArea.innerHTML = '<div class="upload-icon">📁</div><p>点击或拖拽继续添加</p>';
                if (data.files) { uploadedFiles = uploadedFiles.concat(data.files); renderFileList(); }
            })
            .catch(function () { uploadArea.innerHTML = '<div class="upload-icon">📁</div><p>上传失败，请重试</p>'; });
    }

    function renderFileList() {
        fileList.innerHTML = uploadedFiles.map(function (f, i) {
            return '<div class="file-item"><span>' + f.filename + ' (' + f.width + 'x' + f.height + ')</span><span class="remove-btn" data-idx="' + i + '">✕</span></div>';
        }).join('');
        fileList.querySelectorAll('.remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { uploadedFiles.splice(parseInt(btn.dataset.idx), 1); renderFileList(); });
        });
        btnNext1.disabled = uploadedFiles.length === 0;
    }

    btnNext1.addEventListener('click', function () { if (uploadedFiles.length > 0) showStep(2); });

    /* ═══════ 第2步: 缩放区域框选 ═══════ */
    var zoomCanvas = document.getElementById('zoom-canvas');
    var zctx = zoomCanvas.getContext('2d');
    var ratioDisplay = document.getElementById('ratio-display');
    var numInputs = {
        xmin: document.getElementById('xmin'), xmax: document.getElementById('xmax'),
        ymin: document.getElementById('ymin'), ymax: document.getElementById('ymax')
    };

    function drawZoomCanvas() {
        if (!canvasImg) return;
        var size = setupCanvas(zoomCanvas);
        var w = size.w, h = size.h;
        if (w < 10) return;

        zctx.clearRect(0, 0, w, h);
        zctx.drawImage(canvasImg, 0, 0, w, h);

        zctx.strokeStyle = 'rgba(0,255,0,0.3)';
        zctx.lineWidth = 0.5;
        for (var r = 0.1; r < 1; r += 0.1) {
            zctx.beginPath();
            zctx.moveTo(r * w, 0); zctx.lineTo(r * w, h);
            zctx.moveTo(0, r * h); zctx.lineTo(w, r * h);
            zctx.stroke();
        }

        var x1 = zoomRatios[0] * w, x2 = zoomRatios[1] * w;
        var y1 = zoomRatios[2] * h, y2 = zoomRatios[3] * h;
        zctx.strokeStyle = 'red';
        zctx.lineWidth = 2;
        zctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        zctx.fillStyle = 'rgba(255,0,0,0.15)';
        zctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        ratioDisplay.textContent = 'x(' + zoomRatios[0].toFixed(2) + ' ~ ' + zoomRatios[1].toFixed(2) + ')  y(' + zoomRatios[2].toFixed(2) + ' ~ ' + zoomRatios[3].toFixed(2) + ')';
    }

    zoomCanvas.addEventListener('mousedown', function (e) {
        isDragging = true;
        var r = zoomCanvas.getBoundingClientRect();
        dragStart.x = e.clientX - r.left;
        dragStart.y = e.clientY - r.top;
    });
    zoomCanvas.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var r = zoomCanvas.getBoundingClientRect();
        var mx = e.clientX - r.left, my = e.clientY - r.top;
        var w = zoomCanvas.width, h = zoomCanvas.height;
        zoomRatios[0] = Math.max(0, Math.min(dragStart.x, mx) / w);
        zoomRatios[1] = Math.min(1, Math.max(dragStart.x, mx) / w);
        zoomRatios[2] = Math.max(0, Math.min(dragStart.y, my) / h);
        zoomRatios[3] = Math.min(1, Math.max(dragStart.y, my) / h);
        syncInputs();
        drawZoomCanvas();
    });
    window.addEventListener('mouseup', function () { isDragging = false; });

    function syncInputs() {
        numInputs.xmin.value = zoomRatios[0].toFixed(2);
        numInputs.xmax.value = zoomRatios[1].toFixed(2);
        numInputs.ymin.value = zoomRatios[2].toFixed(2);
        numInputs.ymax.value = zoomRatios[3].toFixed(2);
    }
    Object.keys(numInputs).forEach(function (key) {
        numInputs[key].addEventListener('input', function () {
            var idx = { xmin: 0, xmax: 1, ymin: 2, ymax: 3 }[key];
            zoomRatios[idx] = parseFloat(numInputs[key].value) || 0;
            drawZoomCanvas();
        });
    });

    /* ═══════ 第3步: 放大镜实时预览 ═══════ */
    var insetCanvas = document.getElementById('inset-canvas');
    var ictx = insetCanvas.getContext('2d');
    var sliders = {
        left: document.getElementById('inset-left'), bottom: document.getElementById('inset-bottom'),
        width: document.getElementById('inset-width'), height: document.getElementById('inset-height')
    };
    var sliderVals = {
        left: document.getElementById('val-left'), bottom: document.getElementById('val-bottom'),
        width: document.getElementById('val-width'), height: document.getElementById('val-height')
    };

    function drawInsetPreview() {
        if (!canvasImg) return;
        var size = setupCanvas(insetCanvas);
        var w = size.w, h = size.h;
        if (w < 10) return;

        ictx.clearRect(0, 0, w, h);
        ictx.drawImage(canvasImg, 0, 0, w, h);

        // 缩放框
        var zx1 = zoomRatios[0] * w, zx2 = zoomRatios[1] * w;
        var zy1 = zoomRatios[2] * h, zy2 = zoomRatios[3] * h;
        ictx.strokeStyle = 'red';
        ictx.lineWidth = 2;
        ictx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1);
        ictx.fillStyle = 'rgba(255,0,0,0.1)';
        ictx.fillRect(zx1, zy1, zx2 - zx1, zy2 - zy1);

        // 放大镜 (axes坐标转canvas像素)
        var il = insetRect[0], ib = insetRect[1], iw = insetRect[2], ih = insetRect[3];
        var ix = il * w;
        var iy = (1 - ib - ih) * h;
        var ixw = iw * w;
        var iyh = ih * h;

        // 黑底
        ictx.fillStyle = 'rgba(0,0,0,0.6)';
        ictx.fillRect(ix, iy, ixw, iyh);

        // 放大的图像
        var srcX = zoomRatios[0] * canvasImg.width;
        var srcY = zoomRatios[2] * canvasImg.height;
        var srcW = (zoomRatios[1] - zoomRatios[0]) * canvasImg.width;
        var srcH = (zoomRatios[3] - zoomRatios[2]) * canvasImg.height;
        if (srcW > 1 && srcH > 1) {
            ictx.drawImage(canvasImg, srcX, srcY, srcW, srcH, ix, iy, ixw, iyh);
        }

        // 红色边框
        ictx.strokeStyle = 'red';
        ictx.lineWidth = 3;
        ictx.strokeRect(ix, iy, ixw, iyh);

        // 标签
        ictx.fillStyle = 'rgba(0,0,0,0.8)';
        ictx.fillRect(ix, iy, 60, 20);
        ictx.fillStyle = '#ff4444';
        ictx.font = 'bold 12px sans-serif';
        ictx.textAlign = 'left';
        ictx.textBaseline = 'top';
        ictx.fillText('放大镜', ix + 4, iy + 4);

        // 尺寸标注
        var sizeText = iw.toFixed(2) + ' x ' + ih.toFixed(2) + '  (' + Math.round(ixw) + 'x' + Math.round(iyh) + 'px)';
        var tw = ictx.measureText(sizeText).width + 10;
        ictx.fillStyle = 'rgba(0,0,0,0.8)';
        ictx.fillRect(ix, iy + iyh + 2, tw, 18);
        ictx.fillStyle = '#fff';
        ictx.font = '11px monospace';
        ictx.fillText(sizeText, ix + 4, iy + iyh + 5);

        ictx.textAlign = 'left';
        ictx.textBaseline = 'alphabetic';
    }

    Object.keys(sliders).forEach(function (key) {
        sliders[key].addEventListener('input', function () {
            var idx = { left: 0, bottom: 1, width: 2, height: 3 }[key];
            insetRect[idx] = parseFloat(sliders[key].value);
            sliderVals[key].textContent = parseFloat(sliders[key].value).toFixed(2);
            drawInsetPreview();
        });
    });

    document.querySelectorAll('.preset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.preset-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var vals = btn.dataset.pos.split(',').map(Number);
            insetRect = [vals[0], vals[1], vals[2], vals[3]];
            sliders.left.value = vals[0]; sliderVals.left.textContent = vals[0].toFixed(2);
            sliders.bottom.value = vals[1]; sliderVals.bottom.textContent = vals[1].toFixed(2);
            sliders.width.value = vals[2]; sliderVals.width.textContent = vals[2].toFixed(2);
            sliders.height.value = vals[3]; sliderVals.height.textContent = vals[3].toFixed(2);
            drawInsetPreview();
        });
    });

    /* ═══════ 第4步: 连接线实时预览 ═══════ */
    var lineCanvas = document.getElementById('line-canvas');
    var lctx = lineCanvas.getContext('2d');

    function getRCorner(idx, zx1, zy1, zx2, zy2) {
        return { 0: [zx1, zy1], 1: [zx2, zy1], 2: [zx2, zy2], 3: [zx1, zy2] }[idx];
    }
    function getICorner(idx, ix, iy, ixw, iyh) {
        return { 0: [ix, iy], 1: [ix + ixw, iy], 2: [ix + ixw, iy + iyh], 3: [ix, iy + iyh] }[idx];
    }

    function drawLinePreview() {
        if (!canvasImg) return;
        var size = setupCanvas(lineCanvas);
        var w = size.w, h = size.h;
        if (w < 10) return;

        lctx.clearRect(0, 0, w, h);
        lctx.drawImage(canvasImg, 0, 0, w, h);

        // 缩放框
        var zx1 = zoomRatios[0] * w, zx2 = zoomRatios[1] * w;
        var zy1 = zoomRatios[2] * h, zy2 = zoomRatios[3] * h;
        lctx.strokeStyle = 'red';
        lctx.lineWidth = 2;
        lctx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1);

        // 放大镜
        var il = insetRect[0], ib = insetRect[1], iw = insetRect[2], ih = insetRect[3];
        var ix = il * w;
        var iy = (1 - ib - ih) * h;
        var ixw = iw * w;
        var iyh = ih * h;

        // 放大图像
        var srcX = zoomRatios[0] * canvasImg.width;
        var srcY = zoomRatios[2] * canvasImg.height;
        var srcW = (zoomRatios[1] - zoomRatios[0]) * canvasImg.width;
        var srcH = (zoomRatios[3] - zoomRatios[2]) * canvasImg.height;
        if (srcW > 1 && srcH > 1) {
            lctx.drawImage(canvasImg, srcX, srcY, srcW, srcH, ix, iy, ixw, iyh);
        }
        lctx.strokeStyle = 'red';
        lctx.lineWidth = 3;
        lctx.strokeRect(ix, iy, ixw, iyh);

        // 连接线
        var lineColor = document.getElementById('line-color').value;
        var lineW = parseInt(document.getElementById('line-width-val').value) || 2;
        var lineSt = document.getElementById('line-style-sel').value;

        var pairs = [
            { r: lineConfig.l1r, i: lineConfig.l1i },
            { r: lineConfig.l2r, i: lineConfig.l2i }
        ];

        pairs.forEach(function (ln) {
            var ptR = getRCorner(ln.r, zx1, zy1, zx2, zy2);
            var ptI = getICorner(ln.i, ix, iy, ixw, iyh);

            lctx.save();
            lctx.strokeStyle = lineColor;
            lctx.lineWidth = lineW;
            if (lineSt === '--') lctx.setLineDash([10, 6]);
            else if (lineSt === ':') lctx.setLineDash([3, 4]);
            else if (lineSt === '-.') lctx.setLineDash([10, 4, 3, 4]);
            else lctx.setLineDash([]);

            lctx.beginPath();
            lctx.moveTo(ptR[0], ptR[1]);
            lctx.lineTo(ptI[0], ptI[1]);
            lctx.stroke();
            lctx.restore();

            // 连线中点标注
            var midX = (ptR[0] + ptI[0]) / 2;
            var midY = (ptR[1] + ptI[1]) / 2;
            lctx.fillStyle = 'rgba(0,0,0,0.85)';
            lctx.fillRect(midX - 34, midY - 9, 68, 18);
            lctx.fillStyle = '#fff';
            lctx.font = 'bold 11px monospace';
            lctx.textAlign = 'center';
            lctx.textBaseline = 'middle';
            lctx.fillText('R' + ln.r + ' -> I' + ln.i, midX, midY);
        });

        // 缩放框角点 (黄色)
        [0, 1, 2, 3].forEach(function (idx) {
            var pt = getRCorner(idx, zx1, zy1, zx2, zy2);
            lctx.fillStyle = '#ffff00';
            lctx.beginPath(); lctx.arc(pt[0], pt[1], 7, 0, Math.PI * 2); lctx.fill();
            lctx.strokeStyle = '#000'; lctx.lineWidth = 1.5; lctx.stroke();
            lctx.fillStyle = '#000';
            lctx.font = 'bold 11px sans-serif';
            lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
            lctx.fillText('' + idx, pt[0], pt[1]);
        });

        // 放大镜角点 (青色)
        [0, 1, 2, 3].forEach(function (idx) {
            var pt = getICorner(idx, ix, iy, ixw, iyh);
            lctx.fillStyle = '#00ffff';
            lctx.beginPath(); lctx.arc(pt[0], pt[1], 7, 0, Math.PI * 2); lctx.fill();
            lctx.strokeStyle = '#000'; lctx.lineWidth = 1.5; lctx.stroke();
            lctx.fillStyle = '#000';
            lctx.font = 'bold 11px sans-serif';
            lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
            lctx.fillText('' + idx, pt[0], pt[1]);
        });

        // 重置文本对齐
        lctx.textAlign = 'left';
        lctx.textBaseline = 'alphabetic';
    }

    document.querySelectorAll('.line-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.line-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var v = btn.dataset.lines.split(',').map(Number);
            lineConfig = { l1r: v[0], l1i: v[1], l2r: v[2], l2i: v[3] };
            drawLinePreview();
        });
    });

    document.getElementById('line-color').addEventListener('input', function () { drawLinePreview(); });
    document.getElementById('line-width-val').addEventListener('input', function () { drawLinePreview(); });
    document.getElementById('line-style-sel').addEventListener('change', function () { drawLinePreview(); });

    /* ═══════ 后端交互 ═══════ */
    function buildConfig() {
        return {
            zoom_ratios: zoomRatios,
            inset_rect: insetRect,
            lines: [
                { rect: lineConfig.l1r, ins: lineConfig.l1i },
                { rect: lineConfig.l2r, ins: lineConfig.l2i }
            ],
            line_color: document.getElementById('line-color').value,
            line_width: parseInt(document.getElementById('line-width-val').value),
            line_style: document.getElementById('line-style-sel').value,
            rect_color: document.getElementById('line-color').value,
            border_color: document.getElementById('line-color').value,
            rect_width: 2, border_width: 2
        };
    }

    document.getElementById('btn-preview').addEventListener('click', function () {
        var box = document.getElementById('preview-box');
        box.innerHTML = '<p class="loading">后端渲染中...</p>';
        fetch('/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: uploadedFiles[0].filename, config: buildConfig() })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) { box.innerHTML = '<img src="' + data.url + '?t=' + Date.now() + '">'; })
        .catch(function () { box.innerHTML = '<p class="loading">预览失败</p>'; });
    });

    document.getElementById('btn-batch').addEventListener('click', function () {
        var bar = document.getElementById('progress-bar');
        var fill = document.getElementById('progress-fill');
        var res = document.getElementById('results');
        var list = document.getElementById('result-list');
        bar.classList.remove('hidden'); fill.style.width = '30%'; res.classList.add('hidden');
        fetch('/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames: uploadedFiles.map(function (f) { return f.filename; }), config: buildConfig() })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            fill.style.width = '100%';
            setTimeout(function () {
                bar.classList.add('hidden'); res.classList.remove('hidden');
                list.innerHTML = data.results.map(function (r) {
                    return '<div class="result-item"><img src="' + r.url + '?t=' + Date.now() + '"><p>' + r.filename + '</p></div>';
                }).join('');
            }, 500);
        })
        .catch(function () { fill.style.width = '0%'; alert('处理失败'); });
    });

    document.getElementById('btn-download-all').addEventListener('click', function () {
        var items = document.querySelectorAll('.result-item p');
        var fns = Array.from(items).map(function (p) { return p.textContent; });
        fetch('/download_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames: fns })
        })
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'zoomed_images.zip'; a.click();
            URL.revokeObjectURL(url);
        });
    });

    /* ═══════ 导航 ═══════ */
    document.getElementById('btn-next-2').addEventListener('click', function () { showStep(3); });
    document.getElementById('btn-next-3').addEventListener('click', function () { showStep(4); });
    document.getElementById('btn-prev-2').addEventListener('click', function () { showStep(1); });
    document.getElementById('btn-prev-3').addEventListener('click', function () { showStep(2); });
    document.getElementById('btn-prev-4').addEventListener('click', function () { showStep(3); });

    syncInputs();
})();
