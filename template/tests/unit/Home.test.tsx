import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from '@/app/page'

describe('Home Page', () => {
  it('renders project name heading', () => {
    render(<Home />)
    // __PROJECT_NAME__ is replaced at project creation time
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders API Health link', () => {
    render(<Home />)
    const link = screen.getByRole('link', { name: /api health/i })
    expect(link).toHaveAttribute('href', '/api/health')
  })

  it('renders Storybook link', () => {
    render(<Home />)
    const link = screen.getByRole('link', { name: /storybook/i })
    expect(link).toHaveAttribute('target', '_blank')
  })
})
