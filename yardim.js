(() => {
  'use strict';
  const search = document.getElementById('help-search');
  const form = document.getElementById('help-search-form');
  const clear = document.getElementById('help-clear');
  const buttons = [...document.querySelectorAll('[data-help-category]')];
  const questions = [...document.querySelectorAll('.hb-faq')];
  const count = document.getElementById('help-count');
  const empty = document.getElementById('help-empty');
  const heading = document.getElementById('faq-title');
  let category = 'all';
  const normalize = value => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ı/g, 'i');
  const searchable = new Map(questions.map(question => [question, normalize(question.textContent)]));
  function render() {
    const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let visible = 0;
    questions.forEach(question => {
      const match = (category === 'all' || question.dataset.category === category) && words.every(word => searchable.get(question).includes(word));
      question.hidden = !match;
      question.open = match && words.length > 0;
      if (match) visible++;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.helpCategory === category)));
    heading.textContent = category === 'all' ? 'Sık sorulan sorular' : buttons.find(button => button.dataset.helpCategory === category).textContent;
    count.textContent = words.length ? `${visible} sonuç` : `${visible} soru`;
    empty.hidden = visible !== 0;
    clear.hidden = search.value.length === 0;
  }
  search.addEventListener('input', render);
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  buttons.forEach(button => button.addEventListener('click', () => { category = button.dataset.helpCategory; render(); }));
  clear.addEventListener('click', () => { search.value = ''; render(); search.focus(); });
  document.getElementById('help-reset').addEventListener('click', () => { category = 'all'; search.value = ''; render(); search.focus(); });
  render();
})();
