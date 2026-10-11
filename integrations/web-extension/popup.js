(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sw = $('bypass');

  try {
    chrome.storage.local.get('bypass', (v) => { sw.checked = !!(v && v.bypass); });
    sw.addEventListener('change', () => chrome.storage.local.set({ bypass: sw.checked }));
  } catch (_) {}

  try {
    chrome.storage.session.get('detections', (v) => { $('count').textContent = String((v && v.detections) || 0); });
  } catch (_) {}

  chrome.runtime.sendMessage({ type: 'status' }, (st) => {
    if (chrome.runtime.lastError || !st || !st.reachable) {
      $('reach').textContent = 'ไม่พบ (ปล่อยผ่านปกติ)';
      $('reach').className = 'bad';
      $('mode').textContent = '-';
      return;
    }
    $('reach').textContent = 'เชื่อมต่อแล้ว';
    $('reach').className = 'ok';
    $('mode').textContent = st.monitor === true ? 'monitor' : st.monitor === false ? 'enforce' : 'ไม่ทราบ';
  });
})();
