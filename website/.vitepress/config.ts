import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Aixle Insights',
  description: 'AI tool analytics for engineering teams',
  base: '/insights/',   // GitHub Pages repo subdirectory — update if custom domain added
  ignoreDeadLinks: 'localhostLinks',

  themeConfig: {
    // logo: '/logo.svg',  // uncomment and add website/public/logo.svg before launch

    nav: [
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'Guide', link: '/guide/connectors' },
      { text: 'Reference', link: '/reference/architecture' },
      { text: 'App', link: 'https://insights.aixle.com' },
      { text: 'GitHub', link: 'https://github.com/AixleHQ/insights' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quickstart', link: '/quickstart' },
        ],
      },
      {
        text: 'User Guide',
        items: [
          { text: 'Connecting Tools', link: '/guide/connectors' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Contributing', link: '/guide/contributing' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/reference/architecture' },
          { text: 'CLI / MCP Server', link: '/reference/cli' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', url: 'https://github.com/AixleHQ/insights' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the Apache 2.0 License.',
      copyright: '© 2026 Dualboot Partners, LLC',
    },
  },
})
