export default function HealthCheck() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">✅ App is Running</h1>
        <p className="text-muted-foreground">
          Next.js app is deployed and working correctly.
        </p>
        <div className="mt-8 text-sm text-muted-foreground">
          <p>Environment: {process.env.NODE_ENV}</p>
          <p>Database: {process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}</p>
          <p>Auth Secret: {process.env.AUTH_SECRET ? '✅ Set' : '❌ Not set'}</p>
        </div>
      </div>
    </div>
  )
}