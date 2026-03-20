import './settings.css';

interface TextFilter {
  id: string;
  enabled: boolean;
  type: 'translate' | 'custom-prompt';
  targetLanguage?: string;
  prompt?: string;
}

interface AppConfig {
  apiKey: string;
  language: string;
  filters: TextFilter[];
}

declare global {
  interface Window {
    settingsBridge: {
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<void>;
      quit: () => void;
      onStatusChange: (callback: (status: string) => void) => void;
    };
  }
}

const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const toggleApiKeyBtn = document.getElementById('toggleApiKey') as HTMLButtonElement;
const languageSelect = document.getElementById('language') as HTMLSelectElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const quitBtn = document.getElementById('quitBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const addFilterBtn = document.getElementById('addFilterBtn') as HTMLButtonElement;
const filtersList = document.getElementById('filtersList') as HTMLDivElement;

let filters: TextFilter[] = [];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function renderFilters(): void {
  if (filters.length === 0) {
    filtersList.innerHTML = '<div class="empty-filters">No filters. Click + Add to create one.</div>';
    return;
  }

  filtersList.innerHTML = filters.map((filter, index) => `
    <div class="filter-card" data-index="${index}">
      <div class="filter-header">
        <select class="filter-type" data-index="${index}">
          <option value="translate" ${filter.type === 'translate' ? 'selected' : ''}>Translate</option>
          <option value="custom-prompt" ${filter.type === 'custom-prompt' ? 'selected' : ''}>Custom Prompt</option>
        </select>
        <label class="filter-toggle">
          <input type="checkbox" class="filter-enabled" data-index="${index}" ${filter.enabled ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
        <button class="btn-remove" data-index="${index}">&times;</button>
      </div>
      <div class="filter-body">
        ${filter.type === 'translate' ? `
          <select class="filter-target-lang" data-index="${index}">
            <option value="en" ${filter.targetLanguage === 'en' ? 'selected' : ''}>English</option>
            <option value="es" ${filter.targetLanguage === 'es' ? 'selected' : ''}>Espanol</option>
            <option value="pt" ${filter.targetLanguage === 'pt' ? 'selected' : ''}>Portugues</option>
            <option value="fr" ${filter.targetLanguage === 'fr' ? 'selected' : ''}>Francais</option>
            <option value="de" ${filter.targetLanguage === 'de' ? 'selected' : ''}>Deutsch</option>
            <option value="it" ${filter.targetLanguage === 'it' ? 'selected' : ''}>Italiano</option>
            <option value="ja" ${filter.targetLanguage === 'ja' ? 'selected' : ''}>Japanese</option>
            <option value="ko" ${filter.targetLanguage === 'ko' ? 'selected' : ''}>Korean</option>
            <option value="zh" ${filter.targetLanguage === 'zh' ? 'selected' : ''}>Chinese</option>
          </select>
        ` : `
          <textarea class="filter-prompt" data-index="${index}" placeholder="Enter your custom prompt... e.g. 'Fix grammar and punctuation'">${filter.prompt || ''}</textarea>
        `}
      </div>
    </div>
  `).join('');

  // Bind events
  filtersList.querySelectorAll('.filter-type').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      filters[idx].type = (e.target as HTMLSelectElement).value as any;
      if (filters[idx].type === 'translate' && !filters[idx].targetLanguage) {
        filters[idx].targetLanguage = 'en';
      }
      renderFilters();
    });
  });

  filtersList.querySelectorAll('.filter-enabled').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      filters[idx].enabled = (e.target as HTMLInputElement).checked;
    });
  });

  filtersList.querySelectorAll('.filter-target-lang').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).dataset.index!);
      filters[idx].targetLanguage = (e.target as HTMLSelectElement).value;
    });
  });

  filtersList.querySelectorAll('.filter-prompt').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLTextAreaElement).dataset.index!);
      filters[idx].prompt = (e.target as HTMLTextAreaElement).value;
    });
  });

  filtersList.querySelectorAll('.btn-remove').forEach((el) => {
    el.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLButtonElement).dataset.index!);
      filters.splice(idx, 1);
      renderFilters();
    });
  });
}

// Load config
window.settingsBridge.getConfig().then((config) => {
  apiKeyInput.value = config.apiKey || '';
  languageSelect.value = config.language || 'es';
  filters = config.filters || [];
  renderFilters();
});

// Toggle API key visibility
toggleApiKeyBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
  } else {
    apiKeyInput.type = 'password';
  }
});

// Add filter
addFilterBtn.addEventListener('click', () => {
  filters.push({
    id: generateId(),
    enabled: true,
    type: 'translate',
    targetLanguage: 'en',
  });
  renderFilters();
});

// Save
saveBtn.addEventListener('click', async () => {
  const config: AppConfig = {
    apiKey: apiKeyInput.value.trim(),
    language: languageSelect.value,
    filters,
  };
  await window.settingsBridge.saveConfig(config);
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.textContent = 'Save';
  }, 1500);
});

// Quit
quitBtn.addEventListener('click', () => {
  window.settingsBridge.quit();
});

// Status updates
window.settingsBridge.onStatusChange((status) => {
  statusEl.textContent = status === 'recording' ? 'Recording' : status === 'transcribing' ? 'Transcribing' : 'Idle';
  statusEl.className = `status ${status}`;
});
