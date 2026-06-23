import type { Preview } from '@storybook/react'
import '../src/app/globals.css'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { withThemeByClassName } from '@storybook/addon-themes'

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
  ],
}

export default preview
