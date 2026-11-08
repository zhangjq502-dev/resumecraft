import { contextBridge, ipcRenderer } from 'electron'
import type { ResumeAPI } from '../shared/resume'

// preload 是页面与主进程的桥梁：每个方法对应固定通道，页面无法自行指定通道。
// 类型导入会在构建时移除；实际参数仍需由主进程验证。
const api: ResumeAPI = {
  previewPDF: () => ipcRenderer.invoke('resume:preview-pdf'),
  pickPDF: () => ipcRenderer.invoke('resume:pick-pdf'),
  loadAppearance: () => ipcRenderer.invoke('appearance:load'),
  saveAppearance: (appearance) => ipcRenderer.invoke('appearance:save', appearance),
  pickBackground: () => ipcRenderer.invoke('appearance:pick'),
  pickAvatar: () => ipcRenderer.invoke('resume:avatar'),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (library) => ipcRenderer.invoke('library:save', library),
  open: () => ipcRenderer.invoke('resume:open'),
  save: (document) => ipcRenderer.invoke('resume:save', document),
  exportPDF: (title) => ipcRenderer.invoke('resume:pdf', title)
}
// 页面通过 window.resume 调用这些方法，不接触 ipcRenderer 本身。
contextBridge.exposeInMainWorld('resume', api)
