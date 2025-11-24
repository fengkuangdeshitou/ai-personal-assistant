const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Dialogs
  showAboutDialog: () => ipcRenderer.invoke('show-about-dialog'),

  // Platform-specific features can be added here
  platform: process.platform,

  // Add more APIs as needed for your application
  // For example:
  // openFile: () => ipcRenderer.invoke('dialog:openFile'),
  // saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
});