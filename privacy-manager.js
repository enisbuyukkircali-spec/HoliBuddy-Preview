/* HoliBuddy privacy preferences. No analytics, ads, or newsletter permission is enabled here. */
(() => {
  'use strict';
  const KEY = 'hb-consent.v1';
  const VERSION = '2026-11-14';
  const DAYS = 180;
  const TTL = DAYS * 86400000;
  const preferenceKeys = ['hb-locale', 'hb-currency'];
  const memory = new Map();
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const remove = key => { try { localStorage.removeItem(key); } catch {} };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  function valid(record) {
    return record && record.version === VERSION && typeof record.preferences === 'boolean' &&
      Number.isFinite(record.savedAt) && Number.isFinite(record.expiresAt) &&
      record.savedAt <= Date.now() + 60000 && record.expiresAt > Date.now() &&
      record.expiresAt - record.savedAt === TTL;
  }
  function readChoice() {
    try { const item = JSON.parse(read(KEY)); return valid(item) ? item : null; } catch { return null; }
  }
  let choice = readChoice();
  const prune = () => { if (!valid(choice) || !choice.preferences) preferenceKeys.forEach(remove); };
  if (!choice) remove(KEY);
  prune();
  // The public exchange-rate cache belongs to the current tab, not permanent storage.
  remove('hb-fx');
  let banner, dialog, toggle, feedback, launcher;
  function getChoice() {
    if (choice && !valid(choice)) { choice = null; remove(KEY); prune(); if (banner) banner.hidden = false; }
    return choice;
  }
  function getPreference(key) {
    if (!preferenceKeys.includes(key)) return null;
    if (getChoice()?.preferences) return read(key) ?? memory.get(key) ?? null;
    return memory.get(key) ?? null;
  }
  function setPreference(key, value) {
    if (!preferenceKeys.includes(key) || typeof value !== 'string' || value.length > 30) return;
    memory.set(key, value);
    if (getChoice()?.preferences) write(key, value);
  }
  function save(preferences, source) {
    const savedAt = Date.now();
    choice = { version: VERSION, necessary: true, preferences: preferences === true,
      analytics: false, marketing: false, source, savedAt, expiresAt: savedAt + TTL };
    const stored = write(KEY, JSON.stringify(choice));
    if (choice.preferences) memory.forEach((value, key) => write(key, value));
    prune();
    banner.hidden = true;
    if (dialog.open) dialog.close();
    feedback.textContent = stored ? 'Çerez tercihleriniz kaydedildi.' : 'Tercihiniz bu sayfada uygulandı. Tarayıcınız kalıcı kayda izin vermediği için sonraki sayfada tekrar sorulabilir.';
    window.dispatchEvent(new CustomEvent('hb:privacy-change', { detail: { ...choice } }));
  }
  function openPreferences() {
    if (!dialog) return;
    launcher = document.activeElement;
    toggle.checked = getChoice()?.preferences === true;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-close]').focus();
  }
  window.HoliBuddyPrivacy = Object.freeze({
    getPreference, setPreference, openPreferences,
    allows: category => category === 'necessary' || (category === 'preferences' && getChoice()?.preferences === true),
    getChoice: () => getChoice() ? { ...choice } : null
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    choice = readChoice(); prune();
    if (banner) banner.hidden = Boolean(choice);
    if (toggle) toggle.checked = choice?.preferences === true;
    window.dispatchEvent(new CustomEvent('hb:privacy-change', { detail: choice ? { ...choice } : null }));
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) getChoice(); });
  function init() {
    const root = document.createElement('div'); root.id = 'hb-privacy-root';
    root.innerHTML = `<section class="hb-cookie-banner" aria-label="Çerez tercihleri" hidden>
      <div class="hb-cookie-copy"><span class="hb-cookie-kicker">HOLIBUDDY · GİZLİLİĞİNİZ</span><h2>Tercih sizin.</h2>
      <p>Sitenin çalışması için gerekli kayıtları kullanıyoruz. Dil ve para birimi seçimlerinizi sonraki ziyaretlerinizde hatırlamamız için izninizi istiyoruz. Şu anda analitik veya reklam takip kodu kullanmıyoruz. <a href="/cerez-politikasi">Çerez Politikası</a></p></div>
      <div class="hb-cookie-actions"><button type="button" data-reject>Tümünü reddet</button><button type="button" data-settings>Tercihleri yönet</button><button type="button" data-accept>Tümünü kabul et</button></div>
      <p class="hb-cookie-hint">Reddetmeniz, araç aramanızı veya rezervasyon işleminizi engellemez.</p>
    </section>
    <dialog class="hb-cookie-dialog" aria-labelledby="hb-cookie-title" aria-describedby="hb-cookie-description">
      <div class="hb-cookie-dialog-head"><div><span class="hb-cookie-kicker">GİZLİLİK MERKEZİ</span><h2 id="hb-cookie-title">Çerez tercihlerinizi yönetin</h2></div><button type="button" class="hb-cookie-close" data-close aria-label="Çerez tercihlerini kapat">×</button></div>
      <div class="hb-cookie-dialog-body"><p id="hb-cookie-description">Gerekli olmayan kayıtlar siz izin vermeden kalıcı olarak saklanmaz. Tercihinizi istediğiniz zaman alt menüden değiştirebilirsiniz.</p>
      <section class="hb-cookie-category"><div><h3>Zorunlu kayıtlar</h3><p>Tercih kararınızın hatırlanması, talep ettiğiniz kayıt ve rezervasyon işlevleri için kullanılır. Reklam amacı taşımaz.</p></div><span class="hb-cookie-fixed">Her zaman açık</span></section>
      <section class="hb-cookie-category"><div><label for="hb-cookie-preferences">Tercihleri hatırlama</label><p>Dil ve para birimi seçimlerinizi bu tarayıcıda, çerez tercihinizin geçerlilik süresinin sonuna kadar hatırlar.</p></div><input id="hb-cookie-preferences" type="checkbox" role="switch" aria-describedby="hb-cookie-description"></section>
      <section class="hb-cookie-inactive"><h3>Analitik ve pazarlama</h3><p>Şu anda bu kategorilerde takip aracı kullanılmıyor. Bu panel üzerinden gelecekte eklenecek araçlara veya bülten gönderimine izin alınmaz.</p></section>
      <p class="hb-cookie-detail">Tercih kaydı 180 gün geçerlidir. Ayrıntılar için <a href="/cerez-politikasi">Çerez Politikası</a> ve <a href="/kvkk">KVKK Aydınlatma Metni</a>.</p></div>
      <div class="hb-cookie-dialog-actions"><div class="hb-cookie-actions"><button type="button" data-reject>Tümünü reddet</button><button type="button" data-save>Seçimlerimi kaydet</button><button type="button" data-accept>Tümünü kabul et</button></div></div>
    </dialog><p class="hb-cookie-feedback" role="status" aria-live="polite"></p>`;
    document.body.append(root);
    banner = root.querySelector('.hb-cookie-banner'); dialog = root.querySelector('dialog');
    toggle = root.querySelector('#hb-cookie-preferences'); feedback = root.querySelector('.hb-cookie-feedback');
    root.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => save(false, 'reject')));
    root.querySelectorAll('[data-accept]').forEach(button => button.addEventListener('click', () => save(true, 'accept')));
    root.querySelector('[data-settings]').addEventListener('click', openPreferences);
    root.querySelector('[data-save]').addEventListener('click', () => save(toggle.checked, 'custom'));
    root.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { if (launcher?.isConnected) launcher.focus(); });
    banner.hidden = Boolean(getChoice());
    let nav = document.querySelector('nav[aria-label="Alt menü"]');
    if (!nav) {
      nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Gizlilik ve yasal bilgiler'); nav.className = 'hb-privacy-footer';
      const footer = document.querySelector('footer');
      if (footer) footer.insertAdjacentElement('afterend', nav); else document.body.insertBefore(nav, root);
      const privacy = document.createElement('a'); privacy.href = '/gizlilik-politikasi'; privacy.textContent = 'Gizlilik'; nav.append(privacy);
    }
    nav.classList.add('hb-privacy-links');
    [['Çerez Politikası','/cerez-politikasi'],['KVKK','/kvkk'],['Ticari İleti','/ticari-ileti']].forEach(([label, href]) => {
      if (nav.querySelector(`a[href="${href}"]`)) return;
      const link = document.createElement('a'); link.href = href; link.textContent = label; nav.append(link);
    });
    const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'hb-privacy-link'; settings.textContent = 'Çerez tercihleri'; settings.addEventListener('click', openPreferences); nav.append(settings);
    document.querySelectorAll('[data-open-cookie-preferences]').forEach(button => button.addEventListener('click', openPreferences));
    document.querySelectorAll('[data-hb-privacy-notice]').forEach(el => {
      el.innerHTML = 'Kişisel verilerinizin kullanımı için <a href="/kvkk">KVKK Aydınlatma Metni</a> ve <a href="/gizlilik-politikasi">Gizlilik Politikası</a>. Bu işlem bülten veya reklam izni oluşturmaz.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
