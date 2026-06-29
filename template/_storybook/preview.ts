import type { Preview } from '@storybook/nextjs-vite'
import '../src/app/globals.css'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { withThemeByClassName } from '@storybook/addon-themes'
import { visualFeedbackDecorator } from './visual-feedback/overlay'

// Initialize MSW Storybook integration
initialize()

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
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
