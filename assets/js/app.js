const FILTERS_KEY = 'ielts_filters';
const ITEMS_PER_PAGE = 50; // Số đề hiển thị mỗi lần
const SEARCH_DEBOUNCE_MS = 300; // Delay cho search

const state = {
  tests: [],
  filtered: [],
  displayed: [], // Chỉ hiển thị một phần
  selected: null,
  filters: {
    category: 'all',
    query: '',
    sort: 'az',
  },
  searchTimeout: null,
  observer: null,
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
};

init();

async function init() {
  loadFilters(); // Load saved filters trước
  attachEvents();
  await loadData();
  setupKeyboardShortcuts();
}

async function loadData() {
  refs.status.textContent = 'Đang tải dữ liệu...';
  try {
    const tests = await fetchJSON('data/tests.json');
    state.tests = tests;
    applyFilters();
    updateStats();
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
    saveFilters();
    applyFilters();
  });

  // Debounce cho search input
  refs.searchInput.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase();
    
    // Hiển thị loading indicator
    refs.status.textContent = 'Đang tìm kiếm...';
    
    // Clear timeout cũ
    if (state.searchTimeout) {
      clearTimeout(state.searchTimeout);
    }
    
    // Set timeout mới
    state.searchTimeout = setTimeout(() => {
      state.filters.query = query;
      saveFilters();
      applyFilters();
    }, SEARCH_DEBOUNCE_MS);
  });

  refs.sortSelect.addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    saveFilters();
    applyFilters();
  });

  refs.resetFilters.addEventListener('click', () => {
    resetFilters();
  });
}

function resetFilters() {
  state.filters = { category: 'all', query: '', sort: 'az' };
  refs.categoryFilters.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.category === 'all');
  });
  refs.searchInput.value = '';
  refs.sortSelect.value = 'az';
  saveFilters();
  applyFilters();
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Ctrl+F hoặc Cmd+F: Focus vào search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      refs.searchInput.focus();
      refs.searchInput.select();
    }

    // Esc: Xóa filter
    if (event.key === 'Escape') {
      const isSearchFocused = document.activeElement === refs.searchInput;
      if (isSearchFocused) {
        refs.searchInput.blur();
      } else {
        resetFilters();
      }
    }

    // D: Toggle dark mode
    if (event.key === 'd' || event.key === 'D') {
      const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                             document.activeElement.tagName === 'SELECT';
      if (!isInputFocused) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.click();
      }
    }
  });
}

function loadFilters() {
  try {
    const saved = localStorage.getItem(FILTERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.filters = { ...state.filters, ...parsed };
      
      // Restore UI state
      if (refs.searchInput) refs.searchInput.value = state.filters.query || '';
      if (refs.sortSelect) refs.sortSelect.value = state.filters.sort || 'az';
      if (refs.categoryFilters) {
        refs.categoryFilters.querySelectorAll('.chip').forEach((chip) => {
          chip.classList.toggle('active', chip.dataset.category === state.filters.category);
        });
      }
    }
  } catch (error) {
    console.warn('Không thể load filters đã lưu:', error);
  }
}

function saveFilters() {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(state.filters));
  } catch (error) {
    console.warn('Không thể lưu filters:', error);
  }
}

function applyFilters() {
  const { category, query } = state.filters;
  state.filtered = state.tests.filter((test) => {
    const matchesCategory = category === 'all' || test.category === category;
    const matchesQuery = !query || test.title.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
  sortFiltered();
  
  // Reset về trang đầu khi filter thay đổi
  state.displayed = [];
  renderList();
  refs.status.textContent = `Đang hiển thị ${state.displayed.length} / ${state.filtered.length} đề.`;
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
  // Nếu đang reset (displayed rỗng), clear list trước
  if (state.displayed.length === 0) {
    refs.testList.innerHTML = '';
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  if (!state.filtered.length) {
    refs.testList.innerHTML = '<p class="row-meta">Không tìm thấy đề nào phù hợp với bộ lọc.</p>';
    refs.resultCount.textContent = '0 kết quả';
    return;
  }

  refs.resultCount.textContent = `${state.filtered.length} / ${state.tests.length} đề`;

  // Lazy load: chỉ render một phần đầu tiên
  const startIndex = state.displayed.length;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, state.filtered.length);
  const itemsToRender = state.filtered.slice(startIndex, endIndex);

  const fragment = document.createDocumentFragment();
  itemsToRender.forEach((test, relativeIndex) => {
    const absoluteIndex = startIndex + relativeIndex;
    const row = refs.rowTemplate.content.firstElementChild.cloneNode(true);
    const rowElement = row;
    
    // Reset animation delay để animation chạy lại khi filter thay đổi
    rowElement.style.animationDelay = `${absoluteIndex * 0.02}s`;

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
  
  // Cập nhật danh sách đã hiển thị
  state.displayed = state.filtered.slice(0, endIndex);
  
  // Nếu còn đề chưa hiển thị, setup intersection observer để load thêm
  if (endIndex < state.filtered.length) {
    setupLazyLoad();
  } else {
    // Disconnect observer nếu đã load hết
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }
  
  refs.status.textContent = `Đang hiển thị ${state.displayed.length} / ${state.filtered.length} đề.`;
}

function setupLazyLoad() {
  // Disconnect observer cũ nếu có
  if (state.observer) {
    state.observer.disconnect();
  }

  // Tạo sentinel element (phần tử cuối cùng để trigger load)
  const sentinel = refs.testList.querySelector('.load-more-sentinel');
  if (sentinel) {
    sentinel.remove();
  }

  const newSentinel = document.createElement('div');
  newSentinel.className = 'load-more-sentinel';
  newSentinel.style.height = '20px';
  refs.testList.appendChild(newSentinel);

  // Setup Intersection Observer
  state.observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          renderList(); // Load thêm
        }
      });
    },
    {
      rootMargin: '200px', // Load trước khi đến viewport 200px
    }
  );

  state.observer.observe(newSentinel);
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
    { all: state.tests.length, listening: 0, reading: 0, writing: 0, other: 0 },
  );

  // Update quick stats với card đẹp hơn
  refs.quickStats.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Tổng</span>
      <span class="stat-value">${totals.all || 0}</span>
    </div>
    <div class="stat-card listening">
      <span class="stat-label">🎧 Listening</span>
      <span class="stat-value">${totals.listening || 0}</span>
    </div>
    <div class="stat-card reading">
      <span class="stat-label">📘 Reading</span>
      <span class="stat-value">${totals.reading || 0}</span>
    </div>
    <div class="stat-card writing">
      <span class="stat-label">✍️ Writing</span>
      <span class="stat-value">${totals.writing || 0}</span>
    </div>
  `;

  // Update chip buttons với số lượng
  refs.categoryFilters.querySelectorAll('.chip').forEach((chip) => {
    const category = chip.dataset.category;
    const count = totals[category] || 0;
    const existingCount = chip.querySelector('.chip-count');
    
    if (category === 'all') {
      if (existingCount) existingCount.remove();
    } else {
      if (existingCount) {
        existingCount.textContent = `(${count})`;
      } else {
        const countSpan = document.createElement('span');
        countSpan.className = 'chip-count';
        countSpan.textContent = `(${count})`;
        chip.appendChild(countSpan);
      }
    }
  });
}
