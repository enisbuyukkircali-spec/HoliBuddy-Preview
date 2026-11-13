(() => {
  const form = document.getElementById('hb-contact-form');
  const category = document.getElementById('contact-category');
  const companyWrap = document.getElementById('company-wrap');
  const referenceWrap = document.getElementById('reference-wrap');
  const target = document.getElementById('contact-recipient');
  const status = document.getElementById('contact-status');
  const submit = document.getElementById('contact-submit');
  const message = document.getElementById('contact-message');
  const counter = document.getElementById('message-count');
  const fallback = document.getElementById('contact-fallback');
  const success = document.getElementById('contact-success');
  const labels = { reservation: 'Rezervasyon', aftersales: 'Satış sonrası', partnership: 'Partnerlik', other: 'Diğer' };
  const recipient = () => category.value === 'partnership' ? 'info@holibuddy.com' : 'cssupport@holibuddy.com';
  let sending = false;
  function updateCategory() {
    const partner = category.value === 'partnership';
    companyWrap.hidden = !partner;
    companyWrap.querySelector('input').disabled = !partner;
    referenceWrap.hidden = partner;
    referenceWrap.querySelector('input').disabled = partner;
    target.textContent = recipient();
    target.href = 'mailto:' + recipient();
    document.getElementById('route-label').textContent = partner ? 'İş ortaklıkları ekibimiz' : 'Müşteri destek ekibimiz';
    fallback.hidden = true;
    status.textContent = '';
  }
  category.addEventListener('change', updateCategory);
  message.addEventListener('input', () => { counter.textContent = message.value.length + ' / 5000'; });
  document.querySelectorAll('[data-contact-category]').forEach(button => button.addEventListener('click', () => {
    if (sending) return;
    category.value = button.dataset.contactCategory;
    updateCategory();
    category.focus();
  }));
  function emailDraft(data) {
    const content = `Talep türü: ${labels[data.category]}\nAd soyad: ${data.name}\nE-posta: ${data.email}\nTelefon: ${data.phone || '-'}\n${data.company ? 'Şirket: ' + data.company + '\n' : ''}${data.reference ? 'Rezervasyon numarası: ' + data.reference + '\n' : ''}\n${data.message}`;
    fallback.href = `mailto:${recipient()}?subject=${encodeURIComponent('HoliBuddy | ' + labels[data.category] + ' talebi')}&body=${encodeURIComponent(content)}`;
    fallback.hidden = false;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    sending = true;
    submit.disabled = true;
    category.disabled = true;
    submit.textContent = 'Gönderiliyor…';
    form.setAttribute('aria-busy', 'true');
    status.className = 'hb-form-status';
    status.textContent = 'Mesajınız iletiliyor. Lütfen sayfayı kapatmayın.';
    fallback.hidden = true;
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data), signal: AbortSignal.timeout(20000)
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        status.className = 'hb-form-status is-error';
        if (result.code === 'RATE_LIMITED') status.textContent = 'Kısa sürede çok sayıda talep gönderildi. Lütfen 15 dakika sonra tekrar deneyin veya e-posta ile iletişime geçin.';
        else if (result.code === 'VALIDATION_ERROR') status.textContent = 'Bilgilerinizi kontrol edin. Ad soyad, geçerli bir e-posta ve en az 10 karakterlik bir mesaj gereklidir.';
        else status.textContent = 'Form üzerinden gönderim şu anda tamamlanamadı. Bilgileriniz bu sayfada duruyor; aşağıdaki bağlantıyla mesajınızı e-posta uygulamanızda açabilirsiniz.';
        emailDraft(data);
        return;
      }
      form.hidden = true;
      success.hidden = false;
      document.getElementById('success-recipient').textContent = recipient();
      success.focus();
    } catch {
      status.className = 'hb-form-status is-error';
      status.textContent = 'Gönderim teyidi alınamadı. Bilgileriniz silinmedi. İnternet bağlantınızı kontrol edebilir veya mesajınızı e-posta uygulamanızda açabilirsiniz.';
      emailDraft(data);
    } finally {
      sending = false;
      category.disabled = false;
      submit.disabled = false;
      submit.textContent = 'Mesajı gönder';
      form.removeAttribute('aria-busy');
    }
  });
  document.getElementById('new-message').addEventListener('click', () => {
    form.reset();
    success.hidden = true;
    form.hidden = false;
    counter.textContent = '0 / 5000';
    updateCategory();
    category.focus();
  });
  updateCategory();
})();
