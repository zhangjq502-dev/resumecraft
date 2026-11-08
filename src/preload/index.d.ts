import type { ResumeAPI } from '../shared/resume'
declare global {
  interface Window {
    resume: ResumeAPI
  }
}
