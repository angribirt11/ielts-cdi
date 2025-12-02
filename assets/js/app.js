const state = {
  tests: [],
  filtered: [],
  duplicates: [],
  selected: null,
  filters: {
    category: 'all',
    query: '',
    sort: 'az',
  },
};

const refs = {
  status: document.getElementById('statusBar'),
  resultCount: document.getElementById('resultCount'),
  testList: document.getElementById('testList'),
  rowTemplate: document.getElementById('testRowTemplate'),
  quickStats: document.getElementById('quickStats'),
  categoryFilters: document.getElementById('categoryFilters'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  resetFilters: document.getElementById('resetFilters'),
  duplicateList: document.getElementById('duplicateList'),
  duplicateCount: document.getElementById('duplicateCount'),
};

init();

async function init() {
  attachEvents();
  await loadData();
}

async function loadData() {
  refs.status.textContent = 'Đang tải dữ liệu...';
  try {
    const [tests, duplicates] = await Promise.all([
      fetchJSON('data/tests.json'),
      fetchJSON('data/duplicates.json', []),
    ]);
    state.tests = tests;
    state.duplicates = duplicates;
    applyFilters();
    updateStats();
    renderDuplicates();
    refs.status.textContent = `Đang hiển thị ${state.filtered.length} / ${state.tests.length} đề.`;
  } catch (error) {
    console.error(error);
    refs.status.textContent = 'Không đọc được dữ liệu. Vui lòng kiểm tra lại file trong thư mục data/.';
    refs.resultCount.textContent = 'Không thể tải danh sách đề';
  }
}

async function fetchJSON(path, fallback = null) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    if (fallback !== null) return fallback;
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
}

function attachEvents() {
  refs.categoryFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-category]');
    if (!btn) return;
    refs.categoryFilters.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
    btn.classList.add('active');
    state.filters.category = btn.dataset.category;
    applyFilters();
  });

  refs.searchInput.addEventListener('input', (event) => {
    state.filters.query = event.target.value.toLowerCase();
    applyFilters();
  });

  refs.sortSelect.addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    applyFilters();
  });

  refs.resetFilters.addEventListener('click', () => {
    state.filters = { category: 'all', query: '', sort: 'az' };
    refs.categoryFilters.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.category === 'all');
    });
    refs.searchInput.value = '';
    refs.sortSelect.value = 'az';
    applyFilters();
  });
}

function applyFilters() {
  const { category, query } = state.filters;
  state.filtered = state.tests.filter((test) => {
    const matchesCategory = category === 'all' || test.category === category;
    const matchesQuery = !query || test.title.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
  sortFiltered();
  renderList();
  refs.status.textContent = `Đang hiển thị ${state.filtered.length} / ${state.tests.length} đề.`;
}

function sortFiltered() {
  const { sort } = state.filters;
  const extractDate = (title) => {
    const match = title.match(/(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/);
    return match ? match[0] : '';
  };

  const toSortableDate = (snippet) => {
    if (!snippet) return 0;
    const parts = snippet.replace(/-/g, '.').split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const normalizedYear = year.length === 2 ? `20${year}` : year;
      return Number(`${normalizedYear}${month.padStart(2, '0')}${day.padStart(2, '0')}`);
    }
    if (parts.length === 2) {
      const [day, month] = parts;
      const currentYear = new Date().getFullYear();
      return Number(`${currentYear}${month.padStart(2, '0')}${day.padStart(2, '0')}`);
    }
    return 0;
  };

  state.filtered.sort((a, b) => {
    if (sort === 'az') return a.title.localeCompare(b.title);
    if (sort === 'za') return b.title.localeCompare(a.title);
    const dateA = toSortableDate(extractDate(a.title));
    const dateB = toSortableDate(extractDate(b.title));
    return dateB - dateA;
  });
}

function renderList() {
  refs.testList.innerHTML = '';
  if (!state.filtered.length) {
    refs.testList.innerHTML = '<p class="row-meta">Không tìm thấy đề nào phù hợp với bộ lọc.</p>';
    refs.resultCount.textContent = '0 kết quả';
    return;
  }

  refs.resultCount.textContent = `${state.filtered.length} / ${state.tests.length} đề`;

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((test) => {
    const row = refs.rowTemplate.content.firstElementChild.cloneNode(true);
    const rowElement = row;

    const mainBtn = rowElement.querySelector('.row-main');
    row.querySelector('.row-title').textContent = test.title;
    row.querySelector('.row-meta').textContent = formatMeta(test);
    mainBtn.addEventListener('click', () => selectTest(test, rowElement));
    mainBtn.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') selectTest(test, rowElement);
    });
    if (state.selected?.file === test.file) rowElement.classList.add('active');
    fragment.appendChild(rowElement);
  });

  refs.testList.appendChild(fragment);
}

function selectTest(test, row) {
  state.selected = test;
  refs.testList.querySelectorAll('.test-row').forEach((item) => item.classList.remove('active'));
  row.classList.add('active');
  // Không còn khung preview, mở trực tiếp file ở tab mới
  window.open(encodeURI(test.file), '_blank', 'noopener');
}

function formatMeta(test) {
  switch (test.category) {
    case 'reading':
      return '📘 Reading';
    case 'listening':
      return '🎧 Listening';
    case 'writing':
      return '✍️ Writing';
    default:
      return '📄 Tài liệu khác';
  }
}

function updateStats() {
  const totals = state.tests.reduce(
    (acc, test) => {
      acc[test.category] = (acc[test.category] || 0) + 1;
      return acc;
    },
    { all: state.tests.length },
  );

  refs.quickStats.innerHTML = `
    <div>Tổng <span>${totals.all || 0}</span></div>
    <div>Listening <span>${totals.listening || 0}</span></div>
    <div>Reading <span>${totals.reading || 0}</span></div>
    <div>Writing <span>${totals.writing || 0}</span></div>
  `;
}

function renderDuplicates() {
  if (!state.duplicates.length) {
    refs.duplicateCount.textContent = '0';
    refs.duplicateList.innerHTML = '<p class="row-meta">Không phát hiện file trùng nội dung.</p>';
    return;
  }

  refs.duplicateCount.textContent = state.duplicates.length;
  const fragment = document.createDocumentFragment();

  state.duplicates.forEach((group) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'duplicate-group';
    wrapper.innerHTML = `
      <h3>Hash ${group.hash.slice(0, 8)}…</h3>
      <p>${group.files.length} file giống hệt nhau</p>
    `;

    const fileList = document.createElement('div');
    fileList.className = 'duplicate-files';
    group.files.forEach((file) => {
      const item = document.createElement('span');
      item.textContent = file;
      fileList.appendChild(item);
    });

    wrapper.appendChild(fileList);
    fragment.appendChild(wrapper);
  });

  refs.duplicateList.innerHTML = '';
  refs.duplicateList.appendChild(fragment);
}

