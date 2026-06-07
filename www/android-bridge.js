/**
 * android-bridge.js — Capacitor/Android WebView 适配
 * 绕过 WebView 的 file input 限制，使用原生 Java 文件选择器。
 */
(function () {
    if (!window.Capacitor || !window.Capacitor.isNative) return;
    if (!window.NativeBridge) return;

    var pendingId = 0;

    window.__nativeFileResult = function (callbackId, files) {
        var cb = window['__fcb_' + callbackId];
        if (cb) { cb(files); delete window['__fcb_' + callbackId]; }
    };

    function openPicker() {
        var id = 'p' + (++pendingId);
        return new Promise(function (resolve) {
            window['__fcb_' + id] = resolve;
            NativeBridge.pickImages(id);
        });
    }

    /** 原生 picker 返回后，走跟原始 handleFiles 相同的处理逻辑 */
    async function nativeHandleFiles(replace) {
        toggleLoading(true);
        var files = await openPicker();
        if (!files || files.length === 0) {
            toggleLoading(false);
            return;
        }

        var loaded = [];
        for (var i = 0; i < files.length; i++) {
            var img = new Image();
            await new Promise(function (resolve, reject) {
                img.onload = resolve;
                img.onerror = reject;
                img.src = files[i].data;
            });
            loaded.push(img);
        }

        var wrapped = [];
        for (var i = 0; i < loaded.length; i++) {
            var thumb = null;
            try {
                if (window.createImageBitmap) {
                    thumb = await createImageBitmap(loaded[i], 0, 0, loaded[i].width, loaded[i].height, {
                        resizeWidth: 80, resizeHeight: 80, resizeQuality: 'medium'
                    });
                }
            } catch (_) {}
            if (!thumb) {
                var tc = document.createElement('canvas');
                tc.width = 80; tc.height = 80;
                var tctx = tc.getContext('2d');
                var s = Math.min(loaded[i].width, loaded[i].height);
                tctx.drawImage(loaded[i], (loaded[i].width - s) / 2, (loaded[i].height - s) / 2, s, s, 0, 0, 80, 80);
                thumb = tc;
            }
            wrapped.push({
                img: loaded[i],
                thumbnail: thumb,
                width: loaded[i].width,
                height: loaded[i].height,
                edit: { sat: 100, bri: 0, con: 100 },
                free: { x: 0, y: 0, w: 0, h: 0 }
            });
            await new Promise(function (r) { return setTimeout(r, 10); });
        }

        if (replace) {
            originalImageObjects = wrapped;
        } else {
            originalImageObjects = [].concat(originalImageObjects, wrapped);
        }

        recalculateDimensions();
        inputs.imgCount.innerText = originalImageObjects.length;
        renderImageList();
        generateStitchedBase();

        if (replace) {
            document.getElementById('home-screen').classList.remove('active');
            document.getElementById('editor-screen').classList.add('active');
        }

        requestRender();
        toggleLoading(false);
        inputs.file.value = '';
        inputs.addFile.value = '';
    }

    /* ===================== 替换按钮处理器 ===================== */
    document.addEventListener('DOMContentLoaded', function () {
        // 选择图片 → 覆盖全部按钮
        var selectBtn = document.getElementById('btn-select-images');
        if (selectBtn) {
            var clone = selectBtn.cloneNode(true);
            selectBtn.parentNode.replaceChild(clone, selectBtn);
            clone.addEventListener('click', function () { nativeHandleFiles(true); });
        }

        // 添加图片
        var addBtn = document.getElementById('btn-add-images');
        if (addBtn) {
            var clone2 = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(clone2, addBtn);
            clone2.addEventListener('click', function () { nativeHandleFiles(false); });
        }

        // 更换背景图片
        var customBgBtn = document.getElementById('btn-select-custom-bg');
        if (customBgBtn) {
            var clone4 = customBgBtn.cloneNode(true);
            customBgBtn.parentNode.replaceChild(clone4, customBgBtn);
            clone4.addEventListener('click', function () { nativeHandleFiles(false); });
        }

        // 重新选图（编辑器右上角）
        var backBtn = document.getElementById('btn-back-home');
        if (backBtn) {
            var clone3 = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(clone3, backBtn);
            clone3.addEventListener('click', function (e) {
                e.preventDefault();
                nativeHandleFiles(true);
            });
        }
    });

    /* ===================== 保存照片 ===================== */
    window.addEventListener('load', function () {
        var origSave = window.handleSave;
        window.handleSave = async function () {
            if (!selectedImages.length) return;
            toggleLoading(true);
            await new Promise(function (r) { return setTimeout(r, 50); });
            renderPreview(true);
            var canvas = inputs.previewCanvas;
            var quality = Math.max(0.1, Math.min(1.0, appState.exportQuality / 100));
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            var now = new Date();
            var ts = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
            var base64 = dataUrl.split(',')[1];
            var ok = NativeBridge.saveImage(base64, 'PinPhotograph-' + ts + '.jpg');
            showToast(ok ? '已保存到相册' : '保存失败', !ok);
            requestRender();
            toggleLoading(false);
        };
    });
})();
