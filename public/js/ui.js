window.ui = {
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  formatSource(source) {
    if (!source) return '未标注来源';
    if (typeof source === 'string') return window.ui.escapeHtml(source);

    return [source.name, source.page ? `第 ${source.page} 页` : '', source.index ? `题号 ${source.index}` : '']
      .filter(Boolean)
      .map(window.ui.escapeHtml)
      .join(' / ') || '未标注来源';
  },

  debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
};
