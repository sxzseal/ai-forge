export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          --help
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Built with ai-forge
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <a
            href="/api/health"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            API Health
          </a>
          <a
            href="http://localhost:6006"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Storybook
          </a>
        </div>
      </div>
    </main>
  )
}
