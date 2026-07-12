(function () {
    var cs = new CSInterface();
    var host = null;

    var seqNameEl = document.getElementById('seqName');
    var seqRefresh = document.getElementById('seqRefresh');
    var fpsSel = document.getElementById('fps');
    var dataEl = document.getElementById('data');
    var dataClear = document.getElementById('dataClear');
    var offsetEl = document.getElementById('offset');
    var colorEl = document.getElementById('color');
    var clearEl = document.getElementById('clearFirst');
    var runBtn = document.getElementById('runBtn');
    var resetBtn = document.getElementById('resetBtn');
    var resultEl = document.getElementById('result');
    var logEl = document.getElementById('log');
    var logClear = document.getElementById('logClear');
    var listRefresh = document.getElementById('listRefresh');
    var markerListEl = document.getElementById('markerList');
    var filtBtns = document.querySelectorAll('.filt');
    var curFilter = 'all';
    var allMarkers = [];

    function log(msg) {
        var t = new Date().toTimeString().slice(0, 8);
        logEl.textContent += '[' + t + '] ' + msg + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }
    logClear.addEventListener('click', function () { logEl.textContent = ''; });

    // hostscript.jsx を読み込み
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'js/hostscript.jsx', true);
    xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) { host = xhr.responseText; log('hostscript ロード完了'); refreshSeq(); loadMarkers(); applyPresetOffset(); }
        else { showErr('hostscript.jsx ロード失敗'); }
    };
    xhr.onerror = function () { showErr('hostscript.jsx 読み込みエラー'); };
    xhr.send();

    // フレームレート別の微調整プリセット（30/29.97系→10、59.94/60系→30、他→0）
    function presetOffset(nominal) {
        if (nominal === 30) { return 10; }
        if (nominal === 60) { return 30; }
        return 0;
    }

    function applyPresetOffset() {
        var mode = fpsSel.value;
        if (mode === 'auto') {
            if (!host) { return; }
            evalHost('getSeqInfo()', function (res) {
                var d = {};
                try { d = JSON.parse(res); } catch (e) { return; }
                if (d.error || !d.fps) { return; }
                var nom = Math.round(d.fps);
                offsetEl.value = presetOffset(nom);
                log('自動fps=' + d.fps.toFixed(2) + ' → 微調整 ' + offsetEl.value + 'f をセット');
            });
        } else {
            var conf = fpsConf(mode);
            offsetEl.value = presetOffset(conf.nominal);
            log(mode + ' → 微調整 ' + offsetEl.value + 'f をセット');
        }
    }

    fpsSel.addEventListener('change', applyPresetOffset);

    seqRefresh.addEventListener('click', function () { refreshSeq(); loadMarkers(); });
    runBtn.addEventListener('click', run);
    resetBtn.addEventListener('click', resetMarkers);
    listRefresh.addEventListener('click', loadMarkers);
    dataClear.addEventListener('click', function () { dataEl.value = ''; dataEl.focus(); });

    for (var b = 0; b < filtBtns.length; b++) {
        (function (btn) {
            btn.addEventListener('click', function () {
                curFilter = btn.getAttribute('data-filter');
                for (var j = 0; j < filtBtns.length; j++) { filtBtns[j].className = 'filt'; }
                btn.className = 'filt active';
                renderList();
            });
        })(filtBtns[b]);
    }

    function resetMarkers() {
        if (!host) { showErr('ホストスクリプト未ロード'); return; }
        log('--- リセット（校正マーカー削除）---');
        evalHost('clearKoseiMarkers()', function (res) {
            log('clearKoseiMarkers → ' + res);
            var d = {};
            try { d = JSON.parse(res); } catch (e) { showErr('リセット: 応答パース失敗\n' + res); return; }
            if (d.error) { showErr(d.error); return; }
            showOk((d.removed || 0) + ' 件の校正マーカーを削除しました。');
            loadMarkers();
        });
    }

    var F1 = String.fromCharCode(1), F2 = String.fromCharCode(2);

    function loadMarkers() {
        if (!host) { return; }
        evalHost('listMarkers()', function (res) {
            if (res && res.charAt(0) === '{') { // エラーJSON
                try { var e = JSON.parse(res); markerListEl.innerHTML = ''; renderEmpty(e.error || 'マーカー取得エラー'); } catch (x) {}
                return;
            }
            renderMarkers(res);
        });
    }

    function renderEmpty(msg) {
        var d = document.createElement('div');
        d.className = 'empty';
        d.textContent = msg;
        markerListEl.appendChild(d);
    }

    function renderMarkers(raw) {
        allMarkers = [];
        if (raw) {
            var recs = raw.split(F2);
            for (var i = 0; i < recs.length; i++) {
                if (!recs[i]) { continue; }
                var f = recs[i].split(F1);
                var name = f[1] || '';
                allMarkers.push({
                    ticks: f[0], name: name, cmt: f[2] || '', secs: parseFloat(f[3]),
                    kosei: name.indexOf('校正') === 0
                });
            }
        }
        renderList();
    }

    function renderList() {
        markerListEl.innerHTML = '';
        var shown = 0;
        for (var i = 0; i < allMarkers.length; i++) {
            var mk = allMarkers[i];
            if (curFilter === 'kosei' && !mk.kosei) { continue; }
            if (curFilter === 'other' && mk.kosei) { continue; }
            shown++;

            var row = document.createElement('div');
            row.className = 'mitem';

            var nm = document.createElement('div');
            nm.className = 'mname';
            nm.textContent = fmtTime(mk.secs) + (mk.name ? '  ' + mk.name : '');
            row.appendChild(nm);

            var cm = document.createElement('div');
            cm.className = 'mcmt';
            cm.textContent = mk.cmt || '（コメントなし）';
            if (!mk.cmt) { cm.style.color = '#777'; }
            row.appendChild(cm);

            (function (tk) {
                row.addEventListener('click', function () {
                    evalHost("gotoMarker('" + tk + "')", function () {});
                });
            })(mk.ticks);
            markerListEl.appendChild(row);
        }
        if (shown === 0) {
            renderEmpty(allMarkers.length ? '該当するマーカーがありません' : 'マーカーがありません');
        }
    }

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) { sec = 0; }
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        function z(n) { return (n < 10 ? '0' : '') + n; }
        return (h > 0 ? h + ':' + z(m) : m + '') + ':' + z(s);
    }

    function evalHost(call, cb) {
        cs.evalScript(host + ';\n' + call, cb);
    }

    function refreshSeq() {
        if (!host) { return; }
        evalHost('getSeqInfo()', function (res) {
            log('getSeqInfo → ' + res);
            try {
                var d = JSON.parse(res);
                seqNameEl.textContent = d.error ? '—' : (d.seq || '—');
            } catch (e) { seqNameEl.textContent = '—'; log('getSeqInfo パース失敗'); }
        });
    }

    function fpsConf(mode, autoFps) {
        switch (mode) {
            case '2997df': return { fps: 30000 / 1001, nominal: 30, drop: true };
            case '2997nd': return { fps: 30000 / 1001, nominal: 30, drop: false };
            case '5994df': return { fps: 60000 / 1001, nominal: 60, drop: true };
            case '30': return { fps: 30, nominal: 30, drop: false };
            case '25': return { fps: 25, nominal: 25, drop: false };
            case '24': return { fps: 24, nominal: 24, drop: false };
            case '23976': return { fps: 24000 / 1001, nominal: 24, drop: false };
            case 'auto':
                var nom = Math.round(autoFps || 0);
                var drop = nom > 0 && Math.abs(autoFps - nom) > 0.001;
                return { fps: autoFps, nominal: nom, drop: drop };
        }
        return null;
    }

    function tcToFrame(tc, conf) {
        var p = tc.split(/[;:]/);
        var hh = parseInt(p[0], 10), mm = parseInt(p[1], 10),
            ss = parseInt(p[2], 10), ff = parseInt(p[3], 10);
        var frame = ((hh * 3600 + mm * 60 + ss) * conf.nominal) + ff;
        if (conf.drop) {
            var dpm = conf.nominal >= 60 ? 4 : 2;
            var totalMin = hh * 60 + mm;
            frame -= dpm * (totalMin - Math.floor(totalMin / 10));
        }
        return frame;
    }

    // 2〜4要素のTCを "HH;MM;SS;FF" に正規化。不正なら null。
    //  2要素 = MM:SS（例 0:34 → 00;00;34;00）／3要素 = HH:MM:SS／4要素 = HH:MM:SS:FF
    function normalizeTC(s) {
        s = s.trim();
        if (!/^\d{1,2}([;:]\d{1,2}){1,3}$/.test(s)) { return null; }
        var p = s.split(/[;:]/);
        for (var i = 0; i < p.length; i++) { p[i] = parseInt(p[i], 10); }
        var hh, mm, ss, ff;
        if (p.length === 2) { hh = 0; mm = p[0]; ss = p[1]; ff = 0; }
        else if (p.length === 3) { hh = p[0]; mm = p[1]; ss = p[2]; ff = 0; }
        else { hh = p[0]; mm = p[1]; ss = p[2]; ff = p[3]; }
        function z(n) { return (n < 10 ? '0' : '') + n; }
        return z(hh) + ';' + z(mm) + ';' + z(ss) + ';' + z(ff);
    }

    // 行/セルの先頭が TC で始まるか
    function lineStartsWithTC(s) {
        return /^\s*\d{1,2}(?:[;:]\d{1,2}){1,3}/.test(s);
    }
    // 文字列中の全 TC を正規化して抽出（"TC / TC" のような複数位置に対応）
    function extractAllTCs(s) {
        var out = [], re = /\d{1,2}(?:[;:]\d{1,2}){1,3}/g, m;
        while ((m = re.exec(s))) { var n = normalizeTC(m[0]); if (n) { out.push(n); } }
        return out;
    }
    // 文字列が TC と区切り記号だけで構成されているか（"00;11;00;23 / 00;11;22;09" 等）
    function isOnlyTCs(s) {
        return s.replace(/\d{1,2}(?:[;:]\d{1,2}){1,3}/g, '').replace(/[\s/／、,，・|｜]+/g, '') === '';
    }

    // 縦並び（1セル1行）・タブ区切りの両対応。TC行を起点にレコード化。
    function parse(conf) {
        var lines = dataEl.value.split(/\r?\n/);
        var records = [];   // {tc, fields:[]}
        var errs = [];
        var cur = null;
        for (var i = 0; i < lines.length; i++) {
            var raw = lines[i];
            var t = raw.trim();
            if (!t) { continue; }
            if (t.indexOf('タイムコード') !== -1 || t.indexOf('位置(TC') !== -1 || t.indexOf('位置（TC') !== -1) { continue; } // ヘッダ行

            // タブ区切りの1行完結レコード（先頭の番号列・末尾の分類列があってもTC列を探す）
            if (raw.indexOf('\t') !== -1) {
                var cols = raw.split('\t');
                var tcIdx = -1;
                for (var c = 0; c < cols.length; c++) { if (lineStartsWithTC(cols[c])) { tcIdx = c; break; } }
                if (tcIdx !== -1) {
                    var tcs = extractAllTCs(cols[tcIdx]);
                    if (tcs.length) {
                        var f = [];
                        for (var c2 = tcIdx + 1; c2 < cols.length; c2++) { if (cols[c2].trim()) { f.push(cols[c2].trim()); } }
                        records.push({ tcs: tcs, fields: f });
                        cur = null;
                        continue;
                    }
                }
            }

            // 位置行（TCのみ。"TC / TC" のように複数位置も可）→ 縦並びレコード開始
            if (lineStartsWithTC(t) && isOnlyTCs(t)) {
                cur = { tcs: extractAllTCs(t), fields: [] };
                records.push(cur);
                continue;
            }

            // 1行完結（箇条書き/矢印）形式:  * 00;06;46;22 現在テキスト → 修正テキスト
            var body = t.replace(/^[\s*・•\-–—]+/, ''); // 先頭の箇条書き記号を除去
            var mInline = body.match(/^(\d{1,2}(?:[;:]\d{1,2}){1,3})\s+(.+)$/);
            if (mInline) {
                var itc = normalizeTC(mInline[1]);
                if (itc) {
                    var rest = mInline[2].trim();
                    var arrow = rest.split(/\s*(?:→|->|⇒|⟶)\s*/);
                    var f2 = (arrow.length >= 2)
                        ? [arrow[0].trim(), arrow.slice(1).join(' ').trim()]
                        : [rest];
                    records.push({ tcs: [itc], fields: f2 });
                    cur = null;
                    continue;
                }
            }
            // TC以外の行 → 直近レコードのフィールドに追加
            if (cur) {
                cur.fields.push(t);
            } else {
                errs.push((i + 1) + '行目: TC前の孤立テキスト「' + t + '」');
            }
        }

        var out = [];
        // zeroPoint(開始TC)もフレームに換算して整数で引く（秒経由の誤差をなくす）
        var zeroFrames = Math.round((conf.offset || 0) * conf.fps);
        for (var r = 0; r < records.length; r++) {
            var rec = records[r];
            var curText = '', fixText = '';
            // fields[0]=該当/現在、fields[1]=修正案。以降（分類・番号など）は無視
            if (rec.fields.length >= 2) { curText = rec.fields[0]; fixText = rec.fields[1]; }
            else if (rec.fields.length === 1) { fixText = rec.fields[0]; }
            else { errs.push((rec.tcs[0] || '?') + ': 本文なし（スキップ）'); continue; }

            var comment = (curText ? '現在：' + curText + '\n' : '') + '修正：' + fixText;
            for (var ti = 0; ti < rec.tcs.length; ti++) {
                var tc = rec.tcs[ti];
                var frame = tcToFrame(tc, conf) + (conf.offsetFrames || 0) - zeroFrames;
                if (frame < 0) { frame = 0; }
                out.push({ frame: frame, name: '校正 ' + tc, comment: comment });
                log(tc + ' → frame ' + frame + '  修正:' + fixText);
            }
        }
        return { list: out, errs: errs };
    }

    var TICKS_PER_SEC = 254016000000;

    function run() {
        if (!host) { showErr('ホストスクリプト未ロード'); return; }
        var mode = fpsSel.value;
        log('--- 実行 (fps=' + mode + ') ---');
        // シーケンス情報は常に取得（開始TCオフセット・実fpsに使う）
        evalHost('getSeqInfo()', function (res) {
            log('getSeqInfo → ' + res);
            var d = {};
            try { d = JSON.parse(res); } catch (e) { showErr('getSeqInfo: JSONパース失敗\n' + res); return; }
            if (d.error) { showErr(d.error); return; }

            var conf;
            if (mode === 'auto') {
                if (!d.fps || d.fps <= 0) { showErr('自動取得失敗: fps不明 (' + d.fps + ')\n手動でフレームレートを選んでください'); return; }
                conf = fpsConf('auto', d.fps);
            } else {
                conf = fpsConf(mode);
            }

            // 開始TC(zeroPoint, ticks)を秒に換算して差し引く
            var zp = parseFloat(d.zeroPoint);
            conf.offset = (isFinite(zp) && zp > 0) ? (zp / TICKS_PER_SEC) : 0;
            conf.offsetFrames = parseInt(offsetEl.value, 10) || 0;
            log('fps=' + conf.fps.toFixed(4) + ' nominal=' + conf.nominal + ' drop=' + conf.drop +
                ' 開始TCオフセット=' + conf.offset.toFixed(3) + 's 微調整=' + conf.offsetFrames + 'f');
            doRun(conf);
        });
    }

    function doRun(conf) {
        var r = parse(conf);
        log('レコード ' + r.list.length + ' 件 / スキップ ' + r.errs.length + ' 件');
        if (r.errs.length) { log('スキップ:\n' + r.errs.join('\n')); }
        if (r.list.length === 0) {
            showErr('有効な行がありません（ログ参照）');
            return;
        }
        var parts = [];
        for (var k = 0; k < r.list.length; k++) {
            var it = r.list[k];
            parts.push(it.frame + F1 + it.name + F1 + it.comment);
        }
        var payload = parts.join(F2)
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
            .replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        var color = parseInt(colorEl.value, 10) || 0;
        var doAdd = function () {
            evalHost("addMarkers('" + payload + "'," + color + ")", function (res) {
                log('addMarkers → ' + res);
                var d = {};
                try { d = JSON.parse(res); } catch (e) { showErr('マーカー追加: 応答パース失敗\n' + res); return; }
                if (d.error) { showErr(d.error); return; }
                var msg = d.added + ' 件のマーカーを追加しました。';
                if (r.errs.length) { msg += '（スキップ ' + r.errs.length + ' 件・ログ参照）'; }
                showOk(msg);
                loadMarkers();
            });
        };
        if (clearEl.checked) {
            evalHost('clearKoseiMarkers()', function (res) { log('clearKoseiMarkers → ' + res); doAdd(); });
        } else {
            doAdd();
        }
    }

    function showOk(t) { resultEl.className = 'result ok'; resultEl.textContent = t; log('OK: ' + t); }
    function showErr(t) { resultEl.className = 'result err'; resultEl.textContent = t; log('ERR: ' + t); }
})();
