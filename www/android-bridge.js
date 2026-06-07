/**
 * android-bridge.js — Capacitor/Android WebView 适配
 *
 * 覆盖 index.html 中在浏览器正常但在 WebView 不生效的行为。
 * 使用 Java 端 NativeBridge 绕过 WebView 的 file input 限制。
 */
(function () {
    if (!window.Capacitor || !window.Capacitor.isNative) return;
    if (!window.NativeBridge) return;

    /* ===================== 1. 文件选择 =====================
     * Android WebView 禁止程序化 .click() 打开文件选择器。
     * 通过 NativeBridge.pickImages() 调用原生 Intent。    */
    (function setupNativeFilePicker() {
        var pendingId = 0;

        window.__nativeFileResult = function (callbackId, files) {
            // 找到对应的回调
            var cb = window['__fileCb_' + callbackId];
            if (cb) { cb(files); delete window['__fileCb_' + callbackId]; }
        };

        function openPicker(replace) {
            var id = 'p' + (++pendingId);
            return new Promise(function (resolve) {
                window['__fileCb_' + id] = resolve;
                NativeBridge.pickImages(id);
            });
        }

        // 拦截 handleFiles — 改为使用原生 picker
        var origHandleFiles = window.handleFiles;
        window.handleFiles = async function (e, replace) {
            var files = await openPicker(replace);
            if (!files || files.length === 0) return;

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

            // 构造与原始 handleFiles 相同的 wrappedImages
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
        };
    })();

    /* ===================== 2. 保存照片 ===================== */
    (function patchHandleSave() {
        var orig = window.handleSave;
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
    })();
})();
