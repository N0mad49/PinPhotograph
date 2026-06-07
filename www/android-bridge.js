/**
 * android-bridge.js — Capacitor/Android WebView 适配
 * 覆盖 index.html 中在浏览器正常但在 WebView 不生效的行为。
 */
(function () {
    if (!window.Capacitor || !window.Capacitor.isNative) return;

    /* ===================== 1. 文件选择 =====================
     * 问题：Android WebView 禁止对 display:none 的 <input type="file">
     *       调用 .click()。必须让用户真实触摸到 file input 才行。
     * 方案：在按钮上方叠加一个透明 file input，接收真实触摸。     */
    function setupFileOverlays() {
        var configs = [
            { btnId: 'btn-select-images', inputId: 'file-input', replace: true },
            { btnId: 'btn-add-images',    inputId: 'add-file-input', replace: false },
            { btnId: 'btn-select-custom-bg', inputId: 'custom-bg-input', replace: false }
        ];

        configs.forEach(function (cfg) {
            var btn = document.getElementById(cfg.btnId);
            if (!btn) return;

            // 令按钮可定位
            if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
            btn.style.overflow = 'hidden';

            // 新建透明 file input，盖在按钮上方
            var input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'image/*';
            input.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;z-index:10';

            // 阻止 click 冒泡到按钮（避免按钮 .click() 二次触发）
            input.addEventListener('click', function (e) { e.stopPropagation(); });

            // 选中图片后转发给 handleFiles
            input.addEventListener('change', function (e) {
                handleFiles(e, cfg.replace);
                // 重置以便再次选择同一文件
                this.value = '';
            });

            btn.appendChild(input);
        });
    }

    /* ===================== 2. 保存照片 =====================
     * 用 NativeBridge（Java 端）把 base64 写进系统相册。     */
    function patchHandleSave() {
        if (!window.NativeBridge) return;
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
            var ok = window.NativeBridge.saveImage(base64, 'PinPhotograph-' + ts + '.jpg');
            showToast(ok ? '已保存到相册' : '保存失败', !ok);
            requestRender();
            toggleLoading(false);
        };
    }

    /* ===================== 启动 ===================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupFileOverlays);
    } else {
        setupFileOverlays();
    }
    // handleSave 在 index.html 的主 script 中定义，等页面加载完再覆盖
    window.addEventListener('load', patchHandleSave);
})();
