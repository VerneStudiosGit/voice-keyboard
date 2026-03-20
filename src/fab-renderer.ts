import './fab.css';

declare global {
  interface Window {
    fabBridge: {
      openSettings: () => void;
    };
  }
}

const fab = document.getElementById('fab')!;

fab.addEventListener('click', () => {
  window.fabBridge.openSettings();
});
