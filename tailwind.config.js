/** @type {import('tailwindcss').Config} */
module.exports = {
  // 启用基于class的暗黑模式
  darkMode: 'class',
  // 配置Tailwind扫描哪些文件来查找utility classes
  content: [
    "./index.html", // 扫描最终生成的index.html
    "./scripts/generate_html.js", // 同时扫描JS文件中的模板字符串
  ],
  theme: {
    extend: {
      // 在这里定义您的校色，方便在HTML中通过 `text-neuq-blue` 等方式使用
      colors: {
        'neuq-blue': '#30448c',
      }
    },
  },
  plugins: [],
}