// ExtendScript host (Premiere Pro) ※ ExtendScript には JSON が無いので手組みで返す

function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function getSeqInfo() {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    var TICKS = 254016000000; // ticks per second
    var fps = 0, src = "";
    var tb = parseFloat(seq.timebase);
    if (tb > 0) { fps = TICKS / tb; src = "timebase"; }
    if (!(fps > 0)) {
        try {
            var st = seq.getSettings();
            var vfr = parseFloat(st.videoFrameRate.ticks);
            if (vfr > 0) { fps = TICKS / vfr; src = "settings"; }
        } catch (e) {}
    }
    var vdf = "";
    try { vdf = String(seq.videoDisplayFormat); } catch (e) { vdf = "n/a"; }
    var zero = "";
    try { zero = String(seq.zeroPoint); } catch (e) { zero = "n/a"; } // シーケンス開始TC(ticks)
    return '{"seq":"' + esc(seq.name) + '","fps":' + fps + ',"src":"' + src +
           '","timebase":"' + esc(seq.timebase) + '","vdf":"' + vdf + '","zeroPoint":"' + zero + '"}';
}

// 全マーカーを一覧化。レコード=CharCode(2)区切、フィールド=CharCode(1)区切 = ticks / name / comment
function listMarkers() {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    var F1 = String.fromCharCode(1), F2 = String.fromCharCode(2);
    var out = "";
    var first = true;
    var m = seq.markers.getFirstMarker();
    while (m) {
        var ticks = "0", secs = "0";
        try { ticks = String(m.start.ticks); } catch (e) {}
        try { secs = String(m.start.seconds); } catch (e) {}
        if (!first) { out += F2; }
        out += ticks + F1 + (m.name || "") + F1 + (m.comments || "") + F1 + secs;
        first = false;
        m = seq.markers.getNextMarker(m);
    }
    return out; // 空文字 = マーカー無し
}

// 指定 ticks のマーカーの完了状態を切り替え（名前末尾の ✓ で表現）
function setMarkerDone(ticks, done) {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    var target = String(ticks);
    var m = seq.markers.getFirstMarker();
    while (m) {
        var mt = "0";
        try { mt = String(m.start.ticks); } catch (e) {}
        if (mt === target) {
            var nm = (m.name || "").replace(/\s*✓\s*$/, "");
            m.name = (done === "1" || done === 1 || done === true) ? (nm + " ✓") : nm;
            return '{"ok":1}';
        }
        m = seq.markers.getNextMarker(m);
    }
    return '{"error":"該当マーカーが見つかりません"}';
}

// 再生ヘッドを指定 ticks へ移動
function gotoMarker(ticks) {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    seq.setPlayerPosition(String(ticks)); // ticks は文字列で渡す
    return '{"ok":1}';
}

// 名前が「校正」で始まるマーカーを削除
function clearKoseiMarkers() {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    var removed = 0;
    var m = seq.markers.getFirstMarker();
    while (m) {
        var next = seq.markers.getNextMarker(m);
        if (m.name && m.name.indexOf("校正") === 0) {
            seq.markers.deleteMarker(m);
            removed++;
        }
        m = next;
    }
    return '{"removed":' + removed + '}';
}

// payload: レコードを CharCode(2) 区切、各フィールドを CharCode(1) 区切 = frame / name / comment
// フレーム番号 × シーケンスの timebase(ticks/frame) で正確な位置を計算する
function addMarkers(payload, colorIndex) {
    var seq = app.project.activeSequence;
    if (!seq) { return '{"error":"アクティブなシーケンスがありません"}'; }
    var TICKS = 254016000000;
    var tpf = parseFloat(seq.timebase); // ticks per frame
    if (!(tpf > 0)) { return '{"error":"timebase取得失敗: ' + seq.timebase + '"}'; }
    var ci = parseInt(colorIndex, 10);
    if (isNaN(ci)) { ci = 0; }
    var recs = payload.split(String.fromCharCode(2));
    var added = 0;
    var maxDiff = 0; // 要求フレームと実際に刺さった位置の最大差（フレーム）
    for (var i = 0; i < recs.length; i++) {
        if (!recs[i]) { continue; }
        var f = recs[i].split(String.fromCharCode(1));
        var frame = parseInt(f[0], 10);
        var sec = frame * tpf / TICKS;
        var mk = seq.markers.createMarker(sec);
        mk.name = f[1];
        mk.comments = f[2];
        try { mk.setColorByIndex(ci); } catch (e) {}
        added++;
        try {
            var actualTicks = parseFloat(mk.start.ticks);
            var diff = (actualTicks - frame * tpf) / tpf;
            if (Math.abs(diff) > Math.abs(maxDiff)) { maxDiff = diff; }
        } catch (e) {}
    }
    return '{"added":' + added + ',"maxDiffFrames":' + maxDiff.toFixed(4) + ',"tpf":' + tpf + '}';
}
