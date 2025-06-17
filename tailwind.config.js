/** @type {import('tailwindcss').Config} */
module.exports = {
  // 启用基于class的暗黑模式
  darkMode: "class",
  // 【关键修改】只扫描最终生成的 index.html 文件。
  // 这确保了 Tailwind 能看到所有动态填充的、最终在页面上可见的类。
  content: ["./index.html"],
  theme: {
    extend: {
      // 在这里定义您的校色，方便在HTML中通过 text-neuq-blue 等方式使用
      colors: {
        "neuq-blue": "#30448c",
      },
    },
  },
  plugins: [],
};