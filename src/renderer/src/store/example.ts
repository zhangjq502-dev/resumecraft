import type { ResumeDocument } from '../../../shared/resume'

// 首次打开时的演示数据；载入示例也复用它，不代表用户的真实经历。
export const example: ResumeDocument = {
  version: 1,
  title: '我的前端开发简历',
  theme: 'classic',
  fontSize: 15,
  lineHeight: 1.55,
  markdown: `# 张同学
前端开发工程师 · 上海 · 应届毕业生

[hello@example.com](mailto:hello@example.com) · 138 0000 0000 · [GitHub](https://github.com)

## 个人简介
热爱构建清晰、易用的产品，关注 React、TypeScript 与桌面端开发。此处为演示内容，请替换为自己的真实经历。

## 教育背景
### 示例大学 · 计算机科学与技术
2022.09 — 2026.06 · 本科

- 主修课程：数据结构、计算机网络、操作系统、软件工程。

## 项目经历
### ResumeCraft · 桌面端简历编辑器
Electron / React / TypeScript / SCSS Modules / Zustand

- 开发 Markdown 编辑与实时预览，支持主题切换和版式调整。
- 使用本地 JSON 保存简历，提供备份导入及 PDF 导出。
- 通过受控 IPC 接口连接页面与本地文件服务。

### 在这里添加你的项目
项目时间 · 担任角色

- 说明遇到了什么问题、你采取的行动，以及可以验证的结果。
- 仅填写真实完成的内容，不使用未经测量的性能数据。

## 专业技能
- **前端开发**：JavaScript、TypeScript、React、HTML、CSS。
- **工程工具**：Git、Vite、Electron、Node.js。
- **协作能力**：需求拆解、问题定位、文档整理。
`
}
