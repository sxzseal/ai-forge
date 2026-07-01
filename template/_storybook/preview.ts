import type { Preview } from '@storybook/nextjs-vite'
import '../src/app/globals.css'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { withThemeByClassName } from '@storybook/addon-themes'
import { visualFeedbackDecorator } from './visual-feedback/overlay'

initialize()

const viewports = {
  mobile: {
    name: '📱 Mobile (375)',
    styles: { width: '375px', height: '812px' },
    type: 'mobile' as const,
  },
  tablet: {
    name: '📱 Tablet (768)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet' as const,
  },
  laptop: {
    name: '💻 Laptop (1280)',
    styles: { width: '1280px', height: '800px' },
    type: 'desktop' as const,
  },
  desktop: {
    name: '🖥️ Desktop (1440)',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
  },
  wide: {
    name: '🖥️ Wide (1920)',
    styles: { width: '1920px', height: '1080px' },
    type: 'desktop' as const,
  },
}

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
    viewport: {
      viewports,
      defaultViewport: 'laptop',
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    visualFeedbackDecorator,
  ],
}

export default preview
