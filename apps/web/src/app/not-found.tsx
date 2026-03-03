export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold bg-gradient-to-r from-accent-pink to-accent-purple bg-clip-text text-transparent mb-4">
          404
        </p>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Page not found
        </h1>
        <p className="text-text-secondary text-base mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a
          href="/auth/login"
          className="bg-accent-purple text-white font-semibold rounded-full px-6 py-2.5 text-sm hover:bg-accent-pink transition-all duration-200"
        >
          Go to login
        </a>
      </div>
    </main>
  );
}
